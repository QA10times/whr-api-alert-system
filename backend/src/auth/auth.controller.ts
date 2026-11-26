import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { LoginThrottle } from '../common/throttle';
import type { AuthUser } from '../common/types';
import { AuthService, LoginResult } from './auth.service';

class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Enter your password.' })
  @MaxLength(500)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @LoginThrottle()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return { email: user.email };
  }
}
