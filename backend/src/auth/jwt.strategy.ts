import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../common/types';
import { ENV } from '../config/env.token';
import type { Env } from '../config/env.validation';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ENV) env: Env,
    private readonly auth: AuthService,
  ) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: env.JWT_SECRET, ignoreExpiration: false });
  }

  validate(payload: { email?: string }): AuthUser {
    // A user removed from AUTH_USERS loses access even with an unexpired token.
    if (!payload.email || !this.auth.hasUser(payload.email)) throw new UnauthorizedException();
    return { email: payload.email };
  }
}
