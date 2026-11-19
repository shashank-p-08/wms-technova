import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, Pencil, X, RotateCw } from 'lucide-react';
import { apiErrorMessage, createWarehouse, getWarehouses, updateWarehouse } from '../../services/api';
import type { WarehouseSummary } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';

const input =
  'w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const label = 'block text-[11px] font-bold text-slate-700 uppercase mb-1';

function WarehouseModal({
  warehouse,
  onClose,
  onSaved,
}: {
  warehouse: WarehouseSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !warehouse;
  const [form, setForm] = useState({
    code: warehouse?.code ?? '',
    name: warehouse?.name ?? '',
    address: warehouse?.address ?? '',
    isActive: warehouse?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isNew) {
        await createWarehouse({ code: form.code.trim().toUpperCase(), name: form.name.trim(), address: form.address.trim() || undefined });
      } else {
        await updateWarehouse(warehouse.id, { name: form.name.trim(), address: form.address.trim(), isActive: form.isActive });
      }
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save warehouse'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">{isNew ? 'Add warehouse' : `Edit ${warehouse.code}`}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">{error}</div>}
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Code *</label>
              <input
                required
                disabled={!isNew}
                placeholder="HUB-02"
                pattern="[A-Za-z0-9-]{2,20}"
                title="2-20 letters, digits or hyphens"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className={`${input} font-mono uppercase disabled:bg-slate-50 disabled:text-slate-500`}
              />
            </div>
            <div className="col-span-2">
              <label className={label}>Name *</label>
              <input required placeholder="South Facility" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
            </div>
          </div>
          <div>
            <label className={label}>Address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={input} />
          </div>
          {!isNew && (
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" className="accent-blue-600" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active (inactive warehouses keep their history but accept no stock movements)
            </label>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
              {saving ? 'Saving…' : isNew ? 'Create warehouse' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WarehousesPage() {
  const { refresh } = useAuth();
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WarehouseSummary | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWarehouses(await getWarehouses());
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load warehouses'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Warehouses</h2>
          <p className="text-xs text-slate-500 mt-0.5">Facilities in your company. Stock is tracked per warehouse.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100" title="Refresh">
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setEditing(null)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-sm">
            <Plus className="w-4 h-4" /> Add warehouse
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">{error}</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {warehouses.map((w) => (
          <div key={w.id} className={`bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs ${!w.isActive ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-mono text-xs font-bold text-blue-600">{w.code}</div>
                  <div className="font-semibold text-slate-900 text-sm">{w.name}</div>
                </div>
              </div>
              <button onClick={() => setEditing(w)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Edit warehouse">
                <Pencil className="w-4 h-4" />
              </button>
            </div>
            {w.address && <p className="text-[11px] text-slate-500 mt-3">{w.address}</p>}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 text-center">
              <div>
                <div className="font-bold font-mono text-slate-900">{w.employeeCount}</div>
                <div className="text-[10px] text-slate-400 uppercase">Employees</div>
              </div>
              <div>
                <div className="font-bold font-mono text-slate-900">{w.totalUnits.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400 uppercase">Units</div>
              </div>
              <div>
                <div className={`font-bold text-xs mt-0.5 ${w.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>{w.isActive ? 'Active' : 'Inactive'}</div>
                <div className="text-[10px] text-slate-400 uppercase">Status</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing !== undefined && (
        <WarehouseModal
          warehouse={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            load();
            refresh();
          }}
        />
      )}
    </div>
  );
}
