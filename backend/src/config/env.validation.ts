// Joi schema for the .env file (backend design → Configuration and Docker).
// Boot fails on a missing or malformed value.
import * as Joi from 'joi';
import { parseAuthUsers } from './auth-users.parser';

export const envSchema = Joi.object({
  // App
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  APP_BASE_URL: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://localhost:8080'),
  CORS_ORIGIN: Joi.string().allow('').default(''),

  // Auth
  AUTH_USERS: Joi.string()
    .required()
    .custom((value: string, helpers) => {
      try {
        parseAuthUsers(value);
      } catch (e) {
        return helpers.message({ custom: `AUTH_USERS: ${(e as Error).message}` });
      }
      return value;
    }),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]?$/)
    .default('12h'),

  // Database
  DB_HOST: Joi.string().default('db'),
  DB_PORT: Joi.number().port().default(5432),
  DB_NAME: Joi.string().default('alerts'),
  DB_USER: Joi.string().default('alerts'),
  DB_PASSWORD: Joi.string().required(),

  // Encryption of stored API credentials
  ENCRYPTION_KEY: Joi.string()
    .required()
    .custom((value: string, helpers) => {
      if (Buffer.from(value, 'base64').length !== 32) {
        return helpers.message({ custom: 'ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)' });
      }
      return value;
    }),

  // Mail
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().default('WHR Alerts <alerts@10times.com>'),

  // Runner
  RUNNER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  RUNNER_TICK_MS: Joi.number().integer().min(100).default(15000),
  DEFAULT_FREQUENCY_MINUTES: Joi.number().integer().min(1).max(1440).default(5),
  DEFAULT_FAILURE_THRESHOLD: Joi.number().integer().min(1).default(5),
  DEFAULT_TIMEOUT_MS: Joi.number().integer().min(100).default(15000),
  ALERT_SEND_RECOVERY: Joi.boolean().truthy('true').falsy('false').default(true),
  ALERT_TIMEZONE: Joi.string().default('Asia/Kolkata'),
  SECRET_ACCESS_RATE_PER_MIN: Joi.number().integer().min(1).default(30),
  RUN_RETENTION_DAYS: Joi.number().integer().min(1).default(30),
}).unknown(true);

export interface Env {
  NODE_ENV: string;
  PORT: number;
  APP_BASE_URL: string;
  CORS_ORIGIN: string;
  AUTH_USERS: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  ENCRYPTION_KEY: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  MAIL_FROM: string;
  RUNNER_ENABLED: boolean;
  RUNNER_TICK_MS: number;
  DEFAULT_FREQUENCY_MINUTES: number;
  DEFAULT_FAILURE_THRESHOLD: number;
  DEFAULT_TIMEOUT_MS: number;
  ALERT_SEND_RECOVERY: boolean;
  ALERT_TIMEZONE: string;
  SECRET_ACCESS_RATE_PER_MIN: number;
  RUN_RETENTION_DAYS: number;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const { error, value } = envSchema.validate(raw, { abortEarly: false, convert: true });
  if (error) throw new Error(`Invalid environment: ${error.details.map((d) => d.message).join('; ')}`);
  return value as Env;
}

/** "12h" | "30m" | "45s" | "2d" | "3600" → seconds. */
export function durationToSeconds(v: string): number {
  const m = /^(\d+)([smhd]?)$/.exec(v.trim());
  if (!m) throw new Error(`Bad duration: ${v}`);
  const n = Number(m[1]);
  const mult = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2] as '' | 's' | 'm' | 'h' | 'd'];
  return n * mult;
}
