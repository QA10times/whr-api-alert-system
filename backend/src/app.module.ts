import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AlertsModule } from './alerts/alerts.module';
import { ApisModule } from './apis/apis.module';
import { MonitorModule } from './monitor/monitor.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CredentialsModule } from './credentials/credentials.module';
import { EmailGroupsModule } from './email-groups/email-groups.module';
import { ModulesModule } from './modules/modules.module';
import { PlatformsModule } from './platforms/platforms.module';
import { CommonModule } from './common/common.module';
import { LOGIN_THROTTLE, SECRETS_THROTTLE } from './common/throttle';
import { AppConfigModule } from './config/config.module';
import { ENV } from './config/env.token';
import type { Env } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    AppConfigModule,
    CommonModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => [
        { name: LOGIN_THROTTLE, ttl: 60_000, limit: 5 },
        { name: SECRETS_THROTTLE, ttl: 60_000, limit: env.SECRET_ACCESS_RATE_PER_MIN },
      ],
    }),
    AuthModule,
    AuditModule,
    PlatformsModule,
    EmailGroupsModule,
    ModulesModule,
    ApisModule,
    CredentialsModule,
    AlertsModule,
    MonitorModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
