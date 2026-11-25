import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
