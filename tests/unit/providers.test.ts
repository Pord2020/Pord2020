import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyMercadoPagoSignature, MercadoPagoAdapter } from '@/lib/payments/mercadopago';
import { PayPalPayoutAdapter } from '@/lib/payments/paypal';
import { collectionQuote, parseUsdClpRate, usdCents } from '@/lib/domain/fx';

const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
describe('Chile collection and international payout provider contracts', () => {
  it('verifies Mercado Pago signatures, binds the payment ID, and rejects stale replays', () => {
    const secret = 'local-webhook-test-only';
    const now = Date.now();
    const ts = String(now);
    const requestId = 'request-local';
    const dataId = '987654321';
    const signature = `ts=${ts},v1=${createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex')}`;
    expect(() =>
      verifyMercadoPagoSignature({ dataId, requestId, signature }, secret, now),
    ).not.toThrow();
    expect(() =>
      verifyMercadoPagoSignature({ dataId: '123', requestId, signature }, secret, now),
    ).toThrow('INVALID_SIGNATURE');
    expect(() =>
      verifyMercadoPagoSignature({ dataId, requestId, signature }, secret, now + 11 * 60000),
    ).toThrow('INVALID_SIGNATURE');
    expect(() =>
      verifyMercadoPagoSignature({ dataId, requestId, signature: 'ts=0,v1=bad' }, secret, now),
    ).toThrow('INVALID_SIGNATURE');
  });
  it('freezes an exact CLP collection amount without floating-point cents', () => {
    expect(collectionQuote(39990, '950')).toEqual({
      currency: 'CLP',
      amountMinor: 379905,
      rateScaled: 9500000,
    });
    expect(collectionQuote(501, '950.1234').amountMinor).toBe(4761);
    expect(() => parseUsdClpRate('')).toThrow();
    expect(() => parseUsdClpRate('950.12345')).toThrow();
    expect(usdCents('15.00')).toBe(1500);
    expect(usdCents('15.9')).toBe(1590);
    expect(() => usdCents('15.001')).toThrow();
  });
  it('reads Mercado Pago status from its API rather than trusting a webhook body or redirect', async () => {
    const http = vi
      .fn()
      .mockResolvedValue(
        response({
          id: 123,
          status: 'approved',
          external_reference: 'local-reference',
          currency_id: 'CLP',
          transaction_amount: 379905,
          live_mode: false,
        }),
      );
    const adapter = new MercadoPagoAdapter('test-token', http);
    expect((await adapter.payment('123')).status).toBe('approved');
    expect(http.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/payments/123');
    await expect(adapter.payment('../other-host')).rejects.toThrow();
  });
  it('sends a stable PayPal batch key and does not treat a batch response as a paid item', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(response({ access_token: 'local-token' }))
      .mockResolvedValueOnce(response({ batch_header: { payout_batch_id: 'BATCH_LOCAL' } }))
      .mockResolvedValueOnce(
        response({
          batch_header: { batch_status: 'SUCCESS' },
          items: [
            {
              transaction_status: 'PENDING',
              payout_item: {
                sender_item_id: 'reward-local',
                receiver: 'tester@example.com',
                amount: { value: '15.00', currency: 'USD' },
              },
            },
          ],
        }),
      );
    const adapter = new PayPalPayoutAdapter('local-client', 'local-secret', 'sandbox', http);
    const expected = { rewardId: 'reward-local', email: 'tester@example.com', amountCents: 1500 };
    expect(await adapter.send(expected)).toBe('BATCH_LOCAL');
    const sent = JSON.parse(http.mock.calls[1][1].body as string);
    expect(sent.sender_batch_header.sender_batch_id).toBe(expected.rewardId);
    expect(sent.items[0].amount.value).toBe('15.00');
    expect((await adapter.inspect('BATCH_LOCAL', expected)).status).toBe('pending');
  });
  it('rejects a confirmed PayPal item with an unexpected amount or recipient', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(response({ access_token: 'local-token' }))
      .mockResolvedValue(
        response({
          batch_header: { batch_status: 'SUCCESS' },
          items: [
            {
              transaction_status: 'SUCCESS',
              payout_item: {
                sender_item_id: 'reward-local',
                receiver: 'someone-else@example.com',
                amount: { value: '15.00', currency: 'USD' },
              },
            },
          ],
        }),
      );
    const adapter = new PayPalPayoutAdapter('local-client', 'local-secret', 'sandbox', http);
    await expect(
      adapter.inspect('BATCH_LOCAL', {
        rewardId: 'reward-local',
        email: 'tester@example.com',
        amountCents: 1500,
      }),
    ).rejects.toThrow('PAYOUT_MISMATCH');
  });
});
