import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenType, Prisma } from '@prisma/client';
import { AuthResponse, CurrentUser, ErrorCode } from '@studywidbuddy/shared';
import { ENV, Env } from '../common/config/env';
import { conflict, DomainError } from '../common/errors/domain-error';
import { AccessTokenClaims } from '../common/auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { Mailer } from '../mail/mailer';
import { getDummyHash, hashPassword, newOpaqueToken, sha256, verifyPassword } from './crypto';
import { LoginDto, RegisterDto } from './dto';
import { RefreshTokensService } from './refresh-tokens.service';

const EMAIL_TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  EMAIL_VERIFICATION: 24 * 3_600_000,
  PASSWORD_RESET: 3_600_000,
};

export interface IssuedSession {
  response: AuthResponse;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(dto: RegisterDto, userAgent?: string): Promise<IssuedSession> {
    const [emailTaken, usernameTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } }),
      this.prisma.profile.findUnique({ where: { username: dto.username }, select: { userId: true } }),
    ]);
    if (emailTaken) throw conflict(ErrorCode.EMAIL_TAKEN, 'An account with this email already exists. Try signing in.');
    if (usernameTaken) throw conflict(ErrorCode.USERNAME_TAKEN, 'That username is taken.');

    const passwordHash = await hashPassword(dto.password);
    let userId: string;
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          profile: { create: { username: dto.username, displayName: dto.displayName } },
        },
        select: { id: true },
      });
      userId = user.id;
    } catch (e) {
      // Lost a race with a concurrent registration for the same email/username.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String((e.meta as { target?: unknown })?.target ?? '');
        throw target.includes('username')
          ? conflict(ErrorCode.USERNAME_TAKEN, 'That username is taken.')
          : conflict(ErrorCode.EMAIL_TAKEN, 'An account with this email already exists. Try signing in.');
      }
      throw e;
    }

    await this.sendVerificationEmail(userId);
    return this.startSession(userId, userAgent);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, passwordHash: true, status: true },
    });
    // Always run one hash verification so response time doesn't reveal whether the email exists.
    const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), dto.password);
    if (!user || !ok) {
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect.', HttpStatus.UNAUTHORIZED);
    }
    if (user.status !== 'ACTIVE') {
      throw new DomainError(ErrorCode.FORBIDDEN, 'This account is suspended.', HttpStatus.FORBIDDEN);
    }
    return this.startSession(user.id, userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<IssuedSession> {
    const rotated = await this.refreshTokens.rotate(refreshToken, userAgent);
    return { response: await this.buildAuthResponse(rotated.userId), refreshToken: rotated.token };
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) await this.refreshTokens.revokeByToken(refreshToken);
  }

  async me(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user || !user.profile)
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Please sign in.', HttpStatus.UNAUTHORIZED);
    return {
      id: user.id,
      email: user.email,
      emailVerified: !!user.emailVerifiedAt,
      role: user.role,
      username: user.profile.username,
      displayName: user.profile.displayName,
      avatarUrl: user.profile.avatarUrl,
      onboarded: !!user.profile.onboardedAt,
    };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
    if (user && !user.emailVerifiedAt) await this.sendVerificationEmail(userId);
  }

  async verifyEmail(token: string) {
    const row = await this.consumeEmailToken(token, AuthTokenType.EMAIL_VERIFICATION);
    await this.prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
  }

  /** Always succeeds from the caller's point of view, so it can't be used to discover accounts. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user) return;
    const token = await this.createEmailToken(user.id, AuthTokenType.PASSWORD_RESET);
    await this.mailer.send({
      to: user.email,
      subject: 'Reset your StudywidBuddy password',
      text: `Someone asked to reset your password. If that was you, open this link within an hour:\n\n${this.webUrl(`/reset-password?token=${token}`)}\n\nIf it wasn't you, you can ignore this email.`,
    });
  }

  async resetPassword(token: string, password: string) {
    const row = await this.consumeEmailToken(token, AuthTokenType.PASSWORD_RESET);
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      // Any other outstanding reset links die with this one.
      this.prisma.authToken.updateMany({
        where: { userId: row.userId, type: AuthTokenType.PASSWORD_RESET, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    await this.refreshTokens.revokeAllForUser(row.userId);
  }

  private async startSession(userId: string, userAgent?: string): Promise<IssuedSession> {
    const refreshToken = await this.refreshTokens.issue(userId, userAgent);
    return { response: await this.buildAuthResponse(userId), refreshToken };
  }

  private async buildAuthResponse(userId: string): Promise<AuthResponse> {
    const user = await this.me(userId);
    const claims: AccessTokenClaims = { sub: user.id, role: user.role, typ: 'access' };
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.ACCESS_TOKEN_TTL_SEC,
      algorithm: 'HS256',
    });
    return { accessToken, expiresIn: this.env.ACCESS_TOKEN_TTL_SEC, user };
  }

  private async sendVerificationEmail(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const token = await this.createEmailToken(userId, AuthTokenType.EMAIL_VERIFICATION);
    try {
      await this.mailer.send({
        to: user.email,
        subject: 'Confirm your email for StudywidBuddy',
        text: `Welcome to StudywidBuddy! Confirm your email address by opening this link:\n\n${this.webUrl(`/verify-email?token=${token}`)}\n\nThe link works for 24 hours.`,
      });
    } catch (e) {
      // Registration still succeeds; the user can ask for another email from the app.
      this.logger.warn(`Verification email to user ${userId} failed: ${(e as Error).message}`);
    }
  }

  private async createEmailToken(userId: string, type: AuthTokenType): Promise<string> {
    const token = newOpaqueToken();
    await this.prisma.authToken.create({
      data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS[type]) },
    });
    return token;
  }

  private async consumeEmailToken(token: string, type: AuthTokenType) {
    const invalid = new DomainError(
      ErrorCode.TOKEN_INVALID,
      'This link is invalid or has expired. Request a new one.',
      HttpStatus.BAD_REQUEST,
    );
    const row = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.type !== type || row.usedAt || row.expiresAt <= new Date()) throw invalid;
    const used = await this.prisma.authToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw invalid;
    return row;
  }

  private webUrl(path: string) {
    return `${this.env.WEB_ORIGIN[0]}${path}`;
  }
}
