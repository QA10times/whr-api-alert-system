import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ENV } from '../config/env.token';
import type { Env } from '../config/env.validation';

export const RETENTION_BATCH = 10_000;

/** Nightly: delete api_runs older than RUN_RETENTION_DAYS in batches of 10,000 (BRIN on executed_at). */
@Injectable()
export class RetentionService {
  private readonly log = new Logger('Retention');

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Cron('0 30 3 * * *', { name: 'run-retention' })
  async nightly(): Promise<void> {
    if (!this.env.RUNNER_ENABLED) return;
    const n = await this.prune();
    if (n) this.log.log(`Deleted ${n} api_runs older than ${this.env.RUN_RETENTION_DAYS} days`);
  }

  async prune(days = this.env.RUN_RETENTION_DAYS): Promise<number> {
    let total = 0;
    for (;;) {
      const [, affected] = await this.ds.query(
        `DELETE FROM api_runs WHERE id IN (
           SELECT id FROM api_runs WHERE executed_at < now() - make_interval(days => $1) LIMIT $2)`,
        [days, RETENTION_BATCH],
      );
      total += affected ?? 0;
      if (!affected || affected < RETENTION_BATCH) return total;
    }
  }
}
