import { requireThat } from './errors';
/** Rate is CLP per USD with four fractional digits; CLP collection has no centavos. */
export function parseUsdClpRate(value: string) {
  const parts = /^(\d{1,4})(?:\.(\d{1,4}))?$/.exec(value);
  requireThat(parts, 'FX_RATE_UNAVAILABLE', 503);
  const scaled = Number(parts[1]) * 10000 + Number((parts[2] || '').padEnd(4, '0'));
  requireThat(scaled >= 100 * 10000 && scaled <= 9999 * 10000, 'FX_RATE_UNAVAILABLE', 503);
  return scaled;
}
export function collectionQuote(usdCents: number, rate: string) {
  requireThat(Number.isSafeInteger(usdCents) && usdCents > 0, 'INVALID_MONEY');
  const rateScaled = parseUsdClpRate(rate);
  const numerator = usdCents * rateScaled;
  requireThat(Number.isSafeInteger(numerator), 'INVALID_MONEY');
  return { currency: 'CLP' as const, amountMinor: Math.ceil(numerator / 1000000), rateScaled };
}
export function usdCents(value: string) {
  const parts = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  requireThat(parts, 'INVALID_PROVIDER_AMOUNT', 502);
  const amount = Number(parts[1]) * 100 + Number((parts[2] || '').padEnd(2, '0'));
  requireThat(Number.isSafeInteger(amount), 'INVALID_PROVIDER_AMOUNT', 502);
  return amount;
}
