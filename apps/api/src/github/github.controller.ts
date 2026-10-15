import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  type RawBodyRequest,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { ConnectGithubResponse, GithubStatus, ProjectRepoView } from '@studywidbuddy/shared';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../common/auth/auth-user';
import { GithubService } from './github.service';
import { WebhookService } from './webhook.service';

@ApiTags('github')
@ApiBearerAuth()
@Controller()
export class GithubController {
  constructor(
    private readonly github: GithubService,
    private readonly webhooks: WebhookService,
  ) {}

  @Get('github/status')
  status(@CurrentUser() user: AuthUser): Promise<GithubStatus> {
    return this.github.status(user);
  }

  @Post('github/connect')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start linking your GitHub account; open the returned URL in the browser' })
  async connect(@CurrentUser() user: AuthUser): Promise<ConnectGithubResponse> {
    return { url: await this.github.connectUrl(user) };
  }

  /** GitHub redirects the browser here after authorization (no bearer token on this request). */
  @Public()
  @Get('github/callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiExcludeEndpoint()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    res.redirect(302, await this.github.completeLink(code, state));
  }

  @Delete('github/account')
  @HttpCode(204)
  async unlink(@CurrentUser() user: AuthUser) {
    await this.github.unlink(user);
  }

  @Get('projects/:slug/github')
  view(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<ProjectRepoView> {
    return this.github.view(user, slug);
  }

  @Post('projects/:slug/github/repo')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Admin: create the team’s private repository, GitHub team and starter files' })
  createRepo(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<ProjectRepoView> {
    return this.github.createRepo(user, slug);
  }

  @Post('projects/:slug/github/sync')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Give every linked team member access to the repo again' })
  sync(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.github.sync(user, slug);
  }

  /** GitHub webhooks. Authenticated by HMAC signature, not by a user token. */
  @Public()
  @SkipThrottle()
  @Post('github/webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-github-delivery') delivery: string | undefined,
  ) {
    if (!this.webhooks.verify(req.rawBody, signature)) throw new UnauthorizedException('Bad signature.');
    if (!event || !delivery) return { ok: true, result: 'ignored' };
    return { ok: true, result: await this.webhooks.handle(delivery, event, req.body as never) };
  }
}
