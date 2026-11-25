// Container entry step (Dockerfile CMD): apply migrations, then seed. Exits non-zero on failure.
import 'reflect-metadata';
import { config as loadDotenv } from './dotenv';
import { createDataSource } from './data-source';
import { seedWhr } from './seeds/whr.seed';

export async function migrateAndSeed(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const ds = createDataSource({
    DB_HOST: env.DB_HOST ?? 'db',
    DB_PORT: env.DB_PORT ?? 5432,
    DB_NAME: env.DB_NAME ?? 'alerts',
    DB_USER: env.DB_USER ?? 'alerts',
    DB_PASSWORD: env.DB_PASSWORD ?? '',
  });
  const log = env.NODE_ENV === 'test' ? () => undefined : console.log;
  await ds.initialize();
  try {
    const applied = await ds.runMigrations({ transaction: 'each' });
    for (const m of applied) log(`migration applied: ${m.name}`);
    await seedWhr(ds);
    log('seed ok');
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  loadDotenv();
  migrateAndSeed().catch((e) => {
    console.error('migration failed:', e);
    process.exit(1);
  });
}
