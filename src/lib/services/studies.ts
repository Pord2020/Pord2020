import type { Database } from '../db';
import type { Actor } from './auth';
import { matches, studySchema } from '../domain/schemas';
import { requireThat } from '../domain/errors';
import { getProfile } from './profiles';
import { audit } from './journal';
import { appMode } from '../config';

export type Study = {
  id: string;
  founder_id: string;
  title: string;
  app_name: string;
  description: string;
  platform: 'android' | 'ios' | 'web';
  kind: string;
  category: string;
  reward_cents: number;
  seats: number;
  duration_days: number;
  countries: string[];
  minimum_age: number;
  maximum_age: number;
  gender: string;
  required_interests: string[];
  status: string;
  app_mode: string;
  funded_cents: number;
  allocated_cents: number;
  created_at: Date;
  participants: number;
  applicants: number;
};
const publicColumns = `s.id,s.founder_id,s.title,s.app_name,s.description,s.platform,s.kind,s.category,
  s.reward_cents,s.seats,s.duration_days,s.countries,s.minimum_age,s.maximum_age,s.gender,s.required_interests,
  s.status,s.app_mode,s.funded_cents,s.allocated_cents,s.created_at,
  (SELECT count(*)::int FROM participations p WHERE p.study_id=s.id) AS participants,
  (SELECT count(*)::int FROM applications a WHERE a.study_id=s.id) AS applicants`;

