import { database } from '../src/lib/db';
import { appMode } from '../src/lib/config';
import { PayPalPayoutAdapter } from '../src/lib/payments/paypal';
import { runPayPalOutbox } from '../src/lib/services/paypal-worker';

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
const mode = appMode();
if (mode === 'live' && process.env.LIVE_PAYOUTS_READY !== 'true')
  throw new Error('Live payout operations are not enabled.');
if (mode === 'live' && process.env.PAYPAL_ENVIRONMENT !== 'live')
  throw new Error('PayPal environment mismatch.');
if (mode === 'sandbox' && process.env.PAYPAL_ENVIRONMENT === 'live')
  throw new Error('A sandbox workspace cannot use live PayPal.');
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)
  throw new Error('PayPal application credentials are required.');
const db = await database();
try {
  const provider = new PayPalPayoutAdapter(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_CLIENT_SECRET,
    mode,
  );
  const outcomes = await runPayPalOutbox(db, provider, mode);
  console.log(
    JSON.stringify({ processed: outcomes.length, outcomes: outcomes.map((o) => o.status) }),
  );
} finally {
  await db.close();
}
import nextEnv from '@next/env';
