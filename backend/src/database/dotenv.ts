import { config as dotenv } from 'dotenv';

/** Load .env from backend/ then the repo root, without overriding real environment variables. */
export function config(): void {
  dotenv({ path: '.env' });
  dotenv({ path: '../.env' });
}
