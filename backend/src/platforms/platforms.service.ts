import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlatformEnvironment } from './entities/platform-environment.entity';
import { Platform } from './entities/platform.entity';

@Injectable()
export class PlatformsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Platforms with their environments; isDefault marks gtm. */
  async list() {
    const platforms = await this.ds.getRepository(Platform).find({ relations: { environments: true }, order: { id: 'ASC' } });
    return platforms.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      environments: [...p.environments]
        .sort((a, b) => a.id - b.id)
        .map((e) => ({ id: e.id, key: e.key, name: e.name, baseUrl: e.defaultBaseUrl, isDefault: e.isDefault })),
    }));
  }

  async environment(platformKey: string, envKey: string): Promise<PlatformEnvironment & { platform: Platform }> {
    const env = await this.ds
      .getRepository(PlatformEnvironment)
      .findOne({ where: { key: envKey, platform: { key: platformKey } }, relations: { platform: true } });
    if (!env) throw new NotFoundException(`Unknown environment ${platformKey}/${envKey}.`);
    return env;
  }
}
