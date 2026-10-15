import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, type Database } from '@/lib/db';
import {
  createStudy,
  applyToStudy,
  reviewApplication,
  studyDetail,
  listStudies,
} from '@/lib/services/studies';
import {
  register,
  login,
  createSession,
  sessionActor,
  revokeSession,
  type Actor,
} from '@/lib/services/auth';
import { saveProfile } from '@/lib/services/profiles';
import { createPayment, completePayment, sandboxFund } from '@/lib/services/funding';
import {
  startParticipation,
  checkIn,
  submitTask,
  submitParticipation,
  reviewParticipation,
  participationDetail,
  disputeParticipation,
} from '@/lib/services/participations';
import { sandboxPayout, wallet } from '@/lib/services/wallet';
import { processPayPalReward } from '@/lib/services/paypal-worker';
import { MercadoPagoAdapter, handleMercadoPagoPayment } from '@/lib/payments/mercadopago';
import { collectionQuote } from '@/lib/domain/fx';

let db: Database;
const password = 'correct-horse-battery-42';
const studyInput = {
  title: 'A thoughtful skincare routine',
  appName: 'Mira',
  description: 'Try onboarding and tell us what is confusing about building a daily routine.',
  platform: 'android',
  kind: 'usability',
  category: 'wellness',
  rewardCents: 1500,
  seats: 1,
  durationDays: 1,
  countries: ['CL'],
  minimumAge: 18,
  maximumAge: 60,
  gender: 'any',
  requiredInterests: ['wellness'],
  inviteUrl: 'https://play.google.com/apps/testing/dev.pilotlane.mira',
  tasks: ['Complete onboarding and describe one point of friction.'],
};
async function user(role: 'founder' | 'tester') {
  const actor = await register(db, {
    name: role === 'founder' ? 'Founder' : 'Tester',
    email: `${randomUUID()}@example.com`,
    password,
    role,
  });
  if (role === 'tester')
    await saveProfile(db, actor, {
      country: 'CL',
      age: 28,
      gender: 'woman',
      interests: ['wellness'],
      platforms: ['android'],
      matchingConsent: true,
    });
  return actor;
}
async function fixture(seats = 1, durationDays = 1) {
  const founder = await user('founder');
  const tester = await user('tester');
  const study = await createStudy(db, founder, { ...studyInput, seats, durationDays });
  await sandboxFund(db, founder, study.id);
  const application = await applyToStudy(db, tester, study.id, 'I can test every day.');
  await reviewApplication(db, founder, application.id as string, true);
  const [p] = await db.query<{ id: string }>(
    'SELECT id FROM participations WHERE application_id=$1',
    [application.id],
  );
  return { founder, tester, study, id: p.id };
}
async function completeWork(tester: Actor, id: string, durationDays = 1) {
  const start = new Date('2026-10-01T12:00:00Z');
  await startParticipation(db, tester, id, start);
  const detail = await participationDetail(db, tester, id, start);
  await submitTask(
    db,
    tester,
    id,
    detail.tasks[0].id as string,
    'The first permission screen needs a clearer explanation of why access is needed.',
  );
  for (let i = 0; i < durationDays; i++)
    await checkIn(
      db,
      tester,
      id,
      'I tested the routine and gave honest feedback.',
      new Date(start.getTime() + i * 86400000),
    );
  const end = new Date(start.getTime() + durationDays * 86400000);
  await submitParticipation(db, tester, id, end);
}

beforeAll(async () => {
  process.env.APP_MODE = 'sandbox';
  db = await createDatabase({ memory: true });
  await migrate(db);
  await migrate(db);
});
afterAll(async () => {
  await db?.close();
});

