// ============================================
// TechNova WMS — Shared TypeScript Types
// These interfaces define the shape of our
// data throughout the entire application.
// ============================================

// ── Navigation ──────────────────────────────
export interface NavItem {
    label: string;
    path: string;
    icon: string;
}

// ── Dashboard ───────────────────────────────
export interface DashboardStats {
    totalProducts: number;
    totalQuantity: number;
    lowStockCount: number;
    outOfStockCount: number;
}

// ── Product ─────────────────────────────────
export interface Product {
    id: string;
    sku: string;
    name: string;
    description: string;
    category: ProductCategory;
    unitOfMeasurement: string;
    minimumStockLevel: number;
    imageUrl?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ProductCategory {
    id: string;
    name: string;
}

// ── Inventory ───────────────────────────────
export interface Inventory {
    id: string;
    product: Product;
    quantityOnHand: number;
    updatedAt: string;
}

// ── Inventory Transactions ───────────────────
export type TransactionType = 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT';

export interface InventoryTransaction {
    id: string;
    product: Product;
    type: TransactionType;
    quantity: number;
    quantityBefore: number;
    quantityAfter: number;
    reference: string;
    notes?: string;
    transactedAt: string;
    user: { id: string; email: string };
}

// ── API ─────────────────────────────────────
export interface ApiResponse<T> {
    data: T;
    message: string;
    success: boolean;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
}

// ── Auth ─────────────────────────────────────
export type UserRole = 'ADMIN' | 'WAREHOUSE_EMPLOYEE';

export interface User {
    id: string;
    email: string;
    role: UserRole;
}