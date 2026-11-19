import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AUTH_EXPIRED_EVENT,
  getProfile,
  login as apiLogin,
  tokenStore,
} from '../services/api';
import type { Profile, WarehouseRef } from '../services/api';
import { roleCan } from './permissions';
import type { Action } from './permissions';

const WAREHOUSE_KEY = 'wms.warehouse';

interface AuthState {
  user: Profile | null;
  /** True until the stored session has been checked on page load */
  initializing: boolean;
  warehouse: WarehouseRef | null;
  setWarehouse: (w: WarehouseRef) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-read the profile (e.g. after an admin changes warehouses) */
  refresh: () => Promise<void>;
  /** Replace the token after a password change */
  replaceToken: (token: string) => void;
  can: (action: Action) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

function pickWarehouse(user: Profile): WarehouseRef | null {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(WAREHOUSE_KEY);
  } catch {
    /* ignore */
  }
  return user.warehouses.find((w) => w.id === saved) ?? user.warehouses[0] ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [warehouse, setWarehouseState] = useState<WarehouseRef | null>(null);
  // Only "initializing" if there is a stored session to verify
  const [initializing, setInitializing] = useState(() => Boolean(tokenStore.get()));

  const applyProfile = useCallback((profile: Profile) => {
    setUser(profile);
    setWarehouseState(pickWarehouse(profile));
  }, []);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    setWarehouseState(null);
  }, []);

  const refresh = useCallback(async () => {
    applyProfile(await getProfile());
  }, [applyProfile]);

  // Restore an existing session on page load
  useEffect(() => {
    if (!tokenStore.get()) return;
    getProfile()
      .then(applyProfile)
      .catch(() => tokenStore.set(null))
      .finally(() => setInitializing(false));
  }, [applyProfile]);

  // Any 401 from the API (expired, revoked, deactivated) returns to the sign-in page
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setWarehouseState(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      initializing,
      warehouse,
      setWarehouse: (w) => {
        setWarehouseState(w);
        try {
          localStorage.setItem(WAREHOUSE_KEY, w.id);
        } catch {
          /* ignore */
        }
      },
      login: async (email, password) => {
        const res = await apiLogin(email, password);
        tokenStore.set(res.accessToken);
        applyProfile(res.user);
      },
      logout,
      refresh,
      replaceToken: (token) => tokenStore.set(token),
      can: (action) => roleCan(user?.role, action),
    }),
    [user, initializing, warehouse, applyProfile, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
