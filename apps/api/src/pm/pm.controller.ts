import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { AGENT_GOAL_MAX, ErrorCode, MEETING_ANSWER_MAX } from '@studywidbuddy/shared';
import type {
  AgentRunSummary,
  AgentRunView,
  AgentToolCallView,
  AnswerMeetingRequest,
  MeetingKind,
  MeetingView,
  PmOverview,
  StartAgentRunRequest,
  UpdatePmSettingsRequest,
} from '@studywidbuddy/shared';
import { HttpStatus } from '@nestjs/common';
import { AiProvider } from '../ai/ai-provider';
import { AuthUser, CurrentUser } from '../common/auth/auth-user';
import { DomainError, notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { WorkspaceAccess } from '../tasks/workspace-access.service';
import { AgentService } from './agent.service';
import { MeetingsService } from './meetings.service';
import { MemoryService } from './memory.service';

class StartRunDto implements StartAgentRunRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(AGENT_GOAL_MAX)
  goal?: string;
}

class StartMeetingDto {
  @ApiProperty({ enum: ['CHECK_IN', 'FINAL_REVIEW'] })
  @IsIn(['CHECK_IN', 'FINAL_REVIEW'])
  kind: MeetingKind;
}

class AnswerDto implements AnswerMeetingRequest {
  @ApiProperty()
  @IsString()
  @Length(1, MEETING_ANSWER_MAX)
  answer: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  viaVoice?: boolean;
}

class SettingsDto implements UpdatePmSettingsRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 14 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(14)
  meetingIntervalDays?: number;
}

@ApiTags('ai-pm')
@ApiBearerAuth()
@Controller()
export class PmController {
  constructor(
    private readonly access: WorkspaceAccess,
    private readonly prisma: PrismaService,
    private readonly ai: AiProvider,
    private readonly agent: AgentService,
    private readonly meetings: MeetingsService,
    private readonly memory: MemoryService,
  ) {}

  @Get('projects/:slug/pm')
  @ApiOperation({ summary: 'AI PM tab: meetings, runs, pending approvals and memory' })
  async overview(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<PmOverview> {
    const ctx = await this.access.bySlug(user, slug);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: ctx.projectId },
      select: { aiPmEnabled: true, meetingIntervalDays: true },
    });
    const [meetings, runs, approvals, memory, nextCheckInAt] = await Promise.all([
      this.meetings.list(user, ctx.projectId),
      this.agent.runs(ctx.projectId),
      this.agent.approvals(ctx.projectId),
      this.memory.list(ctx.projectId, { limit: 60 }),
      this.meetings.nextCheckInAt(ctx.projectId),
    ]);
    return {
      enabled: project.aiPmEnabled,
      aiConfigured: this.ai.isConfigured(),
      meetingIntervalDays: project.meetingIntervalDays,
      nextCheckInAt,
      openMeeting: meetings.find((m) => ['PREPARING', 'OPEN', 'SUMMARIZING'].includes(m.status)) ?? null,
      meetings,
      runs,
      approvals,
      memory,
    };
  }

  @Patch('projects/:slug/pm/settings')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: turn the AI PM on/off and set the check-in interval' })
  async settings(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: SettingsDto) {
    const ctx = await this.access.bySlug(user, slug);
    if (!ctx.isAdmin) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'Only an admin can change AI PM settings.', HttpStatus.FORBIDDEN);
    }
    await this.prisma.project.update({
      where: { id: ctx.projectId },
      data: { aiPmEnabled: dto.enabled, meetingIntervalDays: dto.meetingIntervalDays },
    });
  }

  // ───────── agent runs ─────────

  @Post('projects/:slug/pm/runs')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ask the AI PM to review the project now (background run)' })
  startRun(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: StartRunDto,
  ): Promise<AgentRunSummary> {
    return this.agent.startManual(user, slug, dto.goal);
  }

  @Get('pm/runs/:id')
  run(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<AgentRunView> {
    return this.agent.run(user, id);
  }

  @Post('pm/proposals/:id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve an AI PM proposal: it runs now, as you' })
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<AgentToolCallView> {
    return this.agent.approve(user, id);
  }

  @Post('pm/proposals/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<AgentToolCallView> {
    return this.agent.reject(user, id);
  }

  // ───────── memory ─────────

  @Delete('projects/:slug/pm/memory/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a wrong memory (archived for the audit trail)' })
  async forget(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string) {
    const ctx = await this.access.bySlug(user, slug);
    if (!(await this.memory.archive(ctx.projectId, id))) throw notFound('Memory');
  }

  // ───────── meetings ─────────

  @Post('projects/:slug/meetings')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start a check-in now (members) or the final review (admins)' })
  startMeeting(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: StartMeetingDto,
  ): Promise<MeetingView> {
    return this.meetings.startNow(user, slug, dto.kind);
  }

  @Get('meetings/:id')
  meeting(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<MeetingView> {
    return this.meetings.view(user, id);
  }

  @Put('meetings/:id/questions/:position/answer')
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('position', ParseIntPipe) position: number,
    @Body() dto: AnswerDto,
  ): Promise<MeetingView> {
    return this.meetings.answer(user, id, position, dto.answer, !!dto.viaVoice);
  }

  @Post('meetings/:id/retry')
  @HttpCode(200)
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<MeetingView> {
    return this.meetings.retry(user, id);
  }
}
