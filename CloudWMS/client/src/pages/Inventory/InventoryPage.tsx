import { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCcw,
  Search,
  RotateCw,
  X,
  AlertTriangle,
} from 'lucide-react';
import {
  getInventoryOverview,
  stockIn,
  stockOut,
  adjustStock,
  apiErrorMessage,
} from '../../services/api';
import type { InventoryOverviewItem } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';

export default function InventoryPage() {
  const { warehouse, can } = useAuth();
  const canMove = can('moveStock');
  const canAdjust = can('adjustStock');
  const [items, setItems] = useState<InventoryOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'IN_STOCK'>('ALL');

  // Modal states
  const [modalType, setModalType] = useState<'IN' | 'OUT' | 'ADJUST' | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<InventoryOverviewItem | null>(null);
  const [quantity, setQuantity] = useState<number>(10);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    if (!warehouse) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await getInventoryOverview(warehouse.id);
      setItems(data);
    } catch (err) {
      console.error('Failed to load inventory', err);
    } finally {
      setLoading(false);
    }
  }, [warehouse]);

  useEffect(() => {
    // Fetch-on-mount/when-scope-changes: the loader sets loading state before awaiting the API
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInventory();
  }, [loadInventory]);

  const openModal = (type: 'IN' | 'OUT' | 'ADJUST', product?: InventoryOverviewItem) => {
    const target = product || items[0] || null;
    setModalType(type);
    setSelectedProduct(target);
    // For adjustments, pre-fill with the target's current count (not 0) so an
    // unedited submit is a no-op rather than wiping stock.
    setQuantity(type === 'ADJUST' ? (target?.quantityOnHand ?? 0) : 10);
    setReference(type === 'IN' ? 'PO-2026-001' : type === 'OUT' ? 'SO-2026-001' : 'ADJ-COUNT-01');
    setNotes('');
    setErrorMsg(null);
  };

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !warehouse) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      if (modalType === 'IN') {
        await stockIn({
          warehouseId: warehouse.id,
          productId: selectedProduct.productId,
          quantity: Number(quantity),
          reference: reference.trim(),
          notes: notes.trim(),
        });
      } else if (modalType === 'OUT') {
        await stockOut({
          warehouseId: warehouse.id,
          productId: selectedProduct.productId,
          quantity: Number(quantity),
          reference: reference.trim(),
          notes: notes.trim(),
        });
      } else if (modalType === 'ADJUST') {
        await adjustStock({
          warehouseId: warehouse.id,
          productId: selectedProduct.productId,
          newQuantity: Number(quantity),
          reference: reference.trim(),
          notes: notes.trim(),
        });
      }
      setModalType(null);
      loadInventory();
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, 'Transaction failed'));
    } finally {
      setSubmitting(false);
    }
  };

  // Filter items
  const filtered = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Warehouse Inventory</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {warehouse ? `${warehouse.code} · ${warehouse.name}: ` : ''}stock on hand, threshold protection, and stock movements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadInventory}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
            title="Refresh"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canMove && (<>
          <button
            onClick={() => openModal('IN')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" /> Stock In
          </button>
          <button
            onClick={() => openModal('OUT')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" /> Stock Out
          </button>
          </>)}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search inventory by SKU or product name..."
            className="w-full text-xs pl-9 pr-4 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {(['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' ? 'All' : st === 'IN_STOCK' ? 'In Stock' : st === 'LOW_STOCK' ? 'Low Stock' : 'Out of Stock'}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">SKU & Product</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5">Stock on Hand</th>
                <th className="px-6 py-3.5">Safety Level</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    Loading inventory balances...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No matching inventory items.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.productId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="font-mono text-[10px] text-blue-600 font-bold">{item.sku}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-medium">{item.category}</td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-base font-extrabold text-slate-900">
                        {item.quantityOnHand}
                      </span>{' '}
                      <span className="text-[11px] text-slate-400 font-medium">{item.unitOfMeasurement}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500 font-medium">
                      min {item.minimumStockLevel}
                    </td>
                    <td className="px-6 py-4">
                      {item.status === 'IN_STOCK' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> In Stock
                        </span>
                      )}
                      {item.status === 'LOW_STOCK' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-500" /> Low Stock
                        </span>
                      )}
                      {item.status === 'OUT_OF_STOCK' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Depleted
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!canMove && <span className="text-[10px] text-slate-300">View only</span>}
                        {canMove && (<>
                        <button
                          onClick={() => openModal('IN', item)}
                          className="px-2.5 py-1 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-bold text-[11px] transition"
                        >
                          + In
                        </button>
                        <button
                          onClick={() => openModal('OUT', item)}
                          className="px-2.5 py-1 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 font-bold text-[11px] transition"
                        >
                          - Out
                        </button>
                        </>)}
                        {canAdjust && (
                        <button
                          onClick={() => openModal('ADJUST', item)}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                          title="Count adjustment"
                        >
                          <RefreshCcw className="w-3.5 h-3.5" />
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movement Modal Dialog */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div
                  className={`p-2 rounded-lg ${
                    modalType === 'IN'
                      ? 'bg-emerald-50 text-emerald-600'
                      : modalType === 'OUT'
                      ? 'bg-rose-50 text-rose-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {modalType === 'IN'
                      ? 'Inbound Stock Receiving'
                      : modalType === 'OUT'
                      ? 'Outbound Stock Dispatch'
                      : 'Physical Inventory Adjustment'}
                  </h3>
                  <p className="text-[11px] text-slate-400">Atomic database transaction</p>
                </div>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAction} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Target Product *
                </label>
                <select
                  value={selectedProduct?.productId || ''}
                  onChange={(e) => {
                    const prod = items.find((p) => p.productId === e.target.value);
                    setSelectedProduct(prod || null);
                    // Keep the adjustment count in sync with the newly selected product
                    if (modalType === 'ADJUST' && prod) setQuantity(prod.quantityOnHand);
                  }}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                >
                  {items.map((prod) => (
                    <option key={prod.productId} value={prod.productId}>
                      {prod.sku} — {prod.name} (Current: {prod.quantityOnHand} {prod.unitOfMeasurement})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  {modalType === 'ADJUST' ? 'New Counted Quantity *' : 'Quantity to Move *'}
                </label>
                <input
                  type="number"
                  min={modalType === 'ADJUST' ? '0' : '1'}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono font-bold text-base"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Reference ID / Ticket *
                </label>
                <input
                  type="text"
                  required
                  placeholder="PO-2026-001 or SO-9901"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Carrier tracking, inspection remarks..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition disabled:opacity-50 ${
                    modalType === 'IN'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : modalType === 'OUT'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >
                  {submitting ? 'Executing Transaction...' : 'Commit Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
