import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Boxes,
  ArrowLeftRight,
  Warehouse,
  ShieldCheck,
  Users,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import type { Action } from '../../auth/permissions';

type NavItem = { icon: typeof Package; label: string; path: string; badge?: string; action?: Action };

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Package, label: 'Products', path: '/products' },
  { icon: Boxes, label: 'Inventory', path: '/inventory' },
  { icon: ArrowLeftRight, label: 'Transactions', path: '/transactions' },
];

const ADMIN_ITEMS: NavItem[] = [
  { icon: Users, label: 'Employees', path: '/users', action: 'manageUsers' },
  { icon: Building2, label: 'Warehouses', path: '/warehouses', action: 'manageWarehouses' },
];

function NavItems({ items }: { items: NavItem[] }) {
  return (
    <>
      {items.map(({ icon: Icon, label, path, badge }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={({ isActive }) =>
            `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
              isActive
                ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`
          }
        >
          <div className="flex items-center gap-3">
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
          </div>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{badge}</span>
          )}
        </NavLink>
      ))}
    </>
  );
}

export default function Sidebar() {
  const { can } = useAuth();
  const adminItems = ADMIN_ITEMS.filter((i) => !i.action || can(i.action));
  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col bg-slate-950 border-r border-slate-800/80 z-30 select-none">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-800/80 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <Warehouse className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold text-white tracking-tight text-base leading-none">TechNova</div>
          <div className="text-[11px] text-blue-400 font-semibold uppercase tracking-wider mt-1">Cloud WMS</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Core Operations
        </div>

        <NavItems items={NAV_ITEMS} />

        {adminItems.length > 0 && (
          <>
            <div className="px-3 pt-6 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Administration
            </div>
            <NavItems items={adminItems} />
          </>
        )}
      </nav>

      {/* Cloud Emulator Status Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/60">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              AWS Emulator
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-200 truncate">Floci (LocalStack API)</p>
          <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">:4566 · S3 · Secrets Manager</p>
        </div>
      </div>
    </aside>
  );
}
