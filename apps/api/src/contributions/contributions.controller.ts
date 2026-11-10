import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import type {
  ContributionCalendar,
  ContributionDayDetail,
  ContributionQuery,
  DebugProfileStats,
} from '@studywidbuddy/shared';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth/auth-user';
import { ContributionsService } from './contributions.service';

class ContributionQueryDto implements ContributionQuery {
  @ApiPropertyOptional({ description: 'Comma-separated: DEBUG,STUDY,TASK,PROJECT,INTERVIEW' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  kinds?: string;
}

class DayParam {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a date like 2026-11-10.' })
  date: string;

  @IsString()
  username: string;
}

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles/:username')
export class ContributionsController {
  constructor(private readonly contributions: ContributionsService) {}

  @Get('contributions')
  @ApiOperation({ summary: 'The activity graph: one square per day for the last 53 weeks' })
  calendar(
    @CurrentUser() viewer: AuthUser,
    @Param('username') username: string,
    @Query() query: ContributionQueryDto,
  ): Promise<ContributionCalendar> {
    return this.contributions.calendar(username, viewer, query.kinds);
  }

  @Get('contributions/:date')
  @ApiOperation({ summary: 'Everything done on one day' })
  day(
    @CurrentUser() viewer: AuthUser,
    @Param() params: DayParam,
    @Query() query: ContributionQueryDto,
  ): Promise<ContributionDayDetail> {
    return this.contributions.day(params.username, viewer, params.date, query.kinds);
  }

  @Get('debugging')
  @ApiOperation({ summary: 'Debug exercises solved, by level, with recent solves' })
  debugging(@CurrentUser() viewer: AuthUser, @Param('username') username: string): Promise<DebugProfileStats> {
    return this.contributions.debugging(username, viewer);
  }
}
