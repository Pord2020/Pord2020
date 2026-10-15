import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { appUrl, capabilities } from '../config';
import { requireThat } from '../domain/errors';
import { collectionQuote } from '../domain/fx';
import type { Database } from '../db';
import type { Actor } from '../services/auth';
import { createPayment, completePayment } from '../services/funding';
import { transport, providerJson, type Transport } from './transport';

const providerPayment = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  status: z.string(),
  external_reference: z.string(),
  currency_id: z.string(),
  transaction_amount: z.number(),
  live_mode: z.boolean(),
});
export class MercadoPagoAdapter {
  constructor(
    private token: string,
    private http: Transport = transport,
  ) {}
  async createCheckout(input: {
    paymentId: string;
    amountClp: number;
    title: string;
    locale: string;
  }) {
    const data = await providerJson(
      await this.http('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': input.paymentId,
        },
        body: JSON.stringify({
          external_reference: input.paymentId,
          items: [
            {
              id: input.paymentId,
              title: input.title,
              quantity: 1,
              currency_id: 'CLP',
              unit_price: input.amountClp,
            },
          ],
          back_urls: {
            success: `${appUrl()}/${input.locale}/workspace?payment=processing`,
            pending: `${appUrl()}/${input.locale}/workspace?payment=processing`,
            failure: `${appUrl()}/${input.locale}/workspace?payment=canceled`,
          },
          auto_return: 'approved',
          notification_url: `${appUrl()}/api/webhooks/mercadopago`,
          statement_descriptor: 'PILOTLANE',
        }),
      }),
    );
    const result = z.object({ id: z.string(), init_point: z.url() }).parse(data);
    const url = new URL(result.init_point);
    requireThat(
      url.protocol === 'https:' &&
        (url.hostname === 'www.mercadopago.cl' || url.hostname === 'www.mercadopago.com'),
      'INVALID_PROVIDER_REDIRECT',
      502,
    );
    return result;
  }
  async payment(id: string) {
    requireThat(/^[a-zA-Z0-9_-]{1,128}$/.test(id), 'INVALID_PAYMENT_ID');
    return providerPayment.parse(
      await providerJson(
        await this.http(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${this.token}` },
        }),
      ),
    );
  }
}
export function verifyMercadoPagoSignature(
  input: { dataId: string; requestId: string; signature: string },
  secret: string,
  now = Date.now(),
) {
  requireThat(
    /^[a-zA-Z0-9_-]{1,128}$/.test(input.dataId) &&
      input.requestId.length > 0 &&
      input.requestId.length <= 200,
    'INVALID_SIGNATURE',
  );
  const parts = new Map<string, string>(
    input.signature.split(',').map((part) => {
      const [key, value] = part.trim().split('=', 2);
      return [key, value] as [string, string];
    }),
  );
  const timestamp = parts.get('ts'),
    signature = parts.get('v1');
  requireThat(
    timestamp && /^\d{10,13}$/.test(timestamp) && signature && /^[a-fA-F0-9]{64}$/.test(signature),
    'INVALID_SIGNATURE',
  );
  const instant = timestamp.length > 10 ? Number(timestamp) : Number(timestamp) * 1000;
  requireThat(Math.abs(now - instant) <= 10 * 60000, 'INVALID_SIGNATURE');
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${timestamp};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  requireThat(timingSafeEqual(expected, Buffer.from(signature, 'hex')), 'INVALID_SIGNATURE');
}
export async function mercadoPagoCheckout(db: Database, actor: Actor, studyId: string) {
  requireThat(capabilities().livePayments, 'LIVE_PAYOUT_OPERATIONS_PENDING', 503);
  requireThat(
    process.env.MERCADOPAGO_ACCESS_TOKEN && process.env.USD_CLP_RATE,
    'PAYMENT_PROVIDER_UNAVAILABLE',
    503,
  );
  const payment = await createPayment(db, actor, studyId, 'mercadopago');
  const collection = collectionQuote(payment.quote.totalCents, process.env.USD_CLP_RATE);
  await db.query(
    'UPDATE payments SET collection_currency=$1,collection_amount_minor=$2,fx_rate_scaled=$3 WHERE id=$4',
    ['CLP', collection.amountMinor, collection.rateScaled, payment.id],
  );
  const checkout = await new MercadoPagoAdapter(
    process.env.MERCADOPAGO_ACCESS_TOKEN,
  ).createCheckout({
    paymentId: payment.id,
    amountClp: collection.amountMinor,
    title: 'Pilotlane · estudio de pruebas',
    locale: actor.locale,
  });
  await db.query('UPDATE payments SET checkout_id=$1 WHERE id=$2', [checkout.id, payment.id]);
  return { url: checkout.init_point, collection };
}
export async function handleMercadoPagoPayment(
  db: Database,
  adapter: MercadoPagoAdapter,
  providerId: string,
  eventId: string,
) {
  const payment = await adapter.payment(providerId);
  if (payment.status !== 'approved') return { status: 'pending' };
  const id = z.uuid().parse(payment.external_reference);
  const [stored] = await db.query<{ app_mode: string }>(
    'SELECT s.app_mode FROM payments p JOIN studies s ON s.id=p.study_id WHERE p.id=$1',
    [id],
  );
  requireThat(
    stored && payment.live_mode === (stored.app_mode === 'live'),
    'PAYMENT_MODE_MISMATCH',
  );
  requireThat(Number.isSafeInteger(payment.transaction_amount), 'INVALID_PROVIDER_AMOUNT', 502);
  return completePayment(db, {
    paymentId: id,
    provider: 'mercadopago',
    eventId,
    providerId: payment.id,
    amountMinor: payment.transaction_amount,
    currency: payment.currency_id,
  });
}
