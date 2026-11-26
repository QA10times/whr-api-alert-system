import { DataSource, DataSourceOptions } from 'typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { Api } from '../apis/entities/api.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { EmailGroupMember } from '../email-groups/entities/email-group-member.entity';
import { EmailGroup } from '../email-groups/entities/email-group.entity';
import { MonitorModule } from '../modules/entities/module.entity';
import { ApiRun } from '../monitor/entities/api-run.entity';
import { RunnerState } from '../monitor/entities/runner-state.entity';
import { PlatformEnvironment } from '../platforms/entities/platform-environment.entity';
import { Platform } from '../platforms/entities/platform.entity';
import { Init1764000000000 } from './migrations/1764000000000-Init';

export const ENTITIES = [
  Platform,
  PlatformEnvironment,
  EmailGroup,
  EmailGroupMember,
  MonitorModule,
  Api,
  ApiRun,
  Alert,
  AuditLog,
  RunnerState,
];
export const MIGRATIONS = [Init1764000000000];

export interface DbEnv {
  DB_HOST: string;
  DB_PORT: number | string;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
}

export function dataSourceOptions(env: DbEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    logging: process.env.NODE_ENV === 'test' ? false : ['error'],
    extra: { max: 10 },
  };
}

export function createDataSource(env: DbEnv): DataSource {
  return new DataSource(dataSourceOptions(env));
}
