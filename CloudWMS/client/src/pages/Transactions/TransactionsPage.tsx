import { useState, useEffect, useCallback } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  Search,
  RotateCw,
} from 'lucide-react';
import { getTransactions } from '../../services/api';
import type { InventoryTransaction } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';

export default function TransactionsPage() {
  const { warehouse } = useAuth();
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT'>('ALL');

  const loadTransactions = useCallback(async () => {
    if (!warehouse) return;
    try {
      setLoading(true);
      const data = await getTransactions(warehouse.id, 100);
      setTransactions(data);
    } catch (err) {
      console.error('Failed to load transaction history', err);
    } finally {
      setLoading(false);
    }
  }, [warehouse]);

  useEffect(() => {
    // Fetch-on-mount/when-scope-changes: the loader sets loading state before awaiting the API
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTransactions();
  }, [loadTransactions]);

  const filtered = transactions.filter((tx) => {
    const term = search.toLowerCase();
    const matchesSearch =
      tx.reference.toLowerCase().includes(term) ||
      (tx.product?.name ?? '').toLowerCase().includes(term) ||
      (tx.product?.sku ?? '').toLowerCase().includes(term) ||
      (tx.notes ?? '').toLowerCase().includes(term) ||
      (tx.user?.email ?? '').toLowerCase().includes(term);

    const matchesType = typeFilter === 'ALL' || tx.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Transaction Audit Trail</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {warehouse ? `${warehouse.code}: ` : ''}immutable ledger of every inbound, outbound and adjustment, with who performed it.
          </p>
        </div>
        <button
          onClick={loadTransactions}
          className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition self-start sm:self-auto"
          title="Refresh Ledger"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit trail by reference number, SKU, or notes..."
            className="w-full text-xs pl-9 pr-4 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {(['ALL', 'STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                typeFilter === t
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t === 'ALL' ? 'All' : t === 'STOCK_IN' ? 'Stock In' : t === 'STOCK_OUT' ? 'Stock Out' : 'Adjustments'}
            </button>
          ))}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Reference</th>
                <th className="px-6 py-3.5">Type</th>
                <th className="px-6 py-3.5">Target Product</th>
                <th className="px-6 py-3.5">Movement Units</th>
                <th className="px-6 py-3.5">Before / After</th>
                <th className="px-6 py-3.5">Performed by</th>
                <th className="px-6 py-3.5">Notes</th>
                <th className="px-6 py-3.5">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    Loading ledger records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    No matching audit transactions found.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">{tx.reference}</td>
                    <td className="px-6 py-4">
                      {tx.type === 'STOCK_IN' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <ArrowUpRight className="w-3 h-3" /> Stock In
                        </span>
                      )}
                      {tx.type === 'STOCK_OUT' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <ArrowDownRight className="w-3 h-3" /> Stock Out
                        </span>
                      )}
                      {tx.type === 'ADJUSTMENT' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <RefreshCcw className="w-3 h-3" /> Adjustment
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{tx.product?.name ?? 'Unknown'}</div>
                      <div className="font-mono text-[10px] text-blue-600 font-bold mt-0.5">{tx.product?.sku}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`font-mono font-bold text-xs ${
                          tx.type === 'STOCK_OUT' ? 'text-rose-600' : 'text-slate-800'
                        }`}
                      >
                        {tx.type === 'STOCK_OUT' ? `-${tx.quantity}` : `+${tx.quantity}`} {tx.product?.unitOfMeasurement}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-[11px] text-slate-500">
                      {tx.quantityBefore} → <span className="font-bold text-slate-800">{tx.quantityAfter}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {tx.user ? (
                        <>
                          <div className="font-medium">{[tx.user.firstName, tx.user.lastName].filter(Boolean).join(' ') || tx.user.email}</div>
                          <div className="text-[10px] text-slate-400">{tx.user.email}</div>
                        </>
                      ) : (
                        <span className="text-slate-300">System</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 max-w-xs truncate">
                      {tx.notes || '—'}
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-[10px]">
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
