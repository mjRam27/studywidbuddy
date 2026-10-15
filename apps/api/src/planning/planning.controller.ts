import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { PlanProposalView } from '@studywidbuddy/shared';
import { AuthUser, CurrentUser } from '../common/auth/auth-user';
import { PlanningService } from './planning.service';

@ApiTags('workspace')
@ApiBearerAuth()
@Controller()
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Post('projects/:slug/plans')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ask the AI PM for a plan proposal (background job). Nothing is created until approved.' })
  request(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<PlanProposalView> {
    return this.planning.request(user, slug);
  }

  @Get('projects/:slug/plans/latest')
  latest(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<PlanProposalView> {
    return this.planning.latest(user, slug);
  }

  @Post('plans/:id/apply')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a proposal: creates milestones, sprints, tasks and dependencies.' })
  apply(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<PlanProposalView> {
    return this.planning.apply(user, id);
  }

  @Post('plans/:id/discard')
  @HttpCode(200)
  discard(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<PlanProposalView> {
    return this.planning.discard(user, id);
  }
}