describe('identity and privacy on PostgreSQL', () => {
  it('salts passwords, authenticates, expires and revokes opaque sessions', async () => {
    const actor = await user('founder');
    const [stored] = await db.query('SELECT password_hash FROM users WHERE id=$1', [actor.id]);
    expect(stored.password_hash).not.toContain(password);
    expect((await login(db, { email: actor.email.toUpperCase(), password })).id).toBe(actor.id);
    await expect(
      login(db, { email: actor.email, password: 'wrong-password-42' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const session = await createSession(db, actor.id);
    expect((await sessionActor(db, session.token))?.id).toBe(actor.id);
    expect(await sessionActor(db, 'forged-session')).toBeNull();
    await revokeSession(db, session.token);
    expect(await sessionActor(db, session.token)).toBeNull();
  });
  it('keeps private invitation links and applicant data out of marketplace rows', async () => {
    const { founder, tester, study } = await fixture();
    expect(JSON.stringify(await listStudies(db, founder))).not.toContain(studyInput.inviteUrl);
    const detail = await studyDetail(db, tester, study.id);
    expect(JSON.stringify(detail)).not.toContain(studyInput.inviteUrl);
    expect(detail.applications).toEqual([]);
    const unrelatedFounder = await user('founder');
    await expect(studyDetail(db, unrelatedFounder, study.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const unrelated = await user('tester');
    const [p] = await db.query<{ id: string }>('SELECT id FROM participations WHERE study_id=$1', [
      study.id,
    ]);
    await expect(participationDetail(db, unrelated, p.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('funding and accounting on PostgreSQL', () => {
  it('reconciles canonical CLP collection against the frozen USD reward obligation', async () => {
    const founder = await user('founder');
    const study = await createStudy(db, founder, studyInput);
    const payment = await createPayment(db, founder, study.id, 'mercadopago');
    const collection = collectionQuote(payment.quote.totalCents, '950');
    await db.query(
      'UPDATE payments SET collection_currency=$1,collection_amount_minor=$2,fx_rate_scaled=$3 WHERE id=$4',
      ['CLP', collection.amountMinor, collection.rateScaled, payment.id],
    );
    const http = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 123456,
            status: 'approved',
            external_reference: payment.id,
            currency_id: 'CLP',
            transaction_amount: collection.amountMinor,
            live_mode: false,
          }),
          { status: 200 },
        ),
      );
    const result = await handleMercadoPagoPayment(
      db,
      new MercadoPagoAdapter('local-test-token', http),
      '123456',
      randomUUID(),
    );
    expect(result.status).toBe('funded');
    const [row] = await db.query('SELECT funded_cents FROM studies WHERE id=$1', [study.id]);
    expect(row.funded_cents).toBe(payment.quote.totalCents);
  });
  it('rejects payment amount/currency mismatches and ignores a repeated verified event', async () => {
    const founder = await user('founder');
    const study = await createStudy(db, founder, studyInput);
    const payment = await createPayment(db, founder, study.id, 'sandbox');
    const event = {
      paymentId: payment.id,
      provider: 'sandbox' as const,
      eventId: `evt_${randomUUID()}`,
      providerId: `cs_${randomUUID()}`,
      amountMinor: payment.quote.totalCents,
      currency: 'USD',
    };
    await expect(
      completePayment(db, { ...event, amountMinor: event.amountMinor - 1 }),
    ).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });
    await expect(completePayment(db, { ...event, currency: 'EUR' })).rejects.toMatchObject({
      code: 'PAYMENT_MISMATCH',
    });
    expect(await completePayment(db, event)).toEqual({ status: 'funded' });
    expect(await completePayment(db, event)).toEqual({ status: 'duplicate' });
    expect(await completePayment(db, { ...event, eventId: `evt_${randomUUID()}` })).toEqual({
      status: 'duplicate',
    });
    const [count] = await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM journal_transactions WHERE study_id=$1',
      [study.id],
    );
    expect(count.count).toBe(1);
  });
  it('holds late payments for reconciliation instead of starting unpriced work', async () => {
    const founder = await user('founder');
    const study = await createStudy(db, founder, studyInput);
    const payment = await createPayment(db, founder, study.id, 'sandbox');
    const result = await completePayment(
      db,
      {
        paymentId: payment.id,
        provider: 'sandbox',
        eventId: `evt_${randomUUID()}`,
        providerId: `cs_${randomUUID()}`,
        amountMinor: payment.quote.totalCents,
        currency: 'USD',
      },
      new Date(Date.now() + 3600000),
    );
    expect(result.status).toBe('exception');
    const [row] = await db.query('SELECT status,funded_cents FROM studies WHERE id=$1', [study.id]);
    expect(row.status).toBe('draft');
    expect(row.funded_cents).toBe(0);
  });
  it('enforces balanced and immutable journals at the database boundary', async () => {
    const founder = await user('founder');
    const study = await createStudy(db, founder, studyInput);
    await expect(
      db.transaction(async (tx) => {
        const [j] = await tx.query(
          'INSERT INTO journal_transactions(study_id,reference,kind) VALUES($1,$2,$3) RETURNING id',
          [study.id, randomUUID(), 'funding'],
        );
        await tx.query(
          'INSERT INTO journal_entries(transaction_id,account,amount_cents) VALUES($1,$2,$3)',
          [j.id, 'broken', 100],
        );
      }),
    ).rejects.toThrow('Unbalanced journal');
    await sandboxFund(db, founder, study.id);
    await expect(
      db.query(
        'UPDATE journal_entries SET amount_cents=1 WHERE transaction_id IN (SELECT id FROM journal_transactions WHERE study_id=$1)',
        [study.id],
      ),
    ).rejects.toThrow('append-only');
  });
});

describe('matching, capacity and work lifecycle', () => {
  it('rejects ineligible direct applications and duplicate applications', async () => {
    const founder = await user('founder');
    const tester = await user('tester');
    const study = await createStudy(db, founder, studyInput);
    await expect(applyToStudy(db, tester, study.id, '')).rejects.toMatchObject({
      code: 'STUDY_NOT_RECRUITING',
    });
    await sandboxFund(db, founder, study.id);
    await saveProfile(db, tester, {
      country: 'US',
      age: 28,
      gender: 'woman',
      interests: ['wellness'],
      platforms: ['android'],
      matchingConsent: true,
    });
    await expect(applyToStudy(db, tester, study.id, '')).rejects.toMatchObject({
      code: 'PROFILE_NOT_ELIGIBLE',
    });
    await saveProfile(db, tester, {
      country: 'CL',
      age: 28,
      gender: 'woman',
      interests: ['wellness'],
      platforms: ['android'],
      matchingConsent: true,
    });
    await applyToStudy(db, tester, study.id, '');
    await expect(applyToStudy(db, tester, study.id, '')).rejects.toMatchObject({
      code: 'ALREADY_APPLIED',
    });
  });
  it('reserves only one seat when the founder concurrently accepts two applicants', async () => {
    const founder = await user('founder');
    const study = await createStudy(db, founder, studyInput);
    await sandboxFund(db, founder, study.id);
    const testers = await Promise.all([user('tester'), user('tester')]);
    const apps = await Promise.all(testers.map((t) => applyToStudy(db, t, study.id, '')));
    const results = await Promise.allSettled(
      apps.map((a) => reviewApplication(db, founder, a.id as string, true)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const [count] = await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM participations WHERE study_id=$1',
      [study.id],
    );
    expect(count.count).toBe(1);
  });
  it('requires elapsed time, daily evidence, and feedback before review', async () => {
    const { founder, tester, id } = await fixture();
    await expect(reviewParticipation(db, founder, id, true, 'Good work.')).rejects.toMatchObject({
      code: 'INVALID_PARTICIPATION_STATE',
    });
    await startParticipation(db, tester, id);
    await checkIn(db, tester, id, 'I tested onboarding today.');
    await expect(checkIn(db, tester, id, 'Another click today.')).rejects.toMatchObject({
      code: 'ALREADY_CHECKED_IN',
    });
    await expect(submitParticipation(db, tester, id)).rejects.toMatchObject({
      code: 'REQUIREMENTS_INCOMPLETE',
    });
    const other = await fixture();
    const task = (await participationDetail(db, other.tester, other.id)).tasks[0].id as string;
    await expect(submitTask(db, tester, id, task, 'Unrelated task answer.')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('completes fourteen days, creates one obligation, and never pays twice', async () => {
    const { founder, tester, study, id } = await fixture(12, 14);
    await completeWork(tester, id, 14);
    await expect(reviewParticipation(db, tester, id, true, 'Approve myself')).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );
    await reviewParticipation(db, founder, id, true, 'Thank you for your detailed feedback.');
    await expect(reviewParticipation(db, founder, id, true, '')).rejects.toMatchObject({
      code: 'INVALID_PARTICIPATION_STATE',
    });
    const balance = await wallet(db, tester);
    expect(balance.pendingCents).toBe(1500);
    expect(balance.paidCents).toBe(0);
    const rewardId = balance.rewards[0].id as string;
    expect((await sandboxPayout(db, tester, rewardId)).status).toBe('simulated');
    expect((await sandboxPayout(db, tester, rewardId)).status).toBe('duplicate');
    expect((await wallet(db, tester)).paidCents).toBe(1500);
    const [sum] = await db.query<{ balance: number }>(
      'SELECT sum(e.amount_cents)::int AS balance FROM journal_entries e JOIN journal_transactions j ON j.id=e.transaction_id WHERE j.study_id=$1',
      [study.id],
    );
    expect(sum.balance).toBe(0);
  });
  it('lets a tester dispute a rejection without releasing funds', async () => {
    const { founder, tester, id } = await fixture();
    await completeWork(tester, id);
    await reviewParticipation(
      db,
      founder,
      id,
      false,
      'Please provide more detail about onboarding.',
    );
    await disputeParticipation(
      db,
      tester,
      id,
      'I completed all agreed tasks and can supply additional context.',
    );
    expect((await participationDetail(db, tester, id)).participation.status).toBe('disputed');
    expect((await wallet(db, tester)).pendingCents).toBe(0);
  });
  it('fails closed for live payment/payout attempts', async () => {
    process.env.APP_MODE = 'live';
    try {
      await expect(
        sandboxPayout(db, { id: randomUUID() } as Actor, randomUUID()),
      ).rejects.toMatchObject({ code: 'LIVE_PAYOUT_UNAVAILABLE' });
    } finally {
      process.env.APP_MODE = 'sandbox';
    }
  });
  it('waits for an individually confirmed PayPal item and cannot send or account for it twice', async () => {
    const { founder, tester, id } = await fixture();
    await completeWork(tester, id);
    await reviewParticipation(db, founder, id, true, 'Completed as agreed.');
    const reward = (await wallet(db, tester)).rewards[0];
    const provider = {
      send: vi.fn().mockResolvedValue(`BATCH_${reward.id}`),
      inspect: vi
        .fn()
        .mockResolvedValueOnce({ status: 'pending' as const })
        .mockResolvedValue({ status: 'paid' as const }),
    };
    const now = new Date();
    expect(
      (await processPayPalReward(db, provider, reward.id as string, 'sandbox', now)).status,
    ).toBe('pending');
    expect((await wallet(db, tester)).paidCents).toBe(0);
    expect(
      (await processPayPalReward(db, provider, reward.id as string, 'sandbox', now)).status,
    ).toBe('busy');
    expect(
      (
        await processPayPalReward(
          db,
          provider,
          reward.id as string,
          'sandbox',
          new Date(now.getTime() + 180000),
        )
      ).status,
    ).toBe('paid');
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect((await wallet(db, tester)).paidCents).toBe(1500);
    await processPayPalReward(
      db,
      provider,
      reward.id as string,
      'sandbox',
      new Date(now.getTime() + 360000),
    );
    expect(provider.send).toHaveBeenCalledTimes(1);
    const [entries] = await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM journal_transactions WHERE reference=$1',
      [`payout:${reward.id}`],
    );
    expect(entries.count).toBe(1);
  });
  it('keeps an ambiguous provider timeout pending and retries the same reward identity', async () => {
    const { founder, tester, id } = await fixture();
    await completeWork(tester, id);
    await reviewParticipation(db, founder, id, true, 'Completed as agreed.');
    const reward = (await wallet(db, tester)).rewards[0];
    const provider = {
      send: vi
        .fn()
        .mockRejectedValueOnce(new Error('provider timeout'))
        .mockResolvedValue(`BATCH_${reward.id}`),
      inspect: vi.fn().mockResolvedValue({ status: 'paid' as const }),
    };
    const now = new Date();
    expect(
      (await processPayPalReward(db, provider, reward.id as string, 'sandbox', now)).status,
    ).toBe('retry');
    expect((await wallet(db, tester)).paidCents).toBe(0);
    await processPayPalReward(
      db,
      provider,
      reward.id as string,
      'sandbox',
      new Date(now.getTime() + 180000),
    );
    expect(provider.send.mock.calls[0][0].rewardId).toBe(reward.id);
    expect(provider.send.mock.calls[1][0].rewardId).toBe(reward.id);
    expect((await wallet(db, tester)).paidCents).toBe(1500);
  });
});
