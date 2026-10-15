import type { Database } from '../db';
import type { Actor } from './auth';
import { listStudies } from './studies';
import { listParticipations } from './participations';
import { getProfile } from './profiles';
import { wallet } from './wallet';
import { appMode, capabilities } from '../config';

export async function dashboard(db: Database, actor: Actor) {
  if (actor.role === 'founder') {
    const studies = await listStudies(db, actor, true);
    const [review] = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM participations p JOIN studies s ON s.id=p.study_id WHERE s.founder_id=$1 AND s.app_mode=$2 AND p.status='submitted'`,
      [actor.id, appMode()],
    );
    return {
      actor,
      capabilities: capabilities(),
      studies,
      stats: {
        activeStudies: studies.filter((s) => ['recruiting', 'active'].includes(s.status)).length,
        participants: studies.reduce((n, s) => n + s.participants, 0),
        committedCents: studies
          .filter((s) => s.funded_cents > 0)
          .reduce((n, s) => n + s.reward_cents * s.seats, 0),
        awaitingReview: review.count,
      },
    };
  }
  const [profile, studies, participations, balance] = await Promise.all([
    getProfile(db, actor.id),
    listStudies(db, actor),
    listParticipations(db, actor),
    wallet(db, actor),
  ]);
  return {
    actor,
    capabilities: capabilities(),
    profile,
    studies,
    participations,
    wallet: balance,
    stats: {
      activeStudies: participations.filter((p) =>
        ['accepted', 'active', 'rejected'].includes(p.status as string),
      ).length,
      matchingStudies: studies.length,
      pendingCents: balance.pendingCents,
      paidCents: balance.paidCents,
    },
  };
}
