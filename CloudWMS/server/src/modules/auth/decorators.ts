import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { AuthUser } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Skip authentication (login, health check). Everything else requires a valid token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict an endpoint to the given roles. Without it, any signed-in user is allowed. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Inject the signed-in user into a controller method. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
