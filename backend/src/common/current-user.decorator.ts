import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './types';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user;
});

/** Client IP (trust proxy resolves X-Forwarded-For from Next.js). */
export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  const ip = ctx.switchToHttp().getRequest<Request>().ip ?? null;
  return ip?.replace(/^::ffff:/, '') ?? null;
});
