import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { TASK_STATUSES } from '@studywidbuddy/shared';
import type {
  CreateTaskRequest,
  MoveTaskRequest,
  TaskPriority,
  TaskStatus,
  UpdateTaskRequest,
} from '@studywidbuddy/shared';

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const nullable = (_: object, v: unknown) => v !== null;

export class CreateTaskDto implements CreateTaskRequest {
  @ApiProperty() @Transform(trim) @IsString() @Length(3, 200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @Length(1, 300, { each: true })
  acceptanceCriteria?: string[];
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: TaskPriority;
  @ApiPropertyOptional({ enum: [1, 2, 3, 5, 8, 13] }) @IsOptional() @IsInt() estimate?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsUUID() roleId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsUUID() assigneeId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsUUID() sprintId?: string | null;
  @ApiPropertyOptional({ enum: ['BACKLOG', 'TODO'] }) @IsOptional() @IsIn(['BACKLOG', 'TODO']) status?:
    'BACKLOG' | 'TODO';
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsDateString() dueDate?: string | null;
}

export class UpdateTaskDto implements UpdateTaskRequest {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(3, 200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @Length(1, 300, { each: true })
  acceptanceCriteria?: string[];
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: TaskPriority;
  @ApiPropertyOptional() @IsOptional() @IsInt() estimate?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsUUID() roleId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsUUID() assigneeId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsUUID() sprintId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsDateString() dueDate?: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'feature/task-24-refresh-tokens' })
  @IsOptional()
  @ValidateIf(nullable)
  @Matches(/^[A-Za-z0-9._/-]{1,120}$/, { message: 'Use a valid git branch name.' })
  branch?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf(nullable)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(300)
  pullRequestUrl?: string | null;
}

export class MoveTaskDto implements MoveTaskRequest {
  @ApiProperty({ enum: TASK_STATUSES }) @IsIn(TASK_STATUSES as unknown as string[]) status: TaskStatus;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsUUID() beforeTaskId?: string | null;
}

export class SetDependenciesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true }) dependsOn: string[];
}

export class CommentDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 4000) body: string;
}

export class TaskQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() sprintId?: string;
  @ApiPropertyOptional({ enum: TASK_STATUSES })
  @IsOptional()
  @IsIn(TASK_STATUSES as unknown as string[])
  status?: TaskStatus;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: TaskPriority;
  @ApiPropertyOptional() @IsOptional() @IsUUID() roleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assigneeId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;
}

export class CreateSprintDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(3, 300) goal: string;
  @ApiProperty() @IsDateString() startsAt: string;
  @ApiProperty() @IsDateString() endsAt: string;
}
