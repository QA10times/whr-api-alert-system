import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ENV } from './env.token';
import { Env, validateEnv } from './env.validation';

export { ENV };

@Global()
@Module({
  imports: [
    // Loads .env (backend/ first, then repo root) into process.env and fails boot on a bad value.
    NestConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'], validate: validateEnv }),
  ],
  providers: [{ provide: ENV, useFactory: (): Env => validateEnv(process.env) }],
  exports: [ENV],
})
export class AppConfigModule {}
