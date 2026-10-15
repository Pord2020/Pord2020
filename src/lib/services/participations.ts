import type { Database } from '../db';
import type { Actor } from './auth';
import { requireThat } from '../domain/errors';
import { journal, audit } from './journal';
import { appMode } from '../config';

type Participation = {
  id: string;
  tester_id: string;
  founder_id: string;
  study_id: string;
  status: string;
  started_at: Date | null;
  submitted_at: Date | null;
  duration_days: number;
  app_mode: string;
  reward_cents: number;
  allocated_cents: number;
  seats: number;
  funded_cents: number;
  invite_url: string;
  title: string;
  app_name: string;
  platform: string;
};
async function participant(
  db: Database,
  actor: Actor,
  id: string,
  lock = false,
): Promise<Participation> {
  const [row] = await db.query<Participation>(
    `SELECT p.*,s.founder_id,s.duration_days,s.app_mode,s.reward_cents,s.allocated_cents,s.seats,s.funded_cents,s.invite_url,s.title,s.app_name,s.platform
    FROM participations p JOIN studies s ON s.id=p.study_id WHERE p.id=$1 ${lock ? 'FOR UPDATE OF p,s' : ''}`,
    [id],
  );
  requireThat(
    row &&
      row.app_mode === appMode() &&
      (row.tester_id === actor.id || row.founder_id === actor.id),
    'NOT_FOUND',
    404,
  );
  return row;
}
export async function listParticipations(db: Database, actor: Actor) {
  return db.query(
    `SELECT p.id,p.study_id,p.status,p.started_at,p.submitted_at,p.review_note,s.title,s.app_name,s.platform,s.reward_cents,s.duration_days,
    (SELECT count(*)::int FROM check_ins c WHERE c.participation_id=p.id) AS check_in_count,
    (SELECT count(*)::int FROM task_submissions t WHERE t.participation_id=p.id) AS completed_tasks,
    (SELECT count(*)::int FROM study_tasks t WHERE t.study_id=s.id) AS task_count
    FROM participations p JOIN studies s ON s.id=p.study_id WHERE p.tester_id=$1 AND s.app_mode=$2 ORDER BY p.created_at DESC`,
    [actor.id, appMode()],
  );
}

export function progress(
  checkIns: { day: string | Date }[],
  startedAt: Date | string | null,
  requiredDays: number,
  tasksDone: number,
  totalTasks: number,
  now = new Date(),
) {
  const days = new Set(
    checkIns.map((c) =>
      typeof c.day === 'string' ? c.day.slice(0, 10) : c.day.toISOString().slice(0, 10),
    ),
  );
  const today = now.toISOString().slice(0, 10);
  let cursor = new Date(`${today}T00:00:00Z`);
  if (!days.has(today)) cursor = new Date(cursor.getTime() - 86400000);
  let streakDays = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streakDays++;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  const earliestSubmitAt = startedAt
    ? new Date(new Date(startedAt).getTime() + requiredDays * 86400000).toISOString()
    : null;
  const elapsed = Boolean(
    earliestSubmitAt && now.getTime() >= new Date(earliestSubmitAt).getTime(),
  );
  return {
    completedDays: days.size,
    streakDays,
    requiredDays,
    tasksDone,
    totalTasks,
    earliestSubmitAt,
    elapsed,
    canSubmit: elapsed && streakDays >= requiredDays && totalTasks > 0 && tasksDone === totalTasks,
    todayCheckedIn: days.has(today),
  };
}

