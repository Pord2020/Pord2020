import type { Database } from '../db';
import { requireThat } from '../domain/errors';

export async function journal(
  db: Database,
  studyId: string,
  reference: string,
  kind: string,
  entries: { account: string; amountCents: number }[],
) {
  requireThat(
    entries.length >= 2 &&
      entries.every((e) => Number.isSafeInteger(e.amountCents) && e.amountCents !== 0),
    'INVALID_JOURNAL',
  );
  requireThat(entries.reduce((sum, e) => sum + e.amountCents, 0) === 0, 'UNBALANCED_JOURNAL');
  const [tx] = await db.query<{ id: string }>(
    'INSERT INTO journal_transactions(study_id,reference,kind) VALUES($1,$2,$3) RETURNING id',
    [studyId, reference, kind],
  );
  for (const entry of entries)
    await db.query(
      'INSERT INTO journal_entries(transaction_id,account,amount_cents) VALUES($1,$2,$3)',
      [tx.id, entry.account, entry.amountCents],
    );
}
export async function audit(
  db: Database,
  actorId: string | null,
  action: string,
  entityId: string,
) {
  await db.query('INSERT INTO audit_events(actor_id,action,entity_id) VALUES($1,$2,$3)', [
    actorId,
    action,
    entityId,
  ]);
}
