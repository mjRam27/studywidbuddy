import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ActivityItem, Page, SprintView, TaskCard, TaskDetail, WorkspaceOverview } from '@studywidbuddy/shared';
import { ActivityService } from '../activity/activity.service';
import { AuthUser, CurrentUser } from '../common/auth/auth-user';
import { CursorQuery } from '../common/http/pagination';
import {
  CommentDto,
  CreateSprintDto,
  CreateTaskDto,
  MoveTaskDto,
  SetDependenciesDto,
  TaskQueryDto,
  UpdateTaskDto,
} from './dto';
import { TasksService } from './tasks.service';
import { WorkspaceAccess } from './workspace-access.service';
import { WorkspaceService } from './workspace.service';

/** Project workspace API. Every route checks ACTIVE team membership (or admin). */
@ApiTags('workspace')
@ApiBearerAuth()
@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly workspace: WorkspaceService,
    private readonly activity: ActivityService,
    private readonly access: WorkspaceAccess,
  ) {}

  @Get('projects/:slug/workspace')
  @ApiOperation({ summary: 'Sprint, health, burndown, team load, blockers' })
  overview(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<WorkspaceOverview> {
    return this.workspace.overview(user, slug);
  }

  @Get('projects/:slug/tasks')
  list(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Query() q: TaskQueryDto): Promise<TaskCard[]> {
    return this.tasks.list(user, slug, q);
  }

  @Post('projects/:slug/tasks')
  create(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: CreateTaskDto): Promise<TaskDetail> {
    return this.tasks.create(user, slug, dto);
  }

  @Get('tasks/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<TaskDetail> {
    return this.tasks.detail(user, id);
  }

  @Patch('tasks/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskDetail> {
    return this.tasks.update(user, id, dto);
  }

  @Post('tasks/:id/move')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Kanban move: status transition + position. 409 on invalid transition or unfinished dependencies.',
  })
  move(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveTaskDto,
  ): Promise<TaskDetail> {
    return this.tasks.move(user, id, dto.status, dto.beforeTaskId);
  }

  @Put('tasks/:id/dependencies')
  dependencies(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDependenciesDto,
  ): Promise<TaskDetail> {
    return this.tasks.setDependencies(user, id, dto.dependsOn);
  }

  @Post('tasks/:id/comments')
  comment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentDto,
  ): Promise<TaskDetail> {
    return this.tasks.comment(user, id, dto.body);
  }

  @Get('projects/:slug/activity')
  async projectActivity(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Query() q: CursorQuery,
  ): Promise<Page<ActivityItem>> {
    const ctx = await this.access.bySlug(user, slug);
    return this.activity.list(ctx.projectId, q);
  }

  @Post('projects/:slug/sprints')
  createSprint(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: CreateSprintDto,
  ): Promise<SprintView> {
    return this.workspace.createSprint(user, slug, dto);
  }

  @Post('sprints/:id/start')
  @HttpCode(200)
  startSprint(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<SprintView> {
    return this.workspace.startSprint(user, id);
  }

  @Post('sprints/:id/complete')
  @HttpCode(200)
  completeSprint(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<SprintView> {
    return this.workspace.completeSprint(user, id);
  }
}
