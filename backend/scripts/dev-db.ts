// npm run db:dev — local PostgreSQL 16 (no Docker) with the .env credentials, data kept in backend/.pgdata.
// Runs migrations + seed, then stays up until Ctrl+C.
import path from 'node:path';
import { config } from '../src/database/dotenv';
import { migrateAndSeed } from '../src/database/run-migrations';
import { startEmbeddedPg } from './pg-embedded';

async function main() {
  config();
  const env = process.env;
  const port = Number(env.DB_PORT ?? 5432);
  const pg = await startEmbeddedPg({
    dataDir: path.join(__dirname, '..', '.pgdata'),
    port,
    user: env.DB_USER ?? 'alerts',
    password: env.DB_PASSWORD ?? 'alerts',
    database: env.DB_NAME ?? 'alerts',
    persistent: true,
  });
  await migrateAndSeed({ ...env, DB_HOST: 'localhost', DB_PORT: String(port) });
  console.log(`PostgreSQL 16 ready on localhost:${port} (db ${env.DB_NAME ?? 'alerts'}). Ctrl+C to stop.`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
