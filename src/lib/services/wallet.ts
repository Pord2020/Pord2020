import type { Database } from '../db';
import type { Actor } from './auth';
import { appMode } from '../config';
import { requireThat } from '../domain/errors';
import { journal, audit } from './journal';

export async function wallet(db: Database, actor: Actor) {
  const rewards = await db.query(
    `SELECT r.id,r.amount_cents,r.status,r.app_mode,r.created_at,r.paid_at,s.app_name,s.title
    FROM rewards r JOIN studies s ON s.id=r.study_id WHERE r.tester_id=$1 AND r.app_mode=$2 ORDER BY r.created_at DESC`,
    [actor.id, appMode()],
  );
  return {
    rewards,
    pendingCents: rewards
      .filter((r) => r.status !== 'paid')
      .reduce((sum, r) => sum + Number(r.amount_cents), 0),
    paidCents: rewards
      .filter((r) => r.status === 'paid')
      .reduce((sum, r) => sum + Number(r.amount_cents), 0),
  };
}
export async function sandboxPayout(db: Database, actor: Actor, rewardId: string) {
  requireThat(appMode() === 'sandbox', 'LIVE_PAYOUT_UNAVAILABLE', 503);
  return db.transaction(async (tx) => {
    const [reward] = await tx.query<{
      id: string;
      study_id: string;
      tester_id: string;
      amount_cents: number;
      status: string;
      app_mode: string;
    }>('SELECT * FROM rewards WHERE id=$1 FOR UPDATE', [rewardId]);
    requireThat(
      reward && reward.tester_id === actor.id && reward.app_mode === 'sandbox',
      'NOT_FOUND',
      404,
    );
    if (reward.status === 'paid') return { status: 'duplicate' };
    requireThat(reward.status === 'pending', 'PAYOUT_NOT_PENDING', 409);
    await journal(tx, reward.study_id, `payout:${reward.id}`, 'payout', [
      { account: `tester_payable:${reward.tester_id}`, amountCents: reward.amount_cents },
      { account: 'processor_clearing', amountCents: -reward.amount_cents },
    ]);
    await tx.query("UPDATE rewards SET status='paid',paid_at=now(),provider_id=$1 WHERE id=$2", [
      `sandbox:${reward.id}`,
      reward.id,
    ]);
    await tx.query("UPDATE outbox SET status='done',attempts=attempts+1 WHERE operation_key=$1", [
      `reward:${reward.id}`,
    ]);
    await audit(tx, actor.id, 'sandbox.payout.simulated', reward.id);
    return { status: 'simulated' };
  });
}
