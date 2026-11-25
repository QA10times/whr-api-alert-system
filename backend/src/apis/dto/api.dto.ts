import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiAuthInputDto } from '../../common/auth-input.dto';
import { API_METHODS, HttpMethod } from '../../common/types';
import { EmptyToNull, IsHeaderMap, IsHttpUrl, IsJsonBody, IsJsonPathKey, NormalizeUrl, Trim } from '../../common/validators';

const FREQ = 'Frequency must be between 1 and 1440 minutes.';

/** ApiInput (design → Request DTOs). */
export class ApiInputDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Give the API a name.' })
  @MaxLength(150, { message: 'Keep the name under 150 characters.' })
  name: string;

  @IsIn(API_METHODS, { message: 'Pick a method.' })
  method: HttpMethod;

  @Trim()
  @IsString()
  @Matches(/^\//, { message: 'Endpoint must start with /, for example /api/v1/events.' })
  @MaxLength(1000, { message: 'Keep the endpoint under 1000 characters.' })
  endpoint: string;

  @IsOptional()
  @NormalizeUrl()
  @IsHttpUrl()
  baseUrlOverride?: string | null;

  @IsObject({ message: 'Pick an auth method.' })
  @ValidateNested()
  @Type(() => ApiAuthInputDto)
  auth: ApiAuthInputDto;

  @IsOptional()
  @IsHeaderMap()
  headers?: Record<string, string>;

  @IsOptional()
  @IsJsonBody()
  body?: unknown | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(100, { message: 'Keep the tag name under 100 characters.' })
  tagKey?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(200, { message: 'Keep the tag value under 200 characters.' })
  tagValue?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsJsonPathKey()
  countKey?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsJsonPathKey()
  dataKey?: string | null;

  /** null = inherit the module's frequency. */
  @IsOptional()
  @IsInt({ message: FREQ })
  @Min(1, { message: FREQ })
  @Max(1440, { message: FREQ })
  frequencyMinutes?: number | null;

  @IsBoolean()
  isActive: boolean;
}

export class ApiUpdateDto extends PartialType(ApiInputDto, { skipNullProperties: false }) {}
