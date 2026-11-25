import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/validators';

/** Lower-case, trim and de-duplicate a list of emails. */
const NormalizeEmails = () =>
  Transform(({ value }) =>
    Array.isArray(value)
      ? [...new Set(value.map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : e)).filter((e) => e !== ''))]
      : value,
  );

export class CreateEmailGroupDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Give the group a name.' })
  @MaxLength(100, { message: 'Keep the name under 100 characters.' })
  name: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @NormalizeEmails()
  @IsArray()
  @ArrayMaxSize(500)
  @IsEmail({}, { each: true, message: 'Each address must be a valid email, like name@10times.com.' })
  @MaxLength(254, { each: true })
  emails?: string[];
}

export class RenameEmailGroupDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Give the group a name.' })
  @MaxLength(100, { message: 'Keep the name under 100 characters.' })
  name: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class AddMembersDto {
  @NormalizeEmails()
  @IsArray()
  @ArrayMaxSize(500)
  @IsEmail({}, { each: true, message: 'Each address must be a valid email, like name@10times.com.' })
  @MaxLength(254, { each: true })
  emails: string[];
}
