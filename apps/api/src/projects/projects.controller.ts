import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SkillLevel } from '@studywidbuddy/shared';
import type { Page, ProjectDetail, ProjectSummary } from '@studywidbuddy/shared';
import { AuthUser, CurrentUser, Public } from '../common/auth/auth-user';
import { CursorQuery } from '../common/http/pagination';
import { ProjectsService } from './projects.service';

class ProjectListQuery extends CursorQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ enum: Object.values(SkillLevel) })
  @IsOptional()
  @IsEnum(SkillLevel)
  difficulty?: SkillLevel;

  @ApiPropertyOptional({ description: 'Skill slug in the tech stack, e.g. "angular"' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  skill?: string;

  @ApiPropertyOptional({ description: 'Role key or title, e.g. "frontend"' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  role?: string;
}

/** Project discovery is public; signed-in callers also get their skill match and application. */
@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Public()
  @Get()
  list(@Query() query: ProjectListQuery, @CurrentUser() user?: AuthUser): Promise<Page<ProjectSummary>> {
    return this.projects.list(query, user);
  }

  @Public()
  @Get(':slug')
  detail(@Param('slug') slug: string, @CurrentUser() user?: AuthUser): Promise<ProjectDetail> {
    return this.projects.detail(slug, user);
  }
}
