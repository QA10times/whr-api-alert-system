import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { HEADER_NAME_RE } from './headers.util';
import type { ApiAuthMethod } from './types';
import { Matches } from 'class-validator';

export class AuthConfigDto {
  @IsOptional() @IsString() @MaxLength(4000) token?: string;
  @IsOptional() @IsString() @MaxLength(500) username?: string;
  @IsOptional() @IsString() @MaxLength(1000) password?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(new RegExp(`(^$)|${HEADER_NAME_RE.source}`), { message: 'Header name can only use letters, digits and - _ . characters.' })
  headerName?: string;
  @IsOptional() @IsString() @MaxLength(4000) apiKey?: string;
  @IsOptional() @IsString() @MaxLength(8000) cookie?: string;
}

const MODULE_METHODS = ['NONE', 'BEARER', 'BASIC', 'API_KEY', 'COOKIE'];

export class ModuleAuthInputDto {
  @IsIn(MODULE_METHODS, { message: 'Pick an auth method.' })
  method: Exclude<ApiAuthMethod, 'INHERIT'>;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthConfigDto)
  config?: AuthConfigDto;
}

export class ApiAuthInputDto {
  @IsIn([...MODULE_METHODS, 'INHERIT'], { message: 'Pick an auth method.' })
  method: ApiAuthMethod;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthConfigDto)
  config?: AuthConfigDto;
}
