import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './pages/Login/LoginPage';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';

// Each page is its own chunk, downloaded on first visit (the sign-in screen stays small)
const DashboardPage = lazy(() => import('./pages/Dashboard/DashboardPage'));
const ProductsPage = lazy(() => import('./pages/Products/ProductsPage'));
const InventoryPage = lazy(() => import('./pages/Inventory/InventoryPage'));
const TransactionsPage = lazy(() => import('./pages/Transactions/TransactionsPage'));
const UsersPage = lazy(() => import('./pages/Users/UsersPage'));
const WarehousesPage = lazy(() => import('./pages/Warehouses/WarehousesPage'));

const pageFallback = <div className="py-16 text-center text-xs text-slate-400">Loading…</div>;

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={pageFallback}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route path="/" element={<Layout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="inventory" element={<InventoryPage />} />
                  <Route path="transactions" element={<TransactionsPage />} />
                  <Route element={<RequireAuth action="manageUsers" />}>
                    <Route path="users" element={<UsersPage />} />
                  </Route>
                  <Route element={<RequireAuth action="manageWarehouses" />}>
                    <Route path="warehouses" element={<WarehousesPage />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
