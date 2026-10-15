import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Validate,
  ValidateIf,
} from 'class-validator';
import { Visibility } from '@studywidbuddy/shared';
import type { UpdateProfileRequest } from '@studywidbuddy/shared';
import { IsIanaTimezone } from './timezone.validator';

const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

export class UpdateProfileDto implements UpdateProfileRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  displayName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  headline?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  bio?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  location?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Europe/Berlin' })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @Validate(IsIanaTimezone)
  timezone?: string | null;

  @ApiPropertyOptional({ type: [String], example: ['English', 'German'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  languages?: string[];

  @ApiPropertyOptional({ enum: Object.values(Visibility) })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;
}
