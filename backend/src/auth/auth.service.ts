import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { parseAuthUsers } from '../config/auth-users.parser';
import { ENV } from '../config/env.token';
import { durationToSeconds, Env } from '../config/env.validation';

export interface LoginResult {
  accessToken: string;
  expiresIn: number; // seconds
  email: string;
}

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest();

@Injectable()
export class AuthService {
  private readonly users: Map<string, string>;
  private readonly expiresIn: number;

  constructor(
    @Inject(ENV) env: Env,
    private readonly jwt: JwtService,
  ) {
    this.users = parseAuthUsers(env.AUTH_USERS); // parsed once at boot
    this.expiresIn = durationToSeconds(env.JWT_EXPIRES_IN);
  }

  hasUser(email: string): boolean {
    return this.users.has(email.toLowerCase());
  }

  async login(emailRaw: string, password: string): Promise<LoginResult> {
    const email = emailRaw.trim().toLowerCase();
    const stored = this.users.get(email);
    const ok = await this.check(stored ?? '\u0000no-user', password);
    if (!stored || !ok) throw new UnauthorizedException('Email or password is incorrect.');
    const accessToken = await this.jwt.signAsync({ sub: email, email }, { expiresIn: this.expiresIn });
    return { accessToken, expiresIn: this.expiresIn, email };
  }

  /** bcrypt.compare when the stored value is a hash ($2…), else a constant-time comparison. */
  private async check(stored: string, password: string): Promise<boolean> {
    if (stored.startsWith('$2')) return bcrypt.compare(password, stored);
    return timingSafeEqual(sha(stored), sha(password));
  }
}
