import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';

/** The signed-in user, attached to every authenticated request by AuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  companyId: string;
  /** Warehouses the user may act in. Empty for ADMIN, who can access all of them. */
  warehouseIds: string[];
}

export interface JwtPayload {
  sub: string;
  /** token version - bumped on password change / deactivation to revoke old tokens */
  tv: number;
}

export function canAccessWarehouse(user: AuthUser, warehouseId: string): boolean {
  return user.role === UserRole.ADMIN || user.warehouseIds.includes(warehouseId);
}

export function assertWarehouseAccess(user: AuthUser, warehouseId: string): void {
  if (!canAccessWarehouse(user, warehouseId)) {
    throw new ForbiddenException('You are not assigned to this warehouse');
  }
}
