import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthResponse, CSRF_HEADER, CurrentUser as CurrentUserView } from '@studywidbuddy/shared';
import type { CookieOptions, Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../common/auth/auth-user';
import { ENV, Env } from '../common/config/env';
import { AuthService, IssuedSession } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './dto';

export const REFRESH_COOKIE = 'sb_refresh';
/** The refresh cookie is only ever sent to the auth routes. */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** 10 attempts a minute per IP on credential endpoints. */
const STRICT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Throttle(STRICT)
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session' })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.startSession(res, await this.auth.register(dto, req.headers['user-agent']));
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.startSession(res, await this.auth.login(dto, req.headers['user-agent']));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: `Rotate the refresh cookie and get a new access token. Requires the ${CSRF_HEADER} header.`,
  })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    this.assertCsrfHeader(req);
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('Please sign in.');
    try {
      return this.startSession(res, await this.auth.refresh(token, req.headers['user-agent']));
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertCsrfHeader(req);
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser): Promise<CurrentUserView> {
    return this.auth.me(user.id);
  }

  @Public()
  @Throttle(STRICT)
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-verification')
  @HttpCode(204)
  @ApiBearerAuth()
  async resendVerification(@CurrentUser() user: AuthUser) {
    await this.auth.resendVerification(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Email a reset link. Always 204, whether or not the account exists.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(STRICT)
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  private startSession(res: Response, session: IssuedSession): AuthResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    });
    return session.response;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }

  /**
   * Cookie-authenticated routes need a custom header. Browsers can't add one to a cross-site
   * request without a CORS preflight, which our origin allowlist rejects.
   */
  private assertCsrfHeader(req: Request) {
    if (!req.headers[CSRF_HEADER]) throw new UnauthorizedException('Missing CSRF header.');
  }
}
