import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { INTERVIEW_ANSWER_MAX } from '@studywidbuddy/shared';
import type {
  InterviewSlots,
  InterviewTurnRequest,
  InterviewTurnResponse,
  InterviewView,
  ScheduleInterviewRequest,
} from '@studywidbuddy/shared';
import { AuthUser, CurrentUser } from '../common/auth/auth-user';
import { InterviewsService } from './interviews.service';

class ScheduleDto implements ScheduleInterviewRequest {
  @ApiProperty({ description: '"now" or an ISO time from /slots' })
  @IsString()
  @Matches(/^(now|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)$/, { message: 'Use "now" or a slot time.' })
  at: string;
}

class TurnDto implements InterviewTurnRequest {
  @ApiProperty({ description: 'Position of the question being answered' })
  @IsInt()
  @Min(1)
  @Max(50)
  position: number;

  @ApiProperty({ maxLength: INTERVIEW_ANSWER_MAX })
  @IsString()
  @MaxLength(INTERVIEW_ANSWER_MAX)
  answer: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(3_600_000) thinkMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(3_600_000) speakMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) focusLost?: number;
}

@ApiTags('interviews')
@ApiBearerAuth()
@Controller()
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get('applications/:id/interview')
  byApplication(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) applicationId: string,
  ): Promise<InterviewView> {
    return this.interviews.viewByApplication(user, applicationId);
  }

  @Get('interviews/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<InterviewView> {
    return this.interviews.view(user, id);
  }

  @Get('interviews/:id/slots')
  @ApiOperation({ summary: '"Start now" plus hourly slots for the next 5 days, in your timezone' })
  slots(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<InterviewSlots> {
    return this.interviews.slots(user, id);
  }

  @Post('interviews/:id/schedule')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleDto,
  ): Promise<InterviewView> {
    return this.interviews.schedule(user, id, dto.at);
  }

  @Post('interviews/:id/start')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Join the booked voice interview; returns the interviewer’s opening words' })
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<InterviewView> {
    return this.interviews.start(user, id);
  }

  @Post('interviews/:id/turns')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a spoken answer; returns the interviewer’s next words' })
  turn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TurnDto,
  ): Promise<InterviewTurnResponse> {
    return this.interviews.turn(user, id, dto);
  }

  @Post('interviews/:id/retry')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<InterviewView> {
    return this.interviews.retry(user, id);
  }
}
