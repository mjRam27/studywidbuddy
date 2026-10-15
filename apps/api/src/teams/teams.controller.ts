import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { MyMembershipView, SelectionRunView, TeamView } from '@studywidbuddy/shared';
import { AuthUser, CurrentUser, Roles } from '../common/auth/auth-user';
import { TeamsService } from './teams.service';

@ApiTags('teams')
@ApiBearerAuth()
@Controller()
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  // ───────── Admin ─────────

  @Post('admin/projects/:projectId/selection-runs')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Propose a team (deterministic, explainable). Changes nothing until applied.' })
  propose(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<SelectionRunView> {
    return this.teams.propose(user.id, projectId);
  }

  @Get('admin/projects/:projectId/selection-runs/latest')
  @Roles('ADMIN')
  latest(@Param('projectId', ParseUUIDPipe) projectId: string): Promise<SelectionRunView> {
    return this.teams.latestRun(projectId);
  }

  @Post('admin/selection-runs/:runId/apply')
  @Roles('ADMIN')
  @HttpCode(200)
  @ApiOperation({ summary: 'High impact: forms the team, invites selected people, closes other applications.' })
  apply(@CurrentUser() user: AuthUser, @Param('runId', ParseUUIDPipe) runId: string): Promise<SelectionRunView> {
    return this.teams.apply(user.id, runId);
  }

  // ───────── Members ─────────

  @Get('me/teams')
  mine(@CurrentUser() user: AuthUser): Promise<MyMembershipView[]> {
    return this.teams.myMemberships(user.id);
  }

  @Post('team-members/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<MyMembershipView> {
    return this.teams.respond(user.id, id, true);
  }

  @Post('team-members/:id/decline')
  @HttpCode(200)
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<MyMembershipView> {
    return this.teams.respond(user.id, id, false);
  }

  @Get('projects/:slug/team')
  team(@Param('slug') slug: string): Promise<TeamView> {
    return this.teams.teamForProject(slug);
  }
}
