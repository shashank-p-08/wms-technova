import { useEffect, useRef, useState } from 'react';
import { MapPin, ChevronDown, LogOut, KeyRound, Check, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ROLE_LABELS } from '../../auth/permissions';
import { apiErrorMessage, changePassword } from '../../services/api';

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Warehouse Overview', subtitle: 'Live inventory telemetry & recent transactions' },
  '/products': { title: 'Product Catalog', subtitle: 'Manage SKUs, categories, and inventory thresholds' },
  '/inventory': { title: 'Stock & Bin Locations', subtitle: 'Monitor stock on hand, inbound & outbound logs' },
  '/transactions': { title: 'Transaction Ledger', subtitle: 'Full immutable audit trail of stock movements' },
  '/users': { title: 'Employees', subtitle: 'Accounts, roles and warehouse assignments' },
  '/warehouses': { title: 'Warehouses', subtitle: 'Company facilities' },
};

/** Close a popover when clicking elsewhere. */
function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return ref;
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { replaceToken } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setError('New passwords do not match');
    if (next.length < 10) return setError('New password must be at least 10 characters');
    setSaving(true);
    setError(null);
    try {
      const res = await changePassword(current, next);
      replaceToken(res.accessToken);
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not change password'));
    } finally {
      setSaving(false);
    }
  };

  const input =
    'w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">Change password</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        {done ? (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              Password changed. You stay signed in here; other sessions were signed out.
            </p>
            <button onClick={onClose} className="w-full px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            {error && <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">{error}</div>}
            <input type="password" autoComplete="current-password" required placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
            <input type="password" autoComplete="new-password" required placeholder="New password (min. 10 characters)" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
            <input type="password" autoComplete="new-password" required placeholder="Repeat new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
            <button type="submit" disabled={saving} className="w-full px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Change password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Header() {
  const { pathname } = useLocation();
  const { user, warehouse, setWarehouse, logout } = useAuth();
  const current = PAGE_TITLES[pathname] ?? { title: 'TechNova WMS', subtitle: 'Warehouse Management System' };

  const [whOpen, setWhOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const whRef = useClickOutside(() => setWhOpen(false));
  const userRef = useClickOutside(() => setUserOpen(false));

  if (!user) return null;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  const initials = fullName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  const role = ROLE_LABELS[user.role];

  return (
    <header className="h-16 bg-white/95 backdrop-blur-sm border-b border-slate-200/80 sticky top-0 z-20 flex items-center justify-between px-6 lg:px-8">
      <div className="flex items-center gap-6 min-w-0">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 leading-tight truncate">{current.title}</h1>
          <p className="text-xs text-slate-500 hidden sm:block truncate">{current.subtitle}</p>
        </div>

        {/* Warehouse selector: scopes inventory, dashboard and ledger */}
        <div className="relative" ref={whRef}>
          <button
            onClick={() => setWhOpen((o) => !o)}
            disabled={!user.warehouses.length}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/70 text-xs font-medium text-slate-700 border border-slate-200 transition disabled:opacity-60"
            aria-haspopup="listbox"
            aria-expanded={whOpen}
          >
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            <span className="whitespace-nowrap">
              {warehouse ? `${warehouse.code} · ${warehouse.name}` : 'No warehouse assigned'}
            </span>
            {user.warehouses.length > 1 && <ChevronDown className="w-3 h-3 text-slate-400" />}
          </button>
          {whOpen && user.warehouses.length > 1 && (
            <ul role="listbox" className="absolute left-0 mt-1.5 w-64 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-30">
              {user.warehouses.map((w) => (
                <li key={w.id}>
                  <button
                    onClick={() => {
                      setWarehouse(w);
                      setWhOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 text-left"
                  >
                    <span>
                      <span className="font-mono font-bold text-slate-900">{w.code}</span>
                      <span className="text-slate-500"> · {w.name}</span>
                    </span>
                    {w.id === warehouse?.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* User menu */}
      <div className="relative" ref={userRef}>
        <button onClick={() => setUserOpen((o) => !o)} className="flex items-center gap-2.5 pl-1 rounded-lg" aria-haspopup="menu" aria-expanded={userOpen}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-slate-900 to-blue-900 text-white flex items-center justify-center font-bold text-xs shadow-sm">
            {initials}
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-xs font-bold text-slate-800 leading-none">{fullName}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {role.label}
              {user.company ? ` · ${user.company.name}` : ''}
            </div>
          </div>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
        {userOpen && (
          <div role="menu" className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-30">
            <div className="px-3 py-2 border-b border-slate-100">
              <div className="text-xs font-semibold text-slate-800 truncate">{user.email}</div>
              <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${role.badge}`}>{role.label}</span>
            </div>
            <button
              role="menuitem"
              onClick={() => {
                setUserOpen(false);
                setPwOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              <KeyRound className="w-3.5 h-3.5" /> Change password
            </button>
            <button role="menuitem" onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        )}
      </div>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </header>
  );
}
