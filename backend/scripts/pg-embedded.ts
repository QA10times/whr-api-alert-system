// Real PostgreSQL 16 on Windows/macOS/Linux without Docker, via the embedded-postgres package.
// Used by `npm run db:dev` and the integration-test global setup.
import { existsSync } from 'node:fs';
import { Client } from 'pg';

export interface PgOptions {
  dataDir: string;
  port: number;
  user: string;
  password: string;
  database: string;
  persistent: boolean;
}

export interface EmbeddedPg {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

// embedded-postgres is ESM-only; a real dynamic import (not compiled to require) loads it from CommonJS.
const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<{
  default: new (o: Record<string, unknown>) => EmbeddedPg;
}>;

export async function startEmbeddedPg(o: PgOptions): Promise<EmbeddedPg> {
  const { default: EmbeddedPostgres } = await esmImport('embedded-postgres');
  const pg = new EmbeddedPostgres({
    databaseDir: o.dataDir,
    user: o.user,
    password: o.password,
    port: o.port,
    persistent: o.persistent,
    onLog: () => undefined,
  });
  if (!existsSync(o.dataDir)) await pg.initialise();
  await pg.start();

  const c = new Client({ host: 'localhost', port: o.port, user: o.user, password: o.password, database: 'postgres' });
  await c.connect();
  try {
    const r = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [o.database]);
    if (r.rowCount === 0) await c.query(`CREATE DATABASE "${o.database.replace(/"/g, '""')}"`);
  } finally {
    await c.end();
  }
  return pg;
}
