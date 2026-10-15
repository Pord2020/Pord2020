import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { database } from '../db';
import { digest, createSession, type Actor } from './auth';
import { appUrl, capabilities } from '../config';
import { cookieOptions, sessionCookie } from '../http';
import { requireThat } from '../domain/errors';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function googleStart(req: NextRequest) {
  requireThat(capabilities().google, 'GOOGLE_UNAVAILABLE', 503);
  const role = z
    .enum(['founder', 'tester'])
    .parse(req.nextUrl.searchParams.get('role') || 'tester');
  const locale = z.enum(['en', 'es']).parse(req.nextUrl.searchParams.get('locale') || 'en');
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = Buffer.from(digest(verifier), 'hex').toString('base64url');
  const db = await database();
  await db.query('DELETE FROM oauth_states WHERE expires_at<now()');
  await db.query(
    "INSERT INTO oauth_states(state_hash,nonce,verifier,role,locale,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')",
    [digest(state), nonce, verifier, role, locale],
  );
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${appUrl()}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set('pilotlane_oauth', state, { ...cookieOptions, maxAge: 600 });
  return res;
}
export async function googleCallback(req: NextRequest) {
  requireThat(capabilities().google, 'GOOGLE_UNAVAILABLE', 503);
  const state = req.nextUrl.searchParams.get('state');
  requireThat(
    state && state === req.cookies.get('pilotlane_oauth')?.value,
    'INVALID_OAUTH_STATE',
    400,
  );
  const code = req.nextUrl.searchParams.get('code');
  requireThat(code && code.length < 4096, 'INVALID_OAUTH_CODE');
  const db = await database();
  const [stored] = await db.query<{
    nonce: string;
    verifier: string;
    role: 'founder' | 'tester';
    locale: 'en' | 'es';
  }>(
    'DELETE FROM oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING nonce,verifier,role,locale',
    [digest(state)],
  );
  requireThat(stored, 'INVALID_OAUTH_STATE');
  const exchange = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      code_verifier: stored.verifier,
      redirect_uri: `${appUrl()}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15000),
  });
  requireThat(exchange.ok, 'GOOGLE_EXCHANGE_FAILED', 502);
  const token = await exchange.json();
  requireThat(typeof token.id_token === 'string', 'GOOGLE_EXCHANGE_FAILED', 502);
  const { payload } = await jwtVerify(token.id_token, googleKeys, {
    audience: process.env.GOOGLE_CLIENT_ID,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    requiredClaims: ['sub', 'email', 'email_verified', 'nonce'],
    clockTolerance: 10,
  });
  requireThat(
    payload.nonce === stored.nonce && payload.email_verified === true,
    'GOOGLE_IDENTITY_INVALID',
    401,
  );
  const email = z.email().max(254).parse(payload.email).toLowerCase();
  const sub = z.string().min(1).max(255).parse(payload.sub);
  let [actor] = await db.query<Actor>(
    'SELECT id,name,email,role,locale FROM users WHERE google_sub=$1',
    [sub],
  );
  if (!actor) {
    const [existing] = await db.query('SELECT id FROM users WHERE email=$1', [email]);
    requireThat(!existing, 'ACCOUNT_EXISTS', 409);
    [actor] = await db.query<Actor>(
      'INSERT INTO users(email,name,google_sub,role,locale) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role,locale',
      [
        email,
        typeof payload.name === 'string' ? payload.name.slice(0, 80) : email.split('@')[0],
        sub,
        stored.role,
        stored.locale,
      ],
    );
  }
  const session = await createSession(db, actor.id);
  const res = NextResponse.redirect(`${appUrl()}/${actor.locale}/workspace`);
  res.cookies.set(sessionCookie, session.token, { ...cookieOptions, expires: session.expires });
  res.cookies.set('pilotlane_oauth', '', { ...cookieOptions, maxAge: 0 });
  return res;
}
