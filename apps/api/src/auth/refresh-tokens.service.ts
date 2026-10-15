import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ENV, Env } from '../common/config/env';
import { PrismaService } from '../common/prisma/prisma.service';
import { newOpaqueToken, sha256 } from './crypto';

const DAY_MS = 86_400_000;

/**
 * Rotating refresh tokens with reuse detection.
 *
 * Every refresh consumes the presented token and issues a new one in the same family.
 * Presenting an already-consumed (or revoked) token means it was copied: the whole family
 * is revoked, which signs out both the attacker and the real user.
 */
@Injectable()
export class RefreshTokensService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issue(userId: string, userAgent?: string, familyId: string = randomUUID()): Promise<string> {
    const token = newOpaqueToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
        userAgent: userAgent?.slice(0, 300),
      },
    });
    return token;
  }

  /** Consumes `token` and returns the user id plus a fresh token. Throws 401 on any problem. */
  async rotate(token: string, userAgent?: string): Promise<{ userId: string; token: string }> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row) throw new UnauthorizedException('Please sign in again.');

    if (row.revokedAt || row.rotatedAt) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('Please sign in again.');
    }
    if (row.expiresAt <= new Date()) throw new UnauthorizedException('Your session has expired. Please sign in again.');

    // Conditional update: only one concurrent request can consume this token.
    const consumed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date() },
    });
    if (consumed.count !== 1) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('Please sign in again.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: row.userId }, select: { status: true } });
    if (!user || user.status !== 'ACTIVE') {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('This account is not active.');
    }

    return { userId: row.userId, token: await this.issue(row.userId, userAgent, row.familyId) };
  }

  async revokeByToken(token: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (row) await this.revokeFamily(row.familyId);
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
