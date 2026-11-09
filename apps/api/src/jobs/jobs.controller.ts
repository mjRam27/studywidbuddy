import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { JobDetail, JobListQuery, JobListResponse } from '@studywidbuddy/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth/auth-user';
import { JobsService } from './jobs.service';

class JobListDto implements JobListQuery {
  @ApiPropertyOptional({ maxLength: 100 }) @IsOptional() @IsString() @MaxLength(100) q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  remote?: boolean;

  @ApiPropertyOptional({ enum: ['matched', 'all'] }) @IsOptional() @IsIn(['matched', 'all']) scope?: 'matched' | 'all';

  @ApiPropertyOptional() @IsOptional() @IsNumberString() @MaxLength(6) cursor?: string;
}

@ApiTags('jobs')
@ApiBearerAuth()
@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get('jobs')
  @ApiOperation({ summary: 'Job listings ranked by how well they match your skills' })
  list(@CurrentUser() user: AuthUser, @Query() query: JobListDto): Promise<JobListResponse> {
    return this.jobs.list(user.id, query);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'A listing with its match explanation and courses for the gaps' })
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<JobDetail> {
    return this.jobs.detail(user.id, id);
  }

  @Post('admin/jobs/sync')
  @HttpCode(202)
  @Roles('ADMIN')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Admin: refresh listings from the job-board APIs now' })
  sync() {
    return this.jobs.requestSync();
  }
}
