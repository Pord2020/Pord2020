import { describe, expect, it } from 'vitest';
import { quote } from '@/lib/domain/money';
import { matches, studySchema } from '@/lib/domain/schemas';
import { progress } from '@/lib/services/participations';

describe('economic and participation invariants', () => {
  it('quotes the founder example with intact net rewards and a grossed-up collection charge', () => {
    expect(quote({ rewardCents: 1500, seats: 20 })).toEqual({
      policyVersion: 'usd-2026-10-v1',
      currency: 'USD',
      rewardCents: 1500,
      seats: 20,
      rewardBudgetCents: 30000,
      serviceFeeCents: 6000,
      payoutReserveCents: 1100,
      riskReserveCents: 900,
      collectionEstimateCents: 1990,
      totalCents: 39990,
    });
  });
  it('covers estimated percentage and fixed collection fees at pricing boundaries', () => {
    for (const rewardCents of [500, 999, 1500, 50000])
      for (const seats of [1, 12, 20, 200]) {
        const q = quote({ rewardCents, seats });
        expect(Number.isSafeInteger(q.totalCents)).toBe(true);
        expect(q.collectionEstimateCents).toBeGreaterThanOrEqual(
          Math.ceil(q.totalCents * 0.049 + 30),
        );
        expect(q.serviceFeeCents).toBeGreaterThanOrEqual(1200);
        expect(q.totalCents).toBe(
          q.rewardBudgetCents +
            q.serviceFeeCents +
            q.payoutReserveCents +
            q.riskReserveCents +
            q.collectionEstimateCents,
        );
      }
  });
  it('rejects fractional, out-of-range, and negative money/count inputs', () => {
    for (const input of [
      { rewardCents: 500.5, seats: 12 },
      { rewardCents: -1, seats: 20 },
      { rewardCents: 500, seats: 201 },
    ])
      expect(() => quote(input)).toThrow();
  });
  it('requires informed consent and all audience constraints', () => {
    const profile = {
      country: 'CL',
      age: 28,
      gender: 'woman' as const,
      interests: ['wellness' as const],
      platforms: ['android' as const],
      matchingConsent: true,
    };
    const study = {
      platform: 'android',
      countries: ['CL'],
      minimum_age: 25,
      maximum_age: 34,
      gender: 'woman',
      required_interests: ['wellness'],
    };
    expect(matches(profile, study)).toBe(true);
    expect(matches({ ...profile, matchingConsent: false }, study)).toBe(false);
    expect(matches({ ...profile, gender: 'undisclosed' }, study)).toBe(false);
    expect(matches({ ...profile, country: 'US' }, study)).toBe(false);
    expect(matches(null, study)).toBe(false);
  });
  it('does not turn UTC midnight check-ins into fourteen elapsed days', () => {
    const dates = Array.from({ length: 14 }, (_, i) => ({
      day: `2026-10-${String(i + 1).padStart(2, '0')}`,
    }));
    const result = progress(
      dates,
      '2026-10-01T23:59:00Z',
      14,
      1,
      1,
      new Date('2026-10-15T00:01:00Z'),
    );
    expect(result.streakDays).toBe(14);
    expect(result.canSubmit).toBe(false);
    expect(
      progress(dates, '2026-10-01T00:00:00Z', 14, 1, 1, new Date('2026-10-15T00:01:00Z')).canSubmit,
    ).toBe(true);
  });
  it('does not count a broken sequence as continuous activity', () => {
    const result = progress(
      [{ day: '2026-10-01' }, { day: '2026-10-03' }],
      '2026-10-01T00:00:00Z',
      2,
      1,
      1,
      new Date('2026-10-04T00:01:00Z'),
    );
    expect(result.completedDays).toBe(2);
    expect(result.streakDays).toBe(1);
    expect(result.canSubmit).toBe(false);
  });
});
