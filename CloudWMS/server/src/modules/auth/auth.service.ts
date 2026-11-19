import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { getDummyHash, hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from './password';
import { AuthUser, JwtPayload } from './auth.types';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Warehouse) private readonly warehouses: Repository<Warehouse>,
  ) {}

  async login(email: string, password: string) {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect(['u.passwordHash', 'u.failedLoginAttempts', 'u.lockedUntil', 'u.tokenVersion'])
      .where('LOWER(u.email) = LOWER(:email)', { email: email.trim() })
      .getOne();

    // Same message and similar timing whether the email exists or not (no account enumeration)
    const invalid = new UnauthorizedException('Invalid email or password');

    if (!user) {
      await verifyPassword(password, await getDummyHash());
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Too many failed attempts. Account locked - try again in ${mins} minute(s).`,
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const attempts = user.failedLoginAttempts + 1;
      const lock = attempts >= MAX_FAILED_ATTEMPTS;
      await this.users.update(user.id, {
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
      });
      if (lock) this.logger.warn(`Account ${user.email} locked after ${MAX_FAILED_ATTEMPTS} failed sign-ins`);
      throw invalid;
    }
    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated. Contact your administrator.');
    }

    await this.users.update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });

    const payload: JwtPayload = { sub: user.id, tv: user.tokenVersion };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      user: await this.profile(user.id),
    };
  }

  /** Profile of the signed-in user, including the warehouses they can work in. */
  async profile(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: { company: true, warehouses: true },
    });
    const accessible =
      user.role === UserRole.ADMIN
        ? await this.warehouses.find({
            where: { company: { id: user.company?.id } },
            order: { code: 'ASC' },
          })
        : user.warehouses.sort((a, b) => a.code.localeCompare(b.code));

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      company: user.company ? { id: user.company.id, name: user.company.name } : null,
      warehouses: accessible
        .filter((w) => w.isActive)
        .map((w) => ({ id: w.id, code: w.code, name: w.name })),
      lastLoginAt: user.lastLoginAt,
    };
  }

  async changePassword(auth: AuthUser, currentPassword: string, newPassword: string) {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect(['u.passwordHash', 'u.tokenVersion'])
      .where('u.id = :id', { id: auth.id })
      .getOne();
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      throw new BadRequestException(`New password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException('New password must be different from the current one');
    }
    // Bumping the token version signs the user out everywhere else
    const tokenVersion = user.tokenVersion + 1;
    await this.users.update(user.id, { passwordHash: await hashPassword(newPassword), tokenVersion });
    return {
      message: 'Password changed. Other sessions have been signed out.',
      accessToken: await this.jwt.signAsync({ sub: user.id, tv: tokenVersion } satisfies JwtPayload),
    };
  }
}
