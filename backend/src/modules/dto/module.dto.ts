import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ModuleAuthInputDto } from '../../common/auth-input.dto';
import { IsHeaderMap, IsHttpUrl, NormalizeUrl, Trim } from '../../common/validators';

const FREQ = 'Frequency must be between 1 and 1440 minutes.';

/** ModuleInput (design → Request DTOs). */
export class ModuleInputDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Give the module a name.' })
  @MaxLength(150, { message: 'Keep the name under 150 characters.' })
  name: string;

  @IsInt({ message: 'Pick an environment.' })
  environmentId: number;

  @NormalizeUrl()
  @IsHttpUrl()
  baseUrl: string;

  @IsObject({ message: 'Pick an auth method.' })
  @ValidateNested()
  @Type(() => ModuleAuthInputDto)
  auth: ModuleAuthInputDto;

  @IsOptional()
  @IsHeaderMap()
  headers?: Record<string, string>;

  @IsInt({ message: FREQ })
  @Min(1, { message: FREQ })
  @Max(1440, { message: FREQ })
  frequencyMinutes: number;

  @IsOptional()
  @IsInt({ message: 'Pick an email group.' })
  emailGroupId: number | null;

  @IsBoolean()
  isActive: boolean;
}

/** PATCH: omitted fields keep their value; null is only accepted where the field is nullable. */
export class ModuleUpdateDto extends PartialType(ModuleInputDto, { skipNullProperties: false }) {}
