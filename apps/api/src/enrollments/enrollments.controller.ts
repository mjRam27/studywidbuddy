import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { SkillLevel } from '@studywidbuddy/shared';
import type {
  CourseRecommendation,
  EnrollmentView,
  EnrollRequest,
  LearningStats,
  MyLearningResponse,
} from '@studywidbuddy/shared';
import { AuthUser, CurrentUser } from '../common/auth/auth-user';
import { EnrollmentsService } from './enrollments.service';
import { LearningInsightsService } from './learning-insights.service';

class EnrollDto implements EnrollRequest {
  @ApiProperty()
  @IsUUID()
  courseId: string;

  @ApiProperty({ enum: Object.values(SkillLevel) })
  @IsEnum(SkillLevel)
  level: SkillLevel;
}

@ApiTags('learning')
@ApiBearerAuth()
@Controller()
export class EnrollmentsController {
  constructor(
    private readonly enrollments: EnrollmentsService,
    private readonly insights: LearningInsightsService,
  ) {}

  @Get('me/learning')
  @ApiOperation({ summary: 'Active course slots and completion count for the dashboard' })
  myLearning(@CurrentUser() user: AuthUser): Promise<MyLearningResponse> {
    return this.enrollments.myLearning(user.id);
  }

  @Get('me/learning/stats')
  @ApiOperation({ summary: 'Streak, monthly totals and recent activity, derived from lesson progress' })
  stats(@CurrentUser() user: AuthUser): Promise<LearningStats> {
    return this.insights.stats(user.id);
  }

  @Get('me/learning/recommendations')
  @ApiOperation({ summary: 'Explainable course recommendations based on your skills' })
  recommendations(@CurrentUser() user: AuthUser): Promise<CourseRecommendation[]> {
    return this.insights.recommendations(user.id);
  }

  @Post('enrollments')
  @ApiOperation({ summary: 'Start a course (max four active)' })
  @ApiConflictResponse({ description: 'ACTIVE_COURSE_LIMIT_REACHED or ALREADY_ENROLLED' })
  enroll(@CurrentUser() user: AuthUser, @Body() dto: EnrollDto): Promise<EnrollmentView> {
    return this.enrollments.enroll(user.id, dto.courseId, dto.level);
  }

  @Get('enrollments/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<EnrollmentView> {
    return this.enrollments.view(user.id, id);
  }

  @Post('enrollments/:id/deregister')
  @HttpCode(204)
  @ApiOperation({ summary: 'Leave an active course, freeing a slot' })
  async deregister(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.enrollments.deregister(user.id, id);
  }

  @Post('enrollments/:id/lessons/:lessonId/complete')
  @HttpCode(200)
  completeLesson(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<EnrollmentView> {
    return this.enrollments.completeLesson(user.id, id, lessonId);
  }

  @Post('enrollments/:id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete a course once every lesson is done' })
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<EnrollmentView> {
    return this.enrollments.complete(user.id, id);
  }
}
