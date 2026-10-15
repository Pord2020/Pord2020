import type { Database } from '../db';
import { PayPalPayoutAdapter } from '../payments/paypal';
import { requireThat } from '../domain/errors';
import { journal, audit } from './journal';

type PayPalPort = Pick<PayPalPayoutAdapter, 'send' | 'inspect'>;
export async function processPayPalReward(
  db: Database,
  provider: PayPalPort,
  rewardId: string,
  mode: 'sandbox' | 'live',
  now = new Date(),
) {
  const claimed = await db.transaction(async (tx) => {
    const [job] = await tx.query<{ id: string; attempts: number }>(
      `SELECT id,attempts FROM outbox WHERE operation_key=$1 AND status IN ('pending','processing') AND (lease_until IS NULL OR lease_until<$2) FOR UPDATE SKIP LOCKED`,
      [`reward:${rewardId}`, now],
    );
    if (!job) return null;
    const [reward] = await tx.query<{
      id: string;
      tester_id: string;
      study_id: string;
      amount_cents: number;
      status: string;
      provider_id: string | null;
      email: string;
      google_sub: string | null;
      app_mode: string;
    }>(
      `SELECT r.*,u.email,u.google_sub FROM rewards r JOIN users u ON u.id=r.tester_id WHERE r.id=$1 FOR UPDATE OF r`,
      [rewardId],
    );
    requireThat(reward && reward.app_mode === mode, 'PAYOUT_MODE_MISMATCH');
    requireThat(mode === 'sandbox' || reward.google_sub, 'RECIPIENT_VERIFICATION_REQUIRED', 409);
    if (reward.status === 'paid') {
      await tx.query("UPDATE outbox SET status='done',lease_until=NULL WHERE id=$1", [job.id]);
      return null;
    }
    requireThat(['pending', 'processing'].includes(reward.status), 'PAYOUT_NOT_PENDING', 409);
    await tx.query("UPDATE outbox SET status='processing',lease_until=$1 WHERE id=$2", [
      new Date(now.getTime() + 120000),
      job.id,
    ]);
    return { job, reward };
  });
  if (!claimed) return { status: 'busy' as const };
  const { reward, job } = claimed;
  try {
    const expected = { rewardId: reward.id, email: reward.email, amountCents: reward.amount_cents };
    let batchId = reward.provider_id;
    if (!batchId) {
      batchId = await provider.send(expected);
      await db.query(
        "UPDATE rewards SET provider_id=$1,status='processing' WHERE id=$2 AND status='pending'",
        [batchId, reward.id],
      );
    }
    const result = await provider.inspect(batchId, expected);
    if (result.status === 'paid') {
      await db.transaction(async (tx) => {
        const [current] = await tx.query<{ status: string }>(
          'SELECT status FROM rewards WHERE id=$1 FOR UPDATE',
          [reward.id],
        );
        if (current.status !== 'paid') {
          await journal(tx, reward.study_id, `payout:${reward.id}`, 'payout', [
            { account: `tester_payable:${reward.tester_id}`, amountCents: reward.amount_cents },
            {
              account: mode === 'live' ? 'paypal_clearing_usd' : 'sandbox_paypal_clearing',
              amountCents: -reward.amount_cents,
            },
          ]);
          await tx.query("UPDATE rewards SET status='paid',paid_at=$1 WHERE id=$2", [
            now,
            reward.id,
          ]);
          await audit(
            tx,
            null,
            mode === 'live' ? 'paypal.payout.confirmed' : 'sandbox.paypal.payout.confirmed',
            reward.id,
          );
        }
        await tx.query("UPDATE outbox SET status='done',lease_until=NULL WHERE id=$1", [job.id]);
      });
    } else if (result.status === 'failed') {
      await db.transaction(async (tx) => {
        await tx.query("UPDATE rewards SET status='failed' WHERE id=$1", [reward.id]);
        await tx.query("UPDATE outbox SET status='failed',lease_until=NULL WHERE id=$1", [job.id]);
        await audit(tx, null, 'paypal.payout.needs_review', reward.id);
      });
    } else {
      await db.query("UPDATE outbox SET status='pending',lease_until=$1 WHERE id=$2", [
        new Date(now.getTime() + 120000),
        job.id,
      ]);
    }
    return result;
  } catch {
    // An ambiguous provider timeout must never be converted into a paid reward or a new batch key.
    await db.transaction(async (tx) => {
      await tx.query(
        "UPDATE outbox SET attempts=attempts+1,status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,lease_until=$1 WHERE id=$2",
        [new Date(now.getTime() + 120000), job.id],
      );
      if (job.attempts >= 4)
        await tx.query("UPDATE rewards SET status='failed' WHERE id=$1 AND status<>'paid'", [
          reward.id,
        ]);
      await audit(tx, null, 'paypal.payout.retry_or_reconcile', reward.id);
    });
    return { status: 'retry' as const };
  }
}

export async function runPayPalOutbox(
  db: Database,
  provider: PayPalPort,
  mode: 'sandbox' | 'live',
) {
  const jobs = await db.query<{ payload: { rewardId: string } }>(
    `SELECT payload FROM outbox WHERE kind='payout.requested' AND payload->>'mode'=$1 AND status IN ('pending','processing') AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at LIMIT 10`,
    [mode],
  );
  const outcomes = [];
  for (const job of jobs)
    outcomes.push(await processPayPalReward(db, provider, job.payload.rewardId, mode));
  return outcomes;
}
