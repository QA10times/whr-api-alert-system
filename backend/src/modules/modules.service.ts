import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { loadLastHits, toRow } from '../apis/api.mapper';
import { Api } from '../apis/entities/api.entity';
import { AuditService } from '../audit/audit.service';
import { authStatus, mergeAuthConfig, pickUsed } from '../common/auth-config';
import { CryptoService } from '../common/crypto.service';
import { ConflictFieldException, FieldsException } from '../common/errors';
import type { AuthConfig, AuthUser } from '../common/types';
import { ENV } from '../config/env.token';
import type { Env } from '../config/env.validation';
import { PlatformEnvironment } from '../platforms/entities/platform-environment.entity';
import { ModuleInputDto, ModuleUpdateDto } from './dto/module.dto';
import { MonitorModule } from './entities/module.entity';

export interface GroupRef {
  id: number;
  name: string;
  memberCount: number;
}

@Injectable()
export class ModulesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** GET /modules?env= — modules with API count and failing count. */
  async list(envKey?: string) {
    const rows: {
      id: number;
      name: string;
      environment_id: number;
      environment: string;
      base_url: string;
      auth_method: string;
      frequency_minutes: number;
      is_active: boolean;
      group_id: number | null;
      group_name: string | null;
      member_count: number;
      api_count: number;
      failing_count: number;
    }[] = await this.ds.query(
      `SELECT mo.id, mo.name, mo.environment_id, e.key AS environment, mo.base_url, mo.auth_method,
              mo.frequency_minutes, mo.is_active,
              g.id AS group_id, g.name AS group_name,
              (SELECT count(*)::int FROM email_group_members gm WHERE gm.group_id = g.id) AS member_count,
              (SELECT count(*)::int FROM apis a WHERE a.module_id = mo.id) AS api_count,
              (SELECT count(*)::int FROM apis a WHERE a.module_id = mo.id AND a.is_active AND a.state <> 'OK') AS failing_count
         FROM modules mo
         JOIN platform_environments e ON e.id = mo.environment_id
         LEFT JOIN email_groups g ON g.id = mo.email_group_id
        WHERE ($1::text IS NULL OR e.key = $1)
        ORDER BY mo.name`,
      [envKey ?? null],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      environmentId: r.environment_id,
      environment: r.environment,
      baseUrl: r.base_url,
      authMethod: r.auth_method,
      frequencyMinutes: r.frequency_minutes,
      isActive: r.is_active,
      apiCount: r.api_count,
      failingCount: r.failing_count,
      emailGroup: r.group_id ? { id: r.group_id, name: r.group_name!, memberCount: r.member_count } : null,
    }));
  }

  /** GET /modules/:id — auth status, headers and its APIs. */
  async detail(id: number, m: EntityManager = this.ds.manager) {
    const mod = await m.getRepository(MonitorModule).findOne({ where: { id }, relations: { environment: true, emailGroup: true } });
    if (!mod) throw new NotFoundException('That module no longer exists.');
    const apis = await m.getRepository(Api).find({ where: { moduleId: id }, order: { sortOrder: 'ASC', id: 'ASC' } });
    const hits = await loadLastHits(m, apis.map((a) => a.id));
    return {
      id: mod.id,
      name: mod.name,
      environmentId: mod.environmentId,
      environment: mod.environment.key,
      baseUrl: mod.baseUrl,
      auth: authStatus(mod.authMethod, this.crypto.decryptJson<AuthConfig>(mod.authConfigEnc)),
      headers: mod.headers ?? {},
      frequencyMinutes: mod.frequencyMinutes,
      failureThreshold: mod.failureThreshold,
      emailGroup: await this.groupRef(m, mod.emailGroupId),
      isActive: mod.isActive,
      apis: apis.map((a) => toRow(a, mod, hits.get(a.id) ?? [])),
    };
  }

  async create(dto: ModuleInputDto) {
    return this.ds.transaction(async (m) => {
      await this.assertEnvironment(m, dto.environmentId);
      await this.assertGroup(m, dto.emailGroupId);
      await this.assertNameFree(m, dto.environmentId, dto.name);
      const saved = await m.getRepository(MonitorModule).save({
        name: dto.name,
        environmentId: dto.environmentId,
        baseUrl: dto.baseUrl,
        authMethod: dto.auth.method,
        authConfigEnc: this.crypto.encryptJson(pickUsed(dto.auth.method, dto.auth.config)),
        headers: dto.headers ?? {},
        frequencyMinutes: dto.frequencyMinutes,
        failureThreshold: this.env.DEFAULT_FAILURE_THRESHOLD,
        emailGroupId: dto.emailGroupId ?? null,
        isActive: dto.isActive,
      });
      return this.detail(saved.id, m);
    });
  }

  async update(id: number, dto: ModuleUpdateDto) {
    return this.ds.transaction(async (m) => {
      const repo = m.getRepository(MonitorModule);
      const mod = await repo.findOne({ where: { id } });
      if (!mod) throw new NotFoundException('That module no longer exists.');

      if (dto.environmentId !== undefined && dto.environmentId !== mod.environmentId) await this.assertEnvironment(m, dto.environmentId);
      if (dto.emailGroupId !== undefined) await this.assertGroup(m, dto.emailGroupId);
      const nextEnv = dto.environmentId ?? mod.environmentId;
      const nextName = dto.name ?? mod.name;
      if (nextEnv !== mod.environmentId || nextName.toLowerCase() !== mod.name.toLowerCase()) {
        await this.assertNameFree(m, nextEnv, nextName, id);
      }

      const frequencyChanged = dto.frequencyMinutes !== undefined && dto.frequencyMinutes !== mod.frequencyMinutes;
      if (dto.name !== undefined) mod.name = dto.name;
      if (dto.environmentId !== undefined) mod.environmentId = dto.environmentId;
      if (dto.baseUrl !== undefined) mod.baseUrl = dto.baseUrl;
      if (dto.headers !== undefined) mod.headers = dto.headers ?? {};
      if (dto.frequencyMinutes !== undefined) mod.frequencyMinutes = dto.frequencyMinutes;
      if (dto.emailGroupId !== undefined) mod.emailGroupId = dto.emailGroupId;
      if (dto.isActive !== undefined) mod.isActive = dto.isActive;
      if (dto.auth !== undefined) {
        const stored = this.crypto.decryptJson<AuthConfig>(mod.authConfigEnc);
        mod.authConfigEnc = this.crypto.encryptJson(mergeAuthConfig(stored, dto.auth.method, dto.auth.config));
        mod.authMethod = dto.auth.method;
      }
      // keep the relation objects from overriding the FK columns on save
      await repo.update({ id }, {
        name: mod.name,
        environmentId: mod.environmentId,
        baseUrl: mod.baseUrl,
        headers: mod.headers,
        frequencyMinutes: mod.frequencyMinutes,
        emailGroupId: mod.emailGroupId,
        isActive: mod.isActive,
        authMethod: mod.authMethod,
        authConfigEnc: mod.authConfigEnc,
      });
      // a new module frequency applies at once to APIs that inherit it
      if (frequencyChanged) {
        await m.query(`UPDATE apis SET next_run_at = now() WHERE module_id = $1 AND frequency_minutes IS NULL`, [id]);
      }
      return this.detail(id, m);
    });
  }

  async remove(id: number): Promise<void> {
    const r = await this.ds.getRepository(MonitorModule).delete({ id }); // APIs cascade
    if (!r.affected) throw new NotFoundException('That module no longer exists.');
  }

  /** Decrypted auth config for the edit form; audited. */
  async credentials(id: number, user: AuthUser, ip: string | null): Promise<AuthConfig> {
    const mod = await this.ds.getRepository(MonitorModule).findOne({ where: { id } });
    if (!mod) throw new NotFoundException('That module no longer exists.');
    await this.audit.record(user.email, 'REVEAL_CREDENTIALS', 'MODULE', id, ip);
    return pickUsed(mod.authMethod, this.crypto.decryptJson<AuthConfig>(mod.authConfigEnc));
  }

  private async groupRef(m: EntityManager, groupId: number | null): Promise<GroupRef | null> {
    if (!groupId) return null;
    const [g] = await m.query(
      `SELECT g.id, g.name, (SELECT count(*)::int FROM email_group_members x WHERE x.group_id = g.id) AS member_count
         FROM email_groups g WHERE g.id = $1`,
      [groupId],
    );
    return g ? { id: g.id, name: g.name, memberCount: g.member_count } : null;
  }

  private async assertEnvironment(m: EntityManager, environmentId: number) {
    const env = await m.getRepository(PlatformEnvironment).findOne({ where: { id: environmentId } });
    if (!env) throw new FieldsException({ environmentId: 'That environment does not exist.' }, 'That environment does not exist.');
  }

  private async assertGroup(m: EntityManager, groupId: number | null | undefined) {
    if (groupId === null || groupId === undefined) return;
    const [g] = await m.query(`SELECT id FROM email_groups WHERE id = $1`, [groupId]);
    if (!g) throw new FieldsException({ emailGroupId: 'That email group no longer exists.' }, 'That email group no longer exists.');
  }

  private async assertNameFree(m: EntityManager, environmentId: number, name: string, exceptId?: number) {
    const rows = await m.query(`SELECT id FROM modules WHERE environment_id = $1 AND lower(name) = lower($2) AND id <> $3`, [
      environmentId,
      name,
      exceptId ?? 0,
    ]);
    if (rows.length) throw new ConflictFieldException(`A module named “${name}” already exists in this environment.`);
  }
}
