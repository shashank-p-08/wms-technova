import type { Role } from '../services/api';

/**
 * What each role may do. The API enforces the same rules (and also checks the
 * warehouse assignment); this only decides which buttons the UI shows.
 */
export type Action =
  | 'manageUsers'
  | 'manageWarehouses'
  | 'editProducts'
  | 'deleteProducts'
  | 'moveStock'
  | 'adjustStock';

const MATRIX: Record<Action, Role[]> = {
  manageUsers: ['ADMIN'],
  manageWarehouses: ['ADMIN'],
  editProducts: ['ADMIN', 'MANAGER'],
  deleteProducts: ['ADMIN'],
  moveStock: ['ADMIN', 'MANAGER', 'STAFF'],
  adjustStock: ['ADMIN', 'MANAGER'],
};

export const roleCan = (role: Role | undefined, action: Action) =>
  !!role && MATRIX[action].includes(role);

export const ROLE_LABELS: Record<Role, { label: string; description: string; badge: string }> = {
  ADMIN: {
    label: 'Admin',
    description: 'Full access to all warehouses, manages employees and warehouses',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  MANAGER: {
    label: 'Manager',
    description: 'Products, receiving, dispatch and stock adjustments in assigned warehouses',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  STAFF: {
    label: 'Staff',
    description: 'Receiving (stock in) and dispatch (stock out) in assigned warehouses',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  VIEWER: {
    label: 'Viewer',
    description: 'Read-only access to assigned warehouses',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};
