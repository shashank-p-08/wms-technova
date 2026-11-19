import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './AuthContext';
import type { Action } from './permissions';

/** Gate for signed-in routes; optionally also requires a permission. */
export default function RequireAuth({ action }: { action?: Action }) {
  const { user, initializing, can } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">
        Checking session…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (action && !can(action)) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
        <h2 className="mt-3 font-bold text-slate-900">Not available for your role</h2>
        <p className="text-xs text-slate-500 mt-1">
          Ask a company admin if you need access to this page.
        </p>
      </div>
    );
  }
  return <Outlet />;
}
