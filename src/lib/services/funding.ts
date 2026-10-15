import type { Database } from '../db';
import type { Actor } from './auth';
import type { Quote } from '../domain/money';
import { quote } from '../domain/money';
import { requireThat } from '../domain/errors';
import { appMode } from '../config';
import { journal, audit } from './journal';

export async function createPayment(
  db: Database,
  actor: Actor,
  studyId: string,
  provider: 'sandbox' | 'stripe' | 'mercadopago',
) {
  return db.transaction(async (tx) => {
    const [study] = await tx.query<{
      founder_id: string;
      status: string;
      app_mode: string;
      reward_cents: number;
      seats: number;
    }>('SELECT * FROM studies WHERE id=$1 FOR UPDATE', [studyId]);
    requireThat(
      study && study.founder_id === actor.id && study.app_mode === appMode(),
      'NOT_FOUND',
      404,
    );
    requireThat(study.status === 'draft', 'STUDY_ALREADY_FUNDED', 409);
    const q = quote({ rewardCents: study.reward_cents, seats: study.seats });
    const [row] = await tx.query<{ id: string; expires_at: Date }>(
      `INSERT INTO payments(study_id,provider,quote,total_cents,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 minutes') RETURNING id,expires_at`,
      [studyId, provider, JSON.stringify(q), q.totalCents],
    );
    return { ...row, quote: q };
  });
}

export async function completePayment(
  db: Database,
  input: {
    paymentId: string;
    provider: 'sandbox' | 'stripe' | 'mercadopago';
    eventId: string;
    providerId: string;
    amountMinor: number;
    currency: string;
  },
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const [payment] = await tx.query<{
      id: string;
      study_id: string;
      provider: string;
      status: string;
      total_cents: number;
      currency: string;
      collection_currency: string;
      collection_amount_minor: number | null;
      quote: Quote;
      expires_at: Date;
      provider_id: string | null;
      study_status: string;
    }>(
      `SELECT p.*,s.status AS study_status FROM payments p JOIN studies s ON s.id=p.study_id WHERE p.id=$1 FOR UPDATE OF p,s`,
      [input.paymentId],
    );
    requireThat(payment && payment.provider === input.provider, 'PAYMENT_NOT_FOUND', 404);
    requireThat(
      input.currency.toUpperCase() === payment.collection_currency &&
        input.amountMinor === (payment.collection_amount_minor ?? payment.total_cents),
      'PAYMENT_MISMATCH',
      400,
    );
    requireThat(
      !payment.provider_id || payment.provider_id === input.providerId,
      'PAYMENT_MISMATCH',
      400,
    );
    const event = await tx.query(
      'INSERT INTO webhook_events(provider,event_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id',
      [input.provider, input.eventId],
    );
    if (!event.length || payment.status === 'succeeded') return { status: 'duplicate' };
    if (
      new Date(payment.expires_at).getTime() < now.getTime() ||
      payment.study_status !== 'draft'
    ) {
      await tx.query("UPDATE payments SET status='exception',provider_id=$1 WHERE id=$2", [
        input.providerId,
        payment.id,
      ]);
      await audit(tx, null, 'payment.requires_reconciliation', payment.id);
      return { status: 'exception' };
    }
    const q = payment.quote;
    requireThat(
      q.totalCents === payment.total_cents &&
        q.rewardBudgetCents +
          q.serviceFeeCents +
          q.payoutReserveCents +
          q.riskReserveCents +
          q.collectionEstimateCents ===
          q.totalCents,
      'INVALID_STORED_QUOTE',
      409,
    );
    await journal(tx, payment.study_id, `fund:${payment.id}`, 'funding', [
      { account: 'processor_clearing', amountCents: q.totalCents },
      { account: 'study_liability', amountCents: -q.rewardBudgetCents },
      { account: 'platform_fee', amountCents: -q.serviceFeeCents },
      { account: 'payout_reserve', amountCents: -q.payoutReserveCents },
      { account: 'risk_reserve', amountCents: -q.riskReserveCents },
      { account: 'processing_reserve', amountCents: -q.collectionEstimateCents },
    ]);
    await tx.query("UPDATE payments SET status='succeeded',provider_id=$1 WHERE id=$2", [
      input.providerId,
      payment.id,
    ]);
    await tx.query("UPDATE studies SET status='recruiting',funded_cents=$1 WHERE id=$2", [
      q.totalCents,
      payment.study_id,
    ]);
    await audit(tx, null, 'study.funded', payment.study_id);
    return { status: 'funded' };
  });
}
export async function sandboxFund(db: Database, actor: Actor, studyId: string) {
  requireThat(appMode() === 'sandbox', 'SANDBOX_ONLY', 403);
  const p = await createPayment(db, actor, studyId, 'sandbox');
  return completePayment(db, {
    paymentId: p.id,
    provider: 'sandbox',
    eventId: `sandbox:${p.id}`,
    providerId: `sandbox:${p.id}`,
    amountMinor: p.quote.totalCents,
    currency: 'USD',
  });
}
