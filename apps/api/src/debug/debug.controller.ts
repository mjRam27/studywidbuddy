import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  DebugAssistantResponse,
  DebugAttemptView,
  DebugExerciseView,
  DebugListResponse,
  DebugReview,
  DebugRunResponse,
} from '@studywidbuddy/shared';
import { AuthUser, CurrentUser } from '../common/auth/auth-user';
import { DebugService } from './debug.service';
import { DebugAssistantDto, DebugListDto, DebugRunDto } from './dto';

@ApiTags('debug')
@ApiBearerAuth()
@Controller('debug/exercises')
export class DebugController {
  constructor(private readonly debug: DebugService) {}

  @Get()
  @ApiOperation({ summary: 'Exercises with your progress, filtered by level, bug type, status or text' })
  list(@CurrentUser() user: AuthUser, @Query() query: DebugListDto): Promise<DebugListResponse> {
    return this.debug.list(user.id, query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One exercise: the buggy files and read-only tests (never the solution)' })
  view(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<DebugExerciseView> {
    return this.debug.view(user.id, slug);
  }

  @Post(':slug/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start the clock on an exercise (idempotent)' })
  start(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<DebugAttemptView> {
    return this.debug.start(user.id, slug);
  }

  @Post(':slug/runs')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record a test run; the first all-green run solves it and returns the review' })
  run(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: DebugRunDto): Promise<DebugRunResponse> {
    return this.debug.run(user.id, slug, dto);
  }

  @Get(':slug/review')
  @ApiOperation({ summary: 'After solving: each bug, the fix, why, and your time' })
  review(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<DebugReview> {
    return this.debug.review(user.id, slug);
  }

  @Post(':slug/assistant')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ask the Debug coach (Gemini). It never edits your code.' })
  async assistant(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: DebugAssistantDto,
  ): Promise<DebugAssistantResponse> {
    return { reply: await this.debug.assistant(user, slug, dto) };
  }
}
