import { z } from 'zod';
import { requireThat } from '../domain/errors';
import { usdCents } from '../domain/fx';
import { providerJson, transport, type Transport } from './transport';

/** Server-only client. Actual credentials belong in Railway's secure variables. */
export class PayPalPayoutAdapter {
  private accessToken?: string;
  private base: string;
  constructor(
    private clientId: string,
    private clientSecret: string,
    environment: 'sandbox' | 'live' = 'sandbox',
    private http: Transport = transport,
  ) {
    this.base =
      environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }
  private async headers() {
    if (!this.accessToken) {
      const result = await providerJson(
        await this.http(`${this.base}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        }),
      );
      this.accessToken = z.object({ access_token: z.string().min(1) }).parse(result).access_token;
    }
    return { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' };
  }
  async send(input: { rewardId: string; email: string; amountCents: number }) {
    requireThat(Number.isSafeInteger(input.amountCents) && input.amountCents > 0, 'INVALID_MONEY');
    const result = await providerJson(
      await this.http(`${this.base}/v1/payments/payouts`, {
        method: 'POST',
        headers: { ...(await this.headers()), 'PayPal-Request-Id': input.rewardId },
        body: JSON.stringify({
          sender_batch_header: {
            sender_batch_id: input.rewardId,
            email_subject: 'Your Pilotlane study reward',
          },
          items: [
            {
              recipient_type: 'EMAIL',
              amount: { value: (input.amountCents / 100).toFixed(2), currency: 'USD' },
              receiver: input.email,
              sender_item_id: input.rewardId,
              note: 'Reward for your completed Pilotlane testing study.',
            },
          ],
        }),
      }),
    );
    return z
      .object({ batch_header: z.object({ payout_batch_id: z.string().regex(/^[A-Za-z0-9_-]+$/) }) })
      .parse(result).batch_header.payout_batch_id;
  }
  async inspect(
    batchId: string,
    expected: { rewardId: string; email: string; amountCents: number },
  ) {
    requireThat(/^[A-Za-z0-9_-]{1,128}$/.test(batchId), 'INVALID_PAYOUT_ID');
    const result = await providerJson(
      await this.http(
        `${this.base}/v1/payments/payouts/${encodeURIComponent(batchId)}?page_size=1000`,
        { headers: await this.headers() },
      ),
    );
    const data = z
      .object({
        batch_header: z.object({ batch_status: z.string() }),
        items: z
          .array(
            z.object({
              transaction_status: z.string(),
              payout_item: z.object({
                sender_item_id: z.string(),
                receiver: z.string(),
                amount: z.object({ value: z.string(), currency: z.string() }),
              }),
            }),
          )
          .optional(),
      })
      .parse(result);
    const item = data.items?.find((i) => i.payout_item.sender_item_id === expected.rewardId);
    if (!item) return { status: 'pending' as const };
    requireThat(
      item.payout_item.receiver.toLowerCase() === expected.email.toLowerCase() &&
        item.payout_item.amount.currency === 'USD' &&
        usdCents(item.payout_item.amount.value) === expected.amountCents,
      'PAYOUT_MISMATCH',
      502,
    );
    if (item.transaction_status === 'SUCCESS') return { status: 'paid' as const };
    if (
      ['DENIED', 'FAILED', 'BLOCKED', 'RETURNED', 'REFUNDED', 'REVERSED'].includes(
        item.transaction_status,
      )
    )
      return { status: 'failed' as const };
    return { status: 'pending' as const };
  }
}
