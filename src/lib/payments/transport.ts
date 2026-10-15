import { DomainError } from '../domain/errors';
export type Transport = (url: string, init?: RequestInit) => Promise<Response>;
export const transport: Transport = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(15000), cache: 'no-store' });
export async function providerJson(response: Response) {
  if (!response.ok) throw new DomainError('PAYMENT_PROVIDER_FAILURE', 502);
  return response.json();
}
