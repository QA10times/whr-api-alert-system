import { applyDecorators, Injectable, UseGuards } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthUser } from './types';

/** Named throttlers registered in AppModule. */
export const LOGIN_THROTTLE = 'login'; // 5 per minute per IP
export const SECRETS_THROTTLE = 'secrets'; // SECRET_ACCESS_RATE_PER_MIN per user

/** Throttles by the signed-in user's email (falls back to IP). */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as AuthUser | undefined;
    return user?.email ?? (req as unknown as Request).ip ?? 'unknown';
  }
}

@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return (req as unknown as Request).ip ?? 'unknown';
  }
}

/** Login: 5 attempts per minute per IP (X-Forwarded-For honoured via trust proxy). */
export const LoginThrottle = () => applyDecorators(SkipThrottle({ [SECRETS_THROTTLE]: true }), UseGuards(IpThrottlerGuard));

/** Copy curl + credential reveal share one per-user limit. */
export const SecretAccessThrottle = () =>
  applyDecorators(SkipThrottle({ [LOGIN_THROTTLE]: true }), UseGuards(UserThrottlerGuard));

