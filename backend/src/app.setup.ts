import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AllExceptionsFilter, validationExceptionFactory } from './common/errors';

/** Shared by main.ts and integration tests so both run the same pipeline. */
export function configureApp(app: INestApplication, corsOrigin?: string): void {
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1); // Next.js forwards X-Forwarded-For; audit log and throttler use it
  app.setGlobalPrefix('api');
  app.use(helmet());
  if (corsOrigin) app.enableCors({ origin: corsOrigin.split(',').map((s) => s.trim()), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
