import type { Database } from '../db';
import type { Actor } from './auth';
import { profileSchema, type TesterProfile } from '../domain/schemas';
import { requireThat } from '../domain/errors';

export async function getProfile(db: Database, userId: string): Promise<TesterProfile | null> {
  const [row] = await db.query(
    'SELECT country,age,gender,interests,platforms,matching_consent FROM tester_profiles WHERE user_id=$1',
    [userId],
  );
  if (!row) return null;
  return {
    country: row.country,
    age: row.age,
    gender: row.gender,
    interests: row.interests,
    platforms: row.platforms,
    matchingConsent: row.matching_consent,
  } as TesterProfile;
}
export async function saveProfile(db: Database, actor: Actor, input: unknown) {
  requireThat(actor.role === 'tester', 'TESTER_REQUIRED', 403);
  const p = profileSchema.parse(input);
  await db.query(
    `INSERT INTO tester_profiles(user_id,country,age,gender,interests,platforms,matching_consent)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO UPDATE SET
    country=excluded.country,age=excluded.age,gender=excluded.gender,interests=excluded.interests,
    platforms=excluded.platforms,matching_consent=excluded.matching_consent,updated_at=now()`,
    [
      actor.id,
      p.country,
      p.age,
      p.gender,
      [...new Set(p.interests)],
      [...new Set(p.platforms)],
      p.matchingConsent,
    ],
  );
  return getProfile(db, actor.id);
}
