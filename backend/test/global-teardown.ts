import { rmSync } from 'node:fs';
import type { EmbeddedPg } from '../scripts/pg-embedded';
import { TEST_DIR } from './global-setup';

export default async function globalTeardown(): Promise<void> {
  const pg = (globalThis as { __PG__?: EmbeddedPg }).__PG__;
  if (pg) await pg.stop();
  rmSync(TEST_DIR, { recursive: true, force: true });
}
