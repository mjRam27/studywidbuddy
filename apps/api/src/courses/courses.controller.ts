import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SkillLevel } from '@studywidbuddy/shared';
import type { CourseDetail, CourseSummary } from '@studywidbuddy/shared';
import { AuthUser, CurrentUser, Public } from '../common/auth/auth-user';
import { CoursesService } from './courses.service';

class CourseListQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ enum: Object.values(SkillLevel) })
  @IsOptional()
  @IsEnum(SkillLevel)
  level?: SkillLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;
}

/** The course catalogue is public so the landing page and logged-out visitors can browse it. */
@ApiTags('learning')
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Public()
  @Get()
  list(@Query() query: CourseListQuery): Promise<CourseSummary[]> {
    return this.courses.list(query);
  }

  @Public()
  @Get(':slug')
  detail(@Param('slug') slug: string, @CurrentUser() user?: AuthUser): Promise<CourseDetail> {
    return this.courses.detail(slug, user?.id);
  }
}