export async function participationDetail(
  db: Database,
  actor: Actor,
  id: string,
  now = new Date(),
) {
  const row = await participant(db, actor, id);
  const tasks = await db.query(
    'SELECT t.id,t.instruction,t.position,a.feedback FROM study_tasks t LEFT JOIN task_submissions a ON a.task_id=t.id AND a.participation_id=$1 WHERE t.study_id=$2 ORDER BY t.position',
    [id, row.study_id],
  );
  const checkIns = await db.query<{ day: Date | string; note: string }>(
    'SELECT day::text AS day,note FROM check_ins WHERE participation_id=$1 ORDER BY day DESC',
    [id],
  );
  const { invite_url, ...participation } = row;
  return {
    participation,
    inviteUrl: invite_url,
    tasks,
    checkIns,
    progress: progress(
      checkIns,
      row.started_at,
      row.duration_days,
      tasks.filter((t) => t.feedback).length,
      tasks.length,
      now,
    ),
  };
}
export async function startParticipation(db: Database, actor: Actor, id: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const row = await participant(tx, actor, id, true);
    requireThat(row.tester_id === actor.id, 'FORBIDDEN', 403);
    requireThat(row.status === 'accepted', 'INVALID_PARTICIPATION_STATE', 409);
    await tx.query("UPDATE participations SET status='active',started_at=$1 WHERE id=$2", [
      now,
      id,
    ]);
    await tx.query("UPDATE studies SET status='active' WHERE id=$1 AND status='recruiting'", [
      row.study_id,
    ]);
    await audit(tx, actor.id, 'participation.started', id);
    return { started: true };
  });
}
export async function checkIn(
  db: Database,
  actor: Actor,
  id: string,
  note: string,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const row = await participant(tx, actor, id, true);
    requireThat(row.tester_id === actor.id, 'FORBIDDEN', 403);
    requireThat(
      ['active', 'rejected'].includes(row.status) &&
        row.started_at &&
        now.getTime() >= new Date(row.started_at).getTime(),
      'INVALID_PARTICIPATION_STATE',
      409,
    );
    const result = await tx.query(
      'INSERT INTO check_ins(participation_id,day,note) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',
      [id, now.toISOString().slice(0, 10), note],
    );
    requireThat(result.length, 'ALREADY_CHECKED_IN', 409);
    await audit(tx, actor.id, 'participation.self_reported_activity', id);
    return { checkedIn: true };
  });
}
export async function submitTask(
  db: Database,
  actor: Actor,
  id: string,
  taskId: string,
  feedback: string,
) {
  return db.transaction(async (tx) => {
    const row = await participant(tx, actor, id, true);
    requireThat(row.tester_id === actor.id, 'FORBIDDEN', 403);
    requireThat(['active', 'rejected'].includes(row.status), 'INVALID_PARTICIPATION_STATE', 409);
    const [task] = await tx.query('SELECT id FROM study_tasks WHERE id=$1 AND study_id=$2', [
      taskId,
      row.study_id,
    ]);
    requireThat(task, 'NOT_FOUND', 404);
    await tx.query(
      'INSERT INTO task_submissions(participation_id,task_id,feedback) VALUES($1,$2,$3) ON CONFLICT(participation_id,task_id) DO UPDATE SET feedback=excluded.feedback,created_at=now()',
      [id, taskId, feedback],
    );
    return { saved: true };
  });
}
export async function submitParticipation(
  db: Database,
  actor: Actor,
  id: string,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const row = await participant(tx, actor, id, true);
    requireThat(row.tester_id === actor.id, 'FORBIDDEN', 403);
    requireThat(['active', 'rejected'].includes(row.status), 'INVALID_PARTICIPATION_STATE', 409);
    const detail = await participationDetail(tx, actor, id, now);
    requireThat(detail.progress.canSubmit, 'REQUIREMENTS_INCOMPLETE', 409);
    await tx.query(
      "UPDATE participations SET status='submitted',submitted_at=$1,review_note=NULL WHERE id=$2",
      [now, id],
    );
    await audit(tx, actor.id, 'participation.submitted', id);
    return { submitted: true };
  });
}
export async function reviewParticipation(
  db: Database,
  actor: Actor,
  id: string,
  approve: boolean,
  note: string,
) {
  return db.transaction(async (tx) => {
    const row = await participant(tx, actor, id, true);
    requireThat(row.founder_id === actor.id, 'FORBIDDEN', 403);
    requireThat(row.status === 'submitted', 'INVALID_PARTICIPATION_STATE', 409);
    if (approve) {
      requireThat(
        row.funded_cents > 0 &&
          row.allocated_cents + row.reward_cents <= row.reward_cents * row.seats,
        'INSUFFICIENT_STUDY_FUNDS',
        409,
      );
      const [reward] = await tx.query<{ id: string }>(
        'INSERT INTO rewards(participation_id,tester_id,study_id,amount_cents,app_mode) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [id, row.tester_id, row.study_id, row.reward_cents, row.app_mode],
      );
      await journal(tx, row.study_id, `reward:${id}`, 'reward', [
        { account: 'study_liability', amountCents: row.reward_cents },
        { account: `tester_payable:${row.tester_id}`, amountCents: -row.reward_cents },
      ]);
      await tx.query('UPDATE studies SET allocated_cents=allocated_cents+$1 WHERE id=$2', [
        row.reward_cents,
        row.study_id,
      ]);
      await tx.query('INSERT INTO outbox(operation_key,kind,payload) VALUES($1,$2,$3)', [
        `reward:${reward.id}`,
        'payout.requested',
        JSON.stringify({ rewardId: reward.id, mode: row.app_mode }),
      ]);
    }
    await tx.query(
      'UPDATE participations SET status=$1,reviewed_at=now(),review_note=$2 WHERE id=$3',
      [approve ? 'approved' : 'rejected', note, id],
    );
    await audit(tx, actor.id, approve ? 'participation.approved' : 'participation.rejected', id);
    return { approved: approve };
  });
}
export async function disputeParticipation(
  db: Database,
  actor: Actor,
  id: string,
  reason: string,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const row = await participant(tx, actor, id, true);
    requireThat(row.tester_id === actor.id, 'FORBIDDEN', 403);
    const overdue =
      row.status === 'submitted' &&
      row.submitted_at &&
      now.getTime() >= new Date(row.submitted_at).getTime() + 7 * 86400000;
    requireThat(row.status === 'rejected' || overdue, 'DISPUTE_NOT_AVAILABLE', 409);
    await tx.query('INSERT INTO disputes(participation_id,tester_id,reason) VALUES($1,$2,$3)', [
      id,
      actor.id,
      reason,
    ]);
    await tx.query("UPDATE participations SET status='disputed' WHERE id=$1", [id]);
    await audit(tx, actor.id, 'participation.disputed', id);
    return { disputed: true };
  });
}
