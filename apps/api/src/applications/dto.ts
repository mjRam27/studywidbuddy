import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import type { CreateApplicationRequest } from '@studywidbuddy/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateApplicationDto implements CreateApplicationRequest {
  @ApiProperty()
  @IsUUID()
  roleId: string;

  @ApiProperty({ minLength: 40, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(40, 2000, { message: 'Tell the team a little more: at least 40 characters.' })
  motivation: string;

  @ApiProperty({ minimum: 1, maximum: 60 })
  // Multipart form fields arrive as strings.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  availabilityHoursPerWeek: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  relevantExperience?: string;
}
