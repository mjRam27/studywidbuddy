import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BUG_CATEGORIES,
  type BugCategory,
  DEBUG_LEVELS,
  type DebugAssistantRequest,
  type DebugLevel,
  type DebugListQuery,
  type DebugRunRequest,
  type DebugStatus,
} from '@studywidbuddy/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class DebugListDto implements DebugListQuery {
  @ApiPropertyOptional({ enum: DEBUG_LEVELS }) @IsOptional() @IsIn(DEBUG_LEVELS) level?: DebugLevel;
  @ApiPropertyOptional({ enum: BUG_CATEGORIES }) @IsOptional() @IsIn(BUG_CATEGORIES) category?: BugCategory;
  @ApiPropertyOptional({ enum: ['NEW', 'IN_PROGRESS', 'SOLVED'] })
  @IsOptional()
  @IsIn(['NEW', 'IN_PROGRESS', 'SOLVED'])
  status?: DebugStatus;
  @ApiPropertyOptional({ maxLength: 100 }) @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class DebugFileDto {
  @ApiProperty() @IsString() @MaxLength(200) path: string;
  @ApiProperty({ maxLength: 60_000 }) @IsString() @MaxLength(60_000) content: string;
}

export class DebugRunDto implements DebugRunRequest {
  @ApiProperty() @IsInt() @Min(0) @Max(500) passed: number;
  @ApiProperty() @IsInt() @Min(0) @Max(500) failed: number;

  @ApiProperty({ type: [DebugFileDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DebugFileDto)
  files: DebugFileDto[];
}

export class AssistantTurnDto {
  @ApiProperty({ enum: ['user', 'assistant'] }) @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @ApiProperty({ maxLength: 6000 }) @IsString() @MaxLength(6000) text: string;
}

export class DebugAssistantDto implements DebugAssistantRequest {
  @ApiProperty({ maxLength: 2000 }) @IsString() @MinLength(1) @MaxLength(2000) message: string;

  @ApiProperty({ type: [DebugFileDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DebugFileDto)
  files: DebugFileDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) activeFile?: string;
  @ApiPropertyOptional({ maxLength: 8000 }) @IsOptional() @IsString() @MaxLength(8000) lastRun?: string;

  @ApiPropertyOptional({ type: [AssistantTurnDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AssistantTurnDto)
  history?: AssistantTurnDto[];

  @ApiProperty({ description: 'Only when true may the assistant give the fix.' }) @IsBoolean() solution: boolean;
}
