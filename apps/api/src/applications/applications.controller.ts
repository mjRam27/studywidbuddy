import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConflictResponse, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CV_MAX_BYTES } from '@studywidbuddy/shared';
import type { ApplicationView } from '@studywidbuddy/shared';
import type { Response } from 'express';
import { AuthUser, CurrentUser } from '../common/auth/auth-user';
import { ApplicationsService, type UploadedCv } from './applications.service';
import { CreateApplicationDto } from './dto';

@ApiTags('projects')
@ApiBearerAuth()
@Controller()
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post('projects/:projectId/applications')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('cv', { limits: { fileSize: CV_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['roleId', 'motivation', 'availabilityHoursPerWeek', 'cv'],
      properties: {
        roleId: { type: 'string', format: 'uuid' },
        motivation: { type: 'string' },
        availabilityHoursPerWeek: { type: 'integer' },
        relevantExperience: { type: 'string' },
        cv: { type: 'string', format: 'binary', description: 'PDF, at most 5 MB' },
      },
    },
  })
  @ApiOperation({ summary: 'Apply with a CV (PDF). The CV is screened by the AI ATS in the background.' })
  @ApiConflictResponse({ description: 'ALREADY_APPLIED, PROJECT_NOT_OPEN or ROLE_FILLED' })
  apply(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateApplicationDto,
    @UploadedFile() cv: UploadedCv | undefined,
  ): Promise<ApplicationView> {
    return this.applications.apply(user.id, projectId, dto, cv);
  }

  @Get('me/applications')
  mine(@CurrentUser() user: AuthUser): Promise<ApplicationView[]> {
    return this.applications.listMine(user.id);
  }

  @Get('applications/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ApplicationView> {
    return this.applications.get(user, id);
  }

  @Get('applications/:id/cv')
  @ApiOperation({ summary: 'Download the CV (the applicant or an admin)' })
  async cv(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.applications.cvFile(user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName.replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.data);
  }

  @Post('applications/:id/screening/retry')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  retryScreen(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ApplicationView> {
    return this.applications.retryScreen(user.id, id);
  }

  @Post('applications/:id/withdraw')
  @HttpCode(200)
  withdraw(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ApplicationView> {
    return this.applications.withdraw(user.id, id);
  }
}
