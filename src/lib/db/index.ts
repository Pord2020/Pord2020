import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';

export interface Database {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
type Queryable = {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  exec?(sql: string): Promise<unknown>;
};

function wrap(
  queryable: Queryable,
  transact: Database['transaction'],
  close: () => Promise<void>,
): Database {
  return {
    async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const result = await queryable.query(sql, params);
      return result.rows as T[];
    },
    async exec(sql: string) {
      if (queryable.exec) await queryable.exec(sql);
      else await queryable.query(sql);
    },
    transaction: transact,
    close,
  };
}

export async function createDatabase(
  options: { url?: string; directory?: string; memory?: boolean } = {},
): Promise<Database> {
  if (options.url) {
    const pool = new Pool({
      connectionString: options.url,
      max: 10,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
    const db = wrap(
      pool,
      async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const scoped = wrap(
            client,
            async (nested) => nested(scoped),
            async () => {},
          );
          const result = await fn(scoped);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },
      () => pool.end(),
    );
    return db;
  }
  if (options.directory) await mkdir(options.directory, { recursive: true });
  const pg = await PGlite.create(
    options.memory ? 'memory://' : (options.directory ?? join(process.cwd(), '.local', 'postgres')),
  );
  const db = wrap(
    pg as Queryable,
    async (fn) =>
      pg.transaction(async (tx) => {
        const scoped = wrap(
          tx as Queryable,
          async (nested) => nested(scoped),
          async () => {},
        );
        return fn(scoped);
      }),
    () => pg.close(),
  );
  return db;
}

export async function migrate(db: Database) {
  const folder = join(process.cwd(), 'src/lib/db/migrations');
  const files = (await readdir(folder)).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
  await db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(719241)');
    await tx.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const file of files) {
      const applied = await tx.query('SELECT version FROM schema_migrations WHERE version = $1', [
        file,
      ]);
      if (applied.length) continue;
      const sql = await readFile(join(folder, file), 'utf8');
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
    }
  });
}

declare global {
  var pilotlaneDb: Promise<Database> | undefined;
}
export function database(): Promise<Database> {
  if (!globalThis.pilotlaneDb)
    globalThis.pilotlaneDb = (async () => {
      const embedded =
        process.env.DATABASE_MODE === 'embedded' ||
        (process.env.NODE_ENV !== 'production' && !process.env.DATABASE_URL);
      if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL && !embedded)
        throw new Error('DATABASE_URL is required in production');
      if (embedded && process.env.NODE_ENV === 'production' && process.env.APP_MODE !== 'sandbox')
        throw new Error('Embedded production storage requires explicit sandbox mode');
      const db = await createDatabase(
        embedded
          ? { directory: process.env.LOCAL_DATABASE_PATH || join(process.cwd(), '.local/postgres') }
          : { url: process.env.DATABASE_URL },
      );
      await migrate(db);
      return db;
    })().catch((error) => {
      globalThis.pilotlaneDb = undefined;
      throw error;
    });
  return globalThis.pilotlaneDb;
}
