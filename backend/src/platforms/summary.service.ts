import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiCardData, loadLastHits, toCard } from '../apis/api.mapper';
import { Api } from '../apis/entities/api.entity';
import { MonitorModule } from '../modules/entities/module.entity';
import { PlatformsService } from './platforms.service';

export interface Summary {
  platform: string;
  environment: { id: number; key: string; name: string; baseUrl: string | null };
  counts: { apis: number; failing: number; alertsOpen: number; modules: number };
  modules: {
    id: number;
    name: string;
    frequencyMinutes: number;
    emailGroup: { id: number; name: string } | null;
    isActive: boolean;
    apis: ApiCardData[];
  }[];
}

/** One summary per environment: header counts and every module with its API cards. */
@Injectable()
export class SummaryService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly platforms: PlatformsService,
  ) {}

  async summary(platformKey: string, envKey: string): Promise<Summary> {
    const env = await this.platforms.environment(platformKey, envKey);
    const mods = await this.ds.getRepository(MonitorModule).find({
      where: { environmentId: env.id },
      relations: { emailGroup: true },
      order: { name: 'ASC' },
    });
    const apis = mods.length
      ? await this.ds
          .getRepository(Api)
          .createQueryBuilder('a')
          .where('a.module_id IN (:...ids)', { ids: mods.map((m) => m.id) })
          .orderBy('a.sort_order', 'ASC')
          .addOrderBy('a.id', 'ASC')
          .getMany()
      : [];
    const hits = await loadLastHits(this.ds.manager, apis.map((a) => a.id));

    // "Failing now" and "Alerts open" count running APIs only (paused ones keep their state, greyed out).
    const modActive = new Map(mods.map((m) => [m.id, m.isActive]));
    const live = apis.filter((a) => a.isActive && modActive.get(a.moduleId));
    return {
      platform: env.platform.key,
      environment: { id: env.id, key: env.key, name: env.name, baseUrl: env.defaultBaseUrl },
      counts: {
        apis: apis.length,
        failing: live.filter((a) => a.state !== 'OK').length,
        alertsOpen: live.filter((a) => a.state === 'ALERTED').length,
        modules: mods.length,
      },
      modules: mods.map((m) => ({
        id: m.id,
        name: m.name,
        frequencyMinutes: m.frequencyMinutes,
        emailGroup: m.emailGroup ? { id: m.emailGroup.id, name: m.emailGroup.name } : null,
        isActive: m.isActive,
        apis: apis.filter((a) => a.moduleId === m.id).map((a) => toCard(a, m, hits.get(a.id) ?? [])),
      })),
    };
  }
}