export async function createStudy(db: Database, actor: Actor, input: unknown) {
  requireThat(actor.role === 'founder', 'FOUNDER_REQUIRED', 403);
  const s = studySchema.parse(input);
  return db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `INSERT INTO studies(founder_id,title,app_name,description,platform,kind,category,reward_cents,seats,duration_days,countries,minimum_age,maximum_age,gender,required_interests,invite_url,app_mode)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [
        actor.id,
        s.title,
        s.appName,
        s.description,
        s.platform,
        s.kind,
        s.category,
        s.rewardCents,
        s.seats,
        s.durationDays,
        s.countries,
        s.minimumAge,
        s.maximumAge,
        s.gender,
        s.requiredInterests,
        s.inviteUrl,
        appMode(),
      ],
    );
    for (const [index, instruction] of s.tasks.entries())
      await tx.query('INSERT INTO study_tasks(study_id,position,instruction) VALUES($1,$2,$3)', [
        row.id,
        index,
        instruction,
      ]);
    await audit(tx, actor.id, 'study.created', row.id);
    return row;
  });
}
export async function listStudies(db: Database, actor: Actor, own = false) {
  if (own || actor.role === 'founder')
    return db.query<Study>(
      `SELECT ${publicColumns} FROM studies s WHERE s.founder_id=$1 AND s.app_mode=$2 ORDER BY s.created_at DESC`,
      [actor.id, appMode()],
    );
  const rows = await db.query<Study>(
    `SELECT ${publicColumns} FROM studies s WHERE s.status IN ('recruiting','active') AND s.app_mode=$1 ORDER BY s.created_at DESC`,
    [appMode()],
  );
  const profile = await getProfile(db, actor.id);
  return rows.filter((s) => matches(profile, s) && s.participants < s.seats);
}
export async function studyDetail(db: Database, actor: Actor, id: string) {
  const [study] = await db.query<Study>(
    `SELECT ${publicColumns} FROM studies s WHERE s.id=$1 AND s.app_mode=$2`,
    [id, appMode()],
  );
  requireThat(study, 'NOT_FOUND', 404);
  const own = study.founder_id === actor.id;
  const [participation] = await db.query(
    'SELECT id,status FROM participations WHERE study_id=$1 AND tester_id=$2',
    [id, actor.id],
  );
  const [application] = await db.query(
    'SELECT id,status FROM applications WHERE study_id=$1 AND tester_id=$2',
    [id, actor.id],
  );
  requireThat(
    own ||
      participation ||
      (['recruiting', 'active'].includes(study.status) &&
        actor.role === 'tester' &&
        matches(await getProfile(db, actor.id), study)),
    'NOT_FOUND',
    404,
  );
  const tasks = await db.query(
    'SELECT id,position,instruction FROM study_tasks WHERE study_id=$1 ORDER BY position',
    [id],
  );
  const applications = own
    ? await db.query(
        `SELECT a.id,a.status,a.note,a.created_at,u.name,
    CASE WHEN p.matching_consent THEN p.country END AS country,
    CASE WHEN p.matching_consent THEN p.age END AS age,
    CASE WHEN p.matching_consent THEN p.gender END AS gender,
    CASE WHEN p.matching_consent THEN p.interests ELSE '{}'::text[] END AS interests,
    r.id AS participation_id,r.status AS participation_status
    FROM applications a JOIN users u ON u.id=a.tester_id LEFT JOIN tester_profiles p ON p.user_id=u.id
    LEFT JOIN participations r ON r.application_id=a.id WHERE a.study_id=$1 ORDER BY a.created_at`,
        [id],
      )
    : [];
  return {
    study,
    tasks,
    applications,
    participation: participation || null,
    application: application || null,
  };
}
export async function applyToStudy(db: Database, actor: Actor, id: string, note: string) {
  requireThat(actor.role === 'tester', 'TESTER_REQUIRED', 403);
  return db.transaction(async (tx) => {
    const [study] = await tx.query<Study>('SELECT * FROM studies WHERE id=$1 FOR UPDATE', [id]);
    requireThat(study && study.app_mode === appMode(), 'NOT_FOUND', 404);
    requireThat(study.founder_id !== actor.id, 'OWN_STUDY', 403);
    requireThat(
      ['recruiting', 'active'].includes(study.status) && study.funded_cents > 0,
      'STUDY_NOT_RECRUITING',
      409,
    );
    requireThat(matches(await getProfile(tx, actor.id), study), 'PROFILE_NOT_ELIGIBLE', 403);
    const [count] = await tx.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM participations WHERE study_id=$1',
      [id],
    );
    requireThat(count.count < study.seats, 'STUDY_FULL', 409);
    const [existing] = await tx.query(
      'SELECT id FROM applications WHERE study_id=$1 AND tester_id=$2',
      [id, actor.id],
    );
    requireThat(!existing, 'ALREADY_APPLIED', 409);
    const [row] = await tx.query(
      'INSERT INTO applications(study_id,tester_id,note) VALUES($1,$2,$3) RETURNING id',
      [id, actor.id, note],
    );
    await audit(tx, actor.id, 'application.created', row.id as string);
    return row;
  });
}
export async function reviewApplication(
  db: Database,
  actor: Actor,
  applicationId: string,
  accept: boolean,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<{
      id: string;
      study_id: string;
      tester_id: string;
      status: string;
      founder_id: string;
      seats: number;
      study_status: string;
      app_mode: string;
    }>(
      `SELECT a.*,s.founder_id,s.seats,s.status AS study_status,s.app_mode FROM applications a JOIN studies s ON s.id=a.study_id WHERE a.id=$1 FOR UPDATE OF a,s`,
      [applicationId],
    );
    requireThat(row && row.founder_id === actor.id && row.app_mode === appMode(), 'NOT_FOUND', 404);
    requireThat(row.status === 'applied', 'APPLICATION_ALREADY_REVIEWED', 409);
    requireThat(['recruiting', 'active'].includes(row.study_status), 'STUDY_NOT_RECRUITING', 409);
    if (accept) {
      const [count] = await tx.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM participations WHERE study_id=$1',
        [row.study_id],
      );
      requireThat(count.count < row.seats, 'STUDY_FULL', 409);
      const [study] = await tx.query<Study>('SELECT * FROM studies WHERE id=$1', [row.study_id]);
      requireThat(matches(await getProfile(tx, row.tester_id), study), 'PROFILE_NOT_ELIGIBLE', 409);
      await tx.query(
        'INSERT INTO participations(application_id,study_id,tester_id) VALUES($1,$2,$3)',
        [applicationId, row.study_id, row.tester_id],
      );
    }
    await tx.query('UPDATE applications SET status=$1 WHERE id=$2', [
      accept ? 'accepted' : 'rejected',
      applicationId,
    ]);
    await audit(
      tx,
      actor.id,
      accept ? 'application.accepted' : 'application.rejected',
      applicationId,
    );
    return { accepted: accept };
  });
}
