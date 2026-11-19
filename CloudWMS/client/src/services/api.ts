import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Auth token handling ────────────────────────────────────────────
const TOKEN_KEY = 'wms.token';

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable (private mode) - session lasts until reload */
    }
  },
};

apiClient.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Fired when the API rejects our token, so the app can return to the sign-in page. */
export const AUTH_EXPIRED_EVENT = 'wms:auth-expired';

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLogin = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLogin) {
      tokenStore.set(null);
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(err);
  },
);

/** Human-readable message from an API error. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string | string[] } }; message?: string };
  const msg = e?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg || e?.message || fallback;
}

// ── Types ──────────────────────────────────────────────────────────

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category?: { id: string; name: string };
  unitOfMeasurement: string;
  minimumStockLevel: number;
  /** Short-lived signed S3 URL when an image has been uploaded */
  imageUrl?: string;
  imageKey?: string | null;
  /** Total stock across the warehouses the signed-in user can see */
  totalQuantity: number;
  stockByWarehouse: { warehouseId: string; code: string; quantityOnHand: number }[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryOverviewItem {
  productId: string;
  sku: string;
  name: string;
  category: string;
  unitOfMeasurement: string;
  quantityOnHand: number;
  minimumStockLevel: number;
  status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';
  lastUpdated: string;
}

export interface InventoryTransaction {
  id: string;
  type: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT';
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reference: string;
  notes?: string;
  transactedAt: string;
  product: { id: string; sku: string; name: string; unitOfMeasurement: string };
  user?: { id: string; email: string; firstName?: string; lastName?: string } | null;
  warehouse?: { id: string; code: string; name: string } | null;
}

export interface CreateProductPayload {
  sku: string;
  name: string;
  description?: string;
  category: string;
  unitOfMeasurement: string;
  minimumStockLevel: number;
  imageUrl?: string;
}

export interface StockInPayload {
  warehouseId: string;
  productId: string;
  quantity: number;
  reference: string;
  notes?: string;
}

export interface StockOutPayload {
  warehouseId: string;
  productId: string;
  quantity: number;
  reference: string;
  notes?: string;
}

export interface AdjustStockPayload {
  warehouseId: string;
  productId: string;
  newQuantity: number;
  reference: string;
  notes?: string;
}

// ── API Methods ──────────────────────────────────────────────────

export const getProducts = async (params?: { search?: string; category?: string }) => {
  const res = await apiClient.get<Product[]>('/products', { params });
  return res.data;
};

export interface Category {
  id: string;
  name: string;
  productCount: number;
}

export const getCategories = async () => {
  const res = await apiClient.get<Category[]>('/products/categories');
  return res.data;
};

export const getProductById = async (id: string) => {
  const res = await apiClient.get<Product>(`/products/${id}`);
  return res.data;
};

export const createProduct = async (payload: CreateProductPayload) => {
  const res = await apiClient.post<Product>('/products', payload);
  return res.data;
};

export const deleteProduct = async (id: string) => {
  const res = await apiClient.delete<{ message: string; id: string }>(`/products/${id}`);
  return res.data;
};

/** Upload a product image to S3 (via the API). Max 5 MB; jpeg, png, webp or gif. */
export const uploadProductImage = async (id: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  // Let the browser set the multipart boundary instead of the JSON default
  const res = await apiClient.post<Product>(`/products/${id}/image`, form, {
    headers: { 'Content-Type': undefined },
  });
  return res.data;
};

export const deleteProductImage = async (id: string) => {
  const res = await apiClient.delete<Product>(`/products/${id}/image`);
  return res.data;
};

export const getInventoryOverview = async (warehouseId: string) => {
  const res = await apiClient.get<InventoryOverviewItem[]>('/inventory', { params: { warehouseId } });
  return res.data;
};

export const getLowStockItems = async (warehouseId: string) => {
  const res = await apiClient.get<InventoryOverviewItem[]>('/inventory/low-stock', {
    params: { warehouseId },
  });
  return res.data;
};

export const getTransactions = async (warehouseId: string | undefined, limit = 50) => {
  const res = await apiClient.get<InventoryTransaction[]>('/inventory/transactions', {
    params: { limit, ...(warehouseId ? { warehouseId } : {}) },
  });
  return res.data;
};

export const stockIn = async (payload: StockInPayload) => {
  const res = await apiClient.post('/inventory/stock-in', payload);
  return res.data;
};

export const stockOut = async (payload: StockOutPayload) => {
  const res = await apiClient.post('/inventory/stock-out', payload);
  return res.data;
};

export const adjustStock = async (payload: AdjustStockPayload) => {
  const res = await apiClient.post('/inventory/adjust', payload);
  return res.data;
};

// ── Auth ───────────────────────────────────────────────────────────
export type Role = 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER';

export interface WarehouseRef {
  id: string;
  code: string;
  name: string;
}

export interface Profile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  company: { id: string; name: string } | null;
  warehouses: WarehouseRef[];
  lastLoginAt?: string | null;
}

export const login = async (email: string, password: string) => {
  const res = await apiClient.post<{ accessToken: string; user: Profile }>('/auth/login', {
    email,
    password,
  });
  return res.data;
};

export const getProfile = async () => (await apiClient.get<Profile>('/auth/me')).data;

export const changePassword = async (currentPassword: string, newPassword: string) =>
  (
    await apiClient.post<{ message: string; accessToken: string }>('/auth/change-password', {
      currentPassword,
      newPassword,
    })
  ).data;

// ── Warehouses ─────────────────────────────────────────────────────
export interface WarehouseSummary extends WarehouseRef {
  address?: string | null;
  isActive: boolean;
  employeeCount: number;
  totalUnits: number;
}

export const getWarehouses = async () =>
  (await apiClient.get<WarehouseSummary[]>('/warehouses')).data;

export const createWarehouse = async (payload: { code: string; name: string; address?: string }) =>
  (await apiClient.post<WarehouseSummary>('/warehouses', payload)).data;

export const updateWarehouse = async (
  id: string,
  payload: { name?: string; address?: string; isActive?: boolean },
) => (await apiClient.patch<WarehouseSummary>(`/warehouses/${id}`, payload)).data;

// ── Users (admin) ──────────────────────────────────────────────────
export interface Employee {
  id: string;
  email: string;
  firstName: string;
  lastName?: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  warehouses: WarehouseRef[];
}

export interface EmployeePayload {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: Role;
  password?: string;
  warehouseIds?: string[];
  isActive?: boolean;
}

export const getUsers = async () => (await apiClient.get<Employee[]>('/users')).data;

export const createUser = async (payload: EmployeePayload) =>
  (await apiClient.post<Employee>('/users', payload)).data;

export const updateUser = async (id: string, payload: EmployeePayload) =>
  (await apiClient.patch<Employee>(`/users/${id}`, payload)).data;
