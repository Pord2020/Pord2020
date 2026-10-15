import { z } from 'zod';

export const quoteInput = z.object({
  rewardCents: z.number().int().min(500).max(50000),
  seats: z.number().int().min(1).max(200),
});
export const feePolicy = Object.freeze({
  version: 'usd-2026-10-v1',
  serviceBps: 2000,
  minimumServiceCents: 1200,
  payoutBps: 200,
  payoutPerTesterCents: 25,
  riskBps: 300,
  collectionBps: 490,
  collectionFixedCents: 30,
});
const ceilBps = (amount: number, bps: number) => Math.ceil((amount * bps) / 10000);

export function quote(input: z.infer<typeof quoteInput>) {
  const { rewardCents, seats } = quoteInput.parse(input);
  const rewardBudgetCents = rewardCents * seats;
  const serviceFeeCents = Math.max(
    feePolicy.minimumServiceCents,
    ceilBps(rewardBudgetCents, feePolicy.serviceBps),
  );
  const payoutReserveCents =
    ceilBps(rewardBudgetCents, feePolicy.payoutBps) + seats * feePolicy.payoutPerTesterCents;
  const riskReserveCents = ceilBps(rewardBudgetCents, feePolicy.riskBps);
  const subtotal = rewardBudgetCents + serviceFeeCents + payoutReserveCents + riskReserveCents;
  const totalCents = Math.ceil(
    ((subtotal + feePolicy.collectionFixedCents) * 10000) / (10000 - feePolicy.collectionBps),
  );
  return {
    policyVersion: feePolicy.version,
    currency: 'USD' as const,
    rewardCents,
    seats,
    rewardBudgetCents,
    serviceFeeCents,
    payoutReserveCents,
    riskReserveCents,
    collectionEstimateCents: totalCents - subtotal,
    totalCents,
  };
}
export type Quote = ReturnType<typeof quote>;
