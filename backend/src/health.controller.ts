import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from './common/public.decorator';
import { ENV } from './config/env.token';
import type { Env } from './config/env.validation';

const STARTED = Date.now();
const HEARTBEAT_MAX_MS = 60_000;

/** Docker healthcheck: DB reachable and, when this process runs the runner, heartbeat under 60 s. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly ds: DataSource,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Get()
  async health() {
    let heartbeatAt: Date | null = null;
    try {
      const rows: { heartbeat_at: Date | null }[] = await this.ds.query('SELECT heartbeat_at FROM runner_state WHERE id = 1');
      heartbeatAt = rows[0]?.heartbeat_at ?? null;
    } catch {
      throw new ServiceUnavailableException({ statusCode: 503, error: 'Service Unavailable', message: 'Database unreachable' });
    }
    if (this.env.RUNNER_ENABLED) {
      const age = heartbeatAt ? Date.now() - heartbeatAt.getTime() : Infinity;
      const warmingUp = Date.now() - STARTED < HEARTBEAT_MAX_MS;
      if (age > HEARTBEAT_MAX_MS && !warmingUp) {
        throw new ServiceUnavailableException({ statusCode: 503, error: 'Service Unavailable', message: 'Runner heartbeat is stale' });
      }
    }
    return { status: 'ok', db: 'up', runner: this.env.RUNNER_ENABLED ? 'enabled' : 'disabled', heartbeatAt };
  }
}
