import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import { AuthUser, JwtPayload } from './auth.types';
import { UserRole } from '../users/entities/user.entity';

/**
 * Global guard: every endpoint requires a valid Bearer token unless marked @Public().
 *
 * The user is re-loaded on every request (one indexed query), so deactivating a user,
 * changing their role or their warehouses takes effect immediately - not when the
 * token expires.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Sign in required');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Session expired or invalid - please sign in again');
    }

    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.tokenVersion')
      .leftJoin('u.company', 'c')
      .addSelect('c.id')
      .leftJoin('u.warehouses', 'w')
      .addSelect(['w.id', 'w.isActive'])
      .where('u.id = :id', { id: payload.sub })
      .getOne();

    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException('Session is no longer valid - please sign in again');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.company?.id,
      warehouseIds: (user.warehouses ?? []).filter((w) => w.isActive).map((w) => w.id),
    };
    req.user = authUser;

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(authUser.role)) {
      throw new ForbiddenException(`This action requires role: ${roles.join(' or ')}`);
    }
    return true;
  }
}
