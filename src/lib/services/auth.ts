import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Database } from '../db';
import { loginSchema, registerSchema } from '../domain/schemas';
import { DomainError, requireThat } from '../domain/errors';

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: 'founder' | 'tester';
  locale: 'en' | 'es';
};
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored?: string | null) {
  const [algorithm, salt, encoded] = (
    stored || 'scrypt-v1:00000000000000000000000000000000:' + '00'.repeat(64)
  ).split(':');
  const actual = await derive(password, salt);
  const expected = Buffer.from(encoded || '', 'hex');
  return (
    Boolean(stored) &&
    algorithm === 'scrypt-v1' &&
    expected.length === actual.length &&
    timingSafeEqual(actual, expected)
  );
}
export async function register(db: Database, input: unknown): Promise<Actor> {
  const data = registerSchema.parse(input);
  const hash = await hashPassword(data.password);
  try {
    const [user] = await db.query<Actor>(
      'INSERT INTO users(name,email,password_hash,role,locale) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,role,locale',
      [data.name, data.email, hash, data.role, data.locale],
    );
    return user;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new DomainError('ACCOUNT_EXISTS', 409);
    throw err;
  }
}
export async function login(db: Database, input: unknown): Promise<Actor> {
  const data = loginSchema.parse(input);
  const [row] = await db.query<Actor & { password_hash: string | null }>(
    'SELECT id,name,email,role,locale,password_hash FROM users WHERE email = $1',
    [data.email],
  );
  requireThat(await verifyPassword(data.password, row?.password_hash), 'INVALID_CREDENTIALS', 401);
  const { password_hash: _, ...user } = row;
  return user;
}
export async function createSession(db: Database, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + 7 * 86400000);
  await db.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [
    digest(token),
    userId,
    expires,
  ]);
  return { token, expires };
}
export async function sessionActor(db: Database, token?: string): Promise<Actor | null> {
  if (!token || token.length > 128) return null;
  const [user] = await db.query<Actor>(
    'SELECT u.id,u.name,u.email,u.role,u.locale FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
    [digest(token)],
  );
  return user || null;
}
export async function revokeSession(db: Database, token?: string) {
  if (token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token)]);
}
export async function throttleAuth(db: Database, ip: string, action: string) {
  const key = digest(`${action}:${ip}`);
  const [row] = await db.query<{ count: number }>(
    `INSERT INTO auth_attempts(key,count) VALUES ($1,1)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN auth_attempts.window_started_at < now()-interval '10 minutes' THEN 1 ELSE auth_attempts.count+1 END,
      window_started_at=CASE WHEN auth_attempts.window_started_at < now()-interval '10 minutes' THEN now() ELSE auth_attempts.window_started_at END
    RETURNING count`,
    [key],
  );
  requireThat(row.count <= 20, 'TOO_MANY_ATTEMPTS', 429);
}
