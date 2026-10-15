import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { database, type Database } from './db';
import { DomainError, requireThat } from './domain/errors';
import { sessionActor, type Actor } from './services/auth';
import { appUrl } from './config';

export const sessionCookie = 'pilotlane_session';
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
export function assertOrigin(req: NextRequest) {
  requireThat(req.headers.get('origin') === appUrl(), 'ORIGIN_DENIED', 403);
}
export async function jsonBody(req: NextRequest) {
  requireThat(
    (req.headers.get('content-type') || '').includes('application/json'),
    'JSON_REQUIRED',
    415,
  );
  try {
    return JSON.parse(await rawBody(req, 65536)) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('INVALID_JSON');
  }
}
export async function rawBody(req: NextRequest, maximum: number) {
  requireThat(Number(req.headers.get('content-length') || 0) <= maximum, 'REQUEST_TOO_LARGE', 413);
  const reader = req.body?.getReader();
  requireThat(reader, 'INVALID_JSON');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new DomainError('REQUEST_TOO_LARGE', 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function actorFor(req: NextRequest, db: Database): Promise<Actor> {
  const actor = await sessionActor(db, req.cookies.get(sessionCookie)?.value);
  requireThat(actor, 'UNAUTHENTICATED', 401);
  return actor;
}
export function clientIp(req: NextRequest) {
  if (process.env.TRUST_PROXY === '1')
    return req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
  return 'local';
}
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: 'INVALID_INPUT',
        fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  if (error instanceof DomainError)
    return NextResponse.json({ error: error.code }, { status: error.status });
  const code = (error as { code?: string }).code;
  if (code === '23505') return NextResponse.json({ error: 'CONFLICT' }, { status: 409 });
  // Log the error category only; SQL parameters or provider messages can contain secrets.
  console.error('Request failed', error instanceof Error ? error.name : 'UnknownError');
  return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
}
export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
