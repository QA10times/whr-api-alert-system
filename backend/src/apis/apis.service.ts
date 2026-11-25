import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { mergeAuthConfig, pickUsed } from '../common/auth-config';
import { CryptoService } from '../common/crypto.service';
import { FieldsException } from '../common/errors';
import type { AuthConfig, AuthUser } from '../common/types';
import { ENV } from '../config/env.token';
import type { Env } from '../config/env.validation';
import { MonitorModule } from '../modules/entities/module.entity';
import { ApiRun } from '../monitor/entities/api-run.entity';
import { RequestBuilder } from '../monitor/request-builder.service';
import { ApiDetail, loadLastHits, toDetail } from './api.mapper';
import { CurlService } from './curl.service';
import { ApiInputDto, ApiUpdateDto } from './dto/api.dto';
import { Api } from './entities/api.entity';
import { fingerprint } from './fingerprint';

export interface RunRow {
  id: number;
  startedAt: string;
  statusCode: number | null;
  passed: boolean;
  failureReason: string | null;
  countValue: number | null;
  itemCount: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  responseSnippet: string | null;
}

const TAG_PAIR = 'Fill in both the tag name and the tag value, or leave both empty.';

@Injectable()
export class ApisService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly builder: RequestBuilder,
    private readonly curls: CurlService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async detail(id: number, m: EntityManager = this.ds.manager): Promise<ApiDetail> {
    const api = await m.getRepository(Api).findOne({ where: { id }, relations: { module: { environment: true } } });
    if (!api) throw new NotFoundException('That API no longer exists.');
    const hits = await loadLastHits(m, [id]);
    return toDetail(api, api.module, hits.get(id) ?? [], this.crypto.decryptJson<AuthConfig>(api.authConfigEnc));
  }

  async create(moduleId: number, dto: ApiInputDto): Promise<ApiDetail> {
    this.assertTagPair(dto.tagKey ?? null, dto.tagValue ?? null);
    return this.ds.transaction(async (m) => {
      const mod = await m.getRepository(MonitorModule).findOne({ where: { id: moduleId } });
      if (!mod) throw new NotFoundException('That module no longer exists.');
      const [{ next }] = await m.query(`SELECT COALESCE(max(sort_order) + 1, 0)::int AS next FROM apis WHERE module_id = $1`, [moduleId]);
      const saved = await m.getRepository(Api).save({
        moduleId,
        name: dto.name,
        method: dto.method,
        endpoint: dto.endpoint,
        baseUrlOverride: dto.baseUrlOverride ?? null,
        authMethod: dto.auth.method,
        authConfigEnc: this.crypto.encryptJson(pickUsed(dto.auth.method, dto.auth.config)),
        headers: dto.headers ?? {},
        body: dto.body ?? null,
        tagKey: dto.tagKey ?? null,
        tagValue: dto.tagValue ?? null,
        countKey: dto.countKey ?? null,
        dataKey: dto.dataKey ?? null,
        frequencyMinutes: dto.frequencyMinutes ?? null,
        timeoutMs: this.env.DEFAULT_TIMEOUT_MS,
        sortOrder: next,
        isActive: dto.isActive,
      });
      return this.detail(saved.id, m);
    });
  }

  /**
   * Edit any field. A frequency change sets next_run_at to now; a fingerprint change
   * resets consecutive_failures, first_failed_at and state, and the response says so.
   */
  async update(id: number, dto: ApiUpdateDto): Promise<ApiDetail> {
    return this.ds.transaction(async (m) => {
      const repo = m.getRepository(Api);
      const api = await repo.findOne({ where: { id } });
      if (!api) throw new NotFoundException('That API no longer exists.');
      const storedAuth = this.crypto.decryptJson<AuthConfig>(api.authConfigEnc);
      const before = this.fp(api, storedAuth);

      const next: Partial<Api> = {};
      if (dto.name !== undefined) next.name = dto.name;
      if (dto.method !== undefined) next.method = dto.method;
      if (dto.endpoint !== undefined) next.endpoint = dto.endpoint;
      if (dto.baseUrlOverride !== undefined) next.baseUrlOverride = dto.baseUrlOverride ?? null;
      if (dto.headers !== undefined) next.headers = dto.headers ?? {};
      if (dto.body !== undefined) next.body = dto.body ?? null;
      if (dto.tagKey !== undefined) next.tagKey = dto.tagKey ?? null;
      if (dto.tagValue !== undefined) next.tagValue = dto.tagValue ?? null;
      if (dto.countKey !== undefined) next.countKey = dto.countKey ?? null;
      if (dto.dataKey !== undefined) next.dataKey = dto.dataKey ?? null;
      if (dto.frequencyMinutes !== undefined) next.frequencyMinutes = dto.frequencyMinutes ?? null;
      if (dto.isActive !== undefined) next.isActive = dto.isActive;
      let nextAuth = storedAuth;
      if (dto.auth !== undefined) {
        nextAuth = mergeAuthConfig(storedAuth, dto.auth.method, dto.auth.config);
        next.authMethod = dto.auth.method;
        next.authConfigEnc = this.crypto.encryptJson(nextAuth);
      }
      const merged = { ...api, ...next } as Api;
      this.assertTagPair(merged.tagKey, merged.tagValue);

      const streakReset = this.fp(merged, nextAuth) !== before;
      if (streakReset) {
        next.consecutiveFailures = 0;
        next.firstFailedAt = null;
        next.state = 'OK';
      }
      const frequencyChanged = dto.frequencyMinutes !== undefined && (dto.frequencyMinutes ?? null) !== api.frequencyMinutes;
      if (frequencyChanged) next.nextRunAt = new Date();

      if (Object.keys(next).length) await repo.update({ id }, next as Parameters<typeof repo.update>[1]);
      const detail = await this.detail(id, m);
      return streakReset ? { ...detail, streakReset: true } : detail;
    });
  }

  async remove(id: number): Promise<void> {
    const r = await this.ds.getRepository(Api).delete({ id });
    if (!r.affected) throw new NotFoundException('That API no longer exists.');
  }

  /** Decrypted auth config of an API with its own auth (empty for INHERIT); audited. */
  async credentials(id: number, user: AuthUser, ip: string | null): Promise<AuthConfig> {
    const api = await this.ds.getRepository(Api).findOne({ where: { id } });
    if (!api) throw new NotFoundException('That API no longer exists.');
    await this.audit.record(user.email, 'REVEAL_CREDENTIALS', 'API', id, ip);
    return pickUsed(api.authMethod, this.crypto.decryptJson<AuthConfig>(api.authConfigEnc));
  }

  /** GET /apis/:id/curl — exactly what the runner sends; audited. */
  async curl(id: number, user: AuthUser, ip: string | null): Promise<{ curl: string; missing: string[] }> {
    const api = await this.ds.getRepository(Api).findOne({ where: { id }, relations: { module: true } });
    if (!api) throw new NotFoundException('That API no longer exists.');
    await this.audit.record(user.email, 'COPY_CURL', 'API', id, ip);
    return this.curls.render(this.builder.build(api));
  }

  async runs(id: number, limit: number): Promise<RunRow[]> {
    const exists = await this.ds.getRepository(Api).exist({ where: { id } });
    if (!exists) throw new NotFoundException('That API no longer exists.');
    const rows = await this.ds.getRepository(ApiRun).find({
      where: { apiId: id },
      order: { executedAt: 'DESC', id: 'DESC' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    return rows.map((r) => ({
      id: Number(r.id),
      startedAt: r.executedAt.toISOString(),
      statusCode: r.statusCode,
      passed: r.isSuccess,
      failureReason: r.failureReason,
      countValue: r.countValue,
      itemCount: r.itemsCount,
      latencyMs: r.latencyMs,
      errorMessage: r.errorMessage,
      responseSnippet: r.responseSnippet,
    }));
  }

  private fp(api: Api, auth: AuthConfig | null): string {
    return fingerprint({ ...api, authConfig: auth });
  }

  private assertTagPair(key: string | null, value: string | null) {
    if (!!key === !!value) return;
    throw new FieldsException(key ? { tagValue: TAG_PAIR } : { tagKey: TAG_PAIR }, TAG_PAIR);
  }
}
