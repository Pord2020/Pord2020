export const appMode = () =>
  process.env.APP_MODE === 'live' ? ('live' as const) : ('sandbox' as const);
export function appUrl() {
  const value = process.env.APP_URL;
  if (!value && process.env.NODE_ENV === 'production')
    throw new Error('APP_URL is required in production');
  return new URL(value || 'http://localhost:3000').origin;
}
export function capabilities() {
  return {
    mode: appMode(),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    // Collection stays closed until the live payout/refund operational release is complete.
    livePayments: false,
    paymentReason: 'LIVE_PAYOUT_OPERATIONS_PENDING',
    collectionProvider: 'mercadopago',
    payoutProvider: 'paypal',
    operatingCountry: 'CL',
  };
}
