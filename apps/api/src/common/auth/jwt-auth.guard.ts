import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@studywidbuddy/shared';
import type { Request } from 'express';
import { ENV, Env } from '../config/env';
import { AuthUser, IS_PUBLIC } from './auth-user';

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  typ: 'access';
}

/**
 * Global guard: every route needs `Authorization: Bearer <access token>` unless marked @Public().
 * On public routes a valid token is still read, so handlers can personalise responses.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true; // sockets authenticate in their gateway
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extract(req);

    if (token) {
      try {
        const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
          secret: this.env.JWT_ACCESS_SECRET,
          algorithms: ['HS256'],
        });
        if (claims.typ !== 'access') throw new Error('wrong token type');
        req.user = { id: claims.sub, role: claims.role };
      } catch {
        if (!isPublic) throw new UnauthorizedException('Your session has expired. Please sign in again.');
      }
    }
    if (!isPublic && !req.user) throw new UnauthorizedException('Please sign in.');
    return true;
  }

  private extract(req: Request): string | undefined {
    const [scheme, value] = (req.headers.authorization ?? '').split(' ');
    return scheme === 'Bearer' && value ? value : undefined;
  }
}
