import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@studywidbuddy/shared';

/** The authenticated caller, as established by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: UserRole;
}

export const IS_PUBLIC = 'isPublic';
/** Opt a route out of authentication. Everything else requires a valid access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

/** The caller. On @Public() routes this is undefined for anonymous requests. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
