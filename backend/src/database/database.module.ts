import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENV } from '../config/env.token';
import type { Env } from '../config/env.validation';
import { dataSourceOptions, ENTITIES } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ ...dataSourceOptions(env), migrationsRun: false }),
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
