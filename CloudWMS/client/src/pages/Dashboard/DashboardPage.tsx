import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Boxes,
  AlertTriangle,
  XCircle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  RotateCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getInventoryOverview,
  getTransactions,
  apiErrorMessage,
} from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import type {
  InventoryOverviewItem,
  InventoryTransaction,
} from '../../services/api';

interface StatCardProps {
  title: string;
  value: string | number;
  change: string;
  isPositive: boolean;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'blue' | 'emerald' | 'amber' | 'rose';
  description: string;
}

const toneStyles = {
  blue: { bg: 'bg-blue-50 text-blue-600' },
  emerald: { bg: 'bg-emerald-50 text-emerald-600' },
  amber: { bg: 'bg-amber-50 text-amber-600' },
  rose: { bg: 'bg-rose-50 text-rose-600' },
};

function StatCard({ title, value, change, isPositive, icon: Icon, tone, description }: StatCardProps) {
  const styles = toneStyles[tone];
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 group">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 tracking-wide uppercase">{title}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${styles.bg} transition-transform group-hover:scale-105`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{value}</span>
        <span
          className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
            isPositive ? 'text-emerald-700 bg-emerald-50' : 'text-slate-600 bg-slate-100'
          }`}
        >
          {change}
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-2 font-medium">{description}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { warehouse } = useAuth();
  const [inventory, setInventory] = useState<InventoryOverviewItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!warehouse) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [invData, txData] = await Promise.all([
        getInventoryOverview(warehouse.id),
        getTransactions(warehouse.id, 10),
      ]);
      setInventory(invData);
      setTransactions(txData);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to connect to backend API'));
    } finally {
      setLoading(false);
    }
  }, [warehouse]);

  useEffect(() => {
    // Fetch-on-mount/when-scope-changes: the loader sets loading state before awaiting the API
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Compute live KPI metrics
  const totalProducts = inventory.length;
  const totalStockUnits = inventory.reduce((sum, item) => sum + item.quantityOnHand, 0);
  const lowStockCount = inventory.filter((item) => item.status === 'LOW_STOCK').length;
  const outOfStockCount = inventory.filter((item) => item.status === 'OUT_OF_STOCK').length;

  return (
    <div className="space-y-6">
      {/* Quick Action & Hero Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Facility Live · Bay 4 Online
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Warehouse Operations Center</h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-xl">
            Live telemetry connected to NestJS backend & PostgreSQL database.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Refresh live data"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            to="/inventory"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-950 transition-colors"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Stock In
          </Link>
          <Link
            to="/inventory"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-950 transition-colors"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            Stock Out
          </Link>
          <Link
            to="/products"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-950 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Product
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={loadData} className="underline font-bold">Retry</button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Catalog Products"
          value={loading ? '...' : totalProducts}
          change="In DB"
          isPositive={true}
          icon={Package}
          tone="blue"
          description="Active registered SKUs"
        />
        <StatCard
          title="Inventory Units"
          value={loading ? '...' : totalStockUnits.toLocaleString()}
          change="Available"
          isPositive={true}
          icon={Boxes}
          tone="emerald"
          description="Physical stock on floor"
        />
        <StatCard
          title="Low Stock Watch"
          value={loading ? '...' : lowStockCount}
          change="Threshold"
          isPositive={lowStockCount === 0}
          icon={AlertTriangle}
          tone="amber"
          description="At or below minimum level"
        />
        <StatCard
          title="Depleted SKUs"
          value={loading ? '...' : outOfStockCount}
          change="0 stock"
          isPositive={outOfStockCount === 0}
          icon={XCircle}
          tone="rose"
          description="Requires purchase order"
        />
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-none">Recent Stock Movements</h3>
              <p className="text-[11px] text-slate-400 mt-1">Live transactions from PostgreSQL audit table</p>
            </div>
          </div>
          <Link
            to="/transactions"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
          >
            View all transactions
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200/80 text-[10px]">
              <tr>
                <th className="px-6 py-3.5">SKU & Product</th>
                <th className="px-6 py-3.5">Movement</th>
                <th className="px-6 py-3.5">Units</th>
                <th className="px-6 py-3.5">Before / After</th>
                <th className="px-6 py-3.5">Reference ID</th>
                <th className="px-6 py-3.5">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No transactions recorded yet. Use <strong>Stock In</strong> or <strong>Stock Out</strong> to create one!
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="font-semibold text-slate-900">{tx.product?.name ?? 'Unknown'}</div>
                      <div className="font-mono text-[10px] text-slate-400 mt-0.5">{tx.product?.sku}</div>
                    </td>
                    <td className="px-6 py-3.5">
                      {tx.type === 'STOCK_IN' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                          <ArrowUpRight className="w-3 h-3" /> Stock In
                        </span>
                      )}
                      {tx.type === 'STOCK_OUT' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80">
                          <ArrowDownRight className="w-3 h-3" /> Stock Out
                        </span>
                      )}
                      {tx.type === 'ADJUSTMENT' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                          <RefreshCcw className="w-3 h-3" /> Adjustment
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`font-mono font-bold text-xs ${
                          tx.type === 'STOCK_OUT' ? 'text-rose-600' : 'text-slate-800'
                        }`}
                      >
                        {tx.type === 'STOCK_OUT' ? `-${tx.quantity}` : `+${tx.quantity}`} {tx.product?.unitOfMeasurement}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[11px] text-slate-500">
                      {tx.quantityBefore} → <span className="font-bold text-slate-800">{tx.quantityAfter}</span>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[11px] text-slate-600 font-medium">{tx.reference}</td>
                    <td className="px-6 py-3.5 text-slate-400 font-mono text-[10px]">
                      {new Date(tx.transactedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
