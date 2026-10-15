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
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ASSESSMENT_ANSWER_MAX, NOTE_MAX, TUTOR_MESSAGE_MAX } from '@studywidbuddy/shared';
import type {
  AnswerAssessmentRequest,
  AssessmentSummary,
  AssessmentView,
  CourseContentView,
  LessonContentUpdate,
  SaveNoteRequest,
  StudyLessonView,
  TutorAskRequest,
  TutorAskResponse,
  TutorMessageView,
} from '@studywidbuddy/shared';
import { AuthUser, CurrentUser, Roles } from '../common/auth/auth-user';
import { AssessmentsService } from './assessments.service';
import { StudyService } from './study.service';
import { TranscriptsService } from './transcripts.service';

class SaveNoteDto implements SaveNoteRequest {
  @ApiProperty()
  @IsString()
  @MaxLength(NOTE_MAX)
  body: string;
}

class TutorAskDto implements TutorAskRequest {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(TUTOR_MESSAGE_MAX)
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  lessonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  viaVoice?: boolean;

  @ApiPropertyOptional({ description: 'Seconds into the lesson video' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400)
  atSec?: number;
}

class AnswerDto implements AnswerAssessmentRequest {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(ASSESSMENT_ANSWER_MAX)
  answer: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  viaVoice?: boolean;
}

class LessonContentDto implements LessonContentUpdate {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  youtubeUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  summary?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(150_000)
  transcript?: string | null;
}

@ApiTags('study')
@ApiBearerAuth()
@Controller()
export class StudyController {
  constructor(
    private readonly study: StudyService,
    private readonly assessments: AssessmentsService,
    private readonly transcripts: TranscriptsService,
  ) {}

  // ───────── lessons & notes ─────────

  @Get('enrollments/:id/lessons/:lessonId')
  lesson(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<StudyLessonView> {
    return this.study.lesson(user.id, id, lessonId);
  }

  @Put('enrollments/:id/lessons/:lessonId/note')
  @ApiOperation({ summary: 'Save your private note on a lesson (empty body deletes it)' })
  note(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: SaveNoteDto,
  ) {
    return this.study.saveNote(user.id, id, lessonId, dto.body);
  }

  // ───────── AI Buddy ─────────

  @Get('enrollments/:id/tutor')
  tutorHistory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<TutorMessageView[]> {
    return this.study.tutorHistory(user.id, id);
  }

  @Post('enrollments/:id/tutor')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ask the AI Buddy (fast model). viaVoice keeps the answer short for speech.' })
  ask(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TutorAskDto,
  ): Promise<TutorAskResponse> {
    return this.study.ask(user.id, id, dto);
  }

  // ───────── voice checks ─────────

  @Get('enrollments/:id/assessments')
  assessmentsFor(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<AssessmentSummary[]> {
    return this.assessments.list(user.id, id);
  }

  @Post('enrollments/:id/assessments')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start a voice check on finished lessons (or return the open one)' })
  startAssessment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<AssessmentView> {
    return this.assessments.start(user.id, id);
  }

  @Get('assessments/:id')
  assessment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<AssessmentView> {
    return this.assessments.view(user.id, id);
  }

  @Put('assessments/:id/questions/:position/answer')
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('position', ParseIntPipe) position: number,
    @Body() dto: AnswerDto,
  ): Promise<AssessmentView> {
    return this.assessments.answer(user.id, id, position, dto.answer, !!dto.viaVoice);
  }

  @Post('assessments/:id/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<AssessmentView> {
    return this.assessments.submit(user.id, id);
  }

  @Post('assessments/:id/retry')
  @HttpCode(200)
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<AssessmentView> {
    return this.assessments.retry(user.id, id);
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  async discard(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.assessments.discard(user.id, id);
  }

  // ───────── admin: lesson videos & AI context ─────────

  @Get('admin/courses/:slug/content')
  @Roles('ADMIN')
  content(@Param('slug') slug: string): Promise<CourseContentView> {
    return this.study.courseContent(slug);
  }

  @Patch('admin/lessons/:id')
  @Roles('ADMIN')
  @HttpCode(204)
  @ApiOperation({ summary: 'Attach a YouTube video and the summary/transcript the AI Buddy uses' })
  async updateLesson(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LessonContentDto) {
    await this.study.updateLessonContent(id, dto);
  }

  @Post('admin/lessons/:id/transcript/generate')
  @Roles('ADMIN')
  @HttpCode(202)
  @ApiOperation({ summary: 'Generate the lesson transcript from its video (needs GEMINI_API_KEY)' })
  async generateTranscript(@Param('id', ParseUUIDPipe) id: string) {
    await this.transcripts.request(id);
  }

  @Post('admin/courses/:slug/transcripts/generate')
  @Roles('ADMIN')
  @HttpCode(202)
  @ApiOperation({ summary: 'Generate transcripts for every lesson video in the course that has none' })
  async generateCourseTranscripts(@Param('slug') slug: string): Promise<{ queued: number }> {
    return { queued: await this.transcripts.requestCourse(slug) };
  }
}
