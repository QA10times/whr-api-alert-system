import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { ENV } from './config/env.token';
import type { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const env = app.get<Env>(ENV);
  configureApp(app, env.CORS_ORIGIN);
  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`API listening on :${env.PORT} (runner ${env.RUNNER_ENABLED ? 'enabled' : 'disabled'})`, 'Bootstrap');
}

void bootstrap();
