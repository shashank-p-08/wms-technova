import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Pencil, X, RotateCw, ShieldCheck } from 'lucide-react';
import {
  apiErrorMessage,
  createUser,
  getUsers,
  getWarehouses,
  updateUser,
} from '../../services/api';
import type { Employee, EmployeePayload, Role, WarehouseSummary } from '../../services/api';
import { ROLE_LABELS } from '../../auth/permissions';
import { useAuth } from '../../auth/AuthContext';

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'];
const input =
  'w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const label = 'block text-[11px] font-bold text-slate-700 uppercase mb-1';

function EmployeeModal({
  employee,
  warehouses,
  isSelf,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  warehouses: WarehouseSummary[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !employee;
  const [form, setForm] = useState({
    email: employee?.email ?? '',
    firstName: employee?.firstName ?? '',
    lastName: employee?.lastName ?? '',
    role: (employee?.role ?? 'STAFF') as Role,
    password: '',
    warehouseIds: employee?.warehouses.map((w) => w.id) ?? [],
    isActive: employee?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleWarehouse = (id: string) =>
    setForm((f) => ({
      ...f,
      warehouseIds: f.warehouseIds.includes(id) ? f.warehouseIds.filter((w) => w !== id) : [...f.warehouseIds, id],
    }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.role !== 'ADMIN' && form.warehouseIds.length === 0) {
      return setError('Assign at least one warehouse');
    }
    if ((isNew || form.password) && form.password.length < 10) {
      return setError('Password must be at least 10 characters');
    }
    const payload: EmployeePayload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      role: form.role,
      warehouseIds: form.role === 'ADMIN' ? [] : form.warehouseIds,
    };
    if (form.password) payload.password = form.password;
    setSaving(true);
    try {
      if (isNew) await createUser({ ...payload, email: form.email.trim() });
      else await updateUser(employee.id, { ...payload, isActive: form.isActive });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save employee'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">{isNew ? 'Add employee' : `Edit ${employee.email}`}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">{error}</div>}

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>First name *</label>
              <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label}>Last name</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={input} />
            </div>
          </div>

          {isNew && (
            <div>
              <label className={label}>Email (sign-in) *</label>
              <input type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
            </div>
          )}

          <div>
            <label className={label}>Role *</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <label
                  key={r}
                  className={`flex flex-col gap-0.5 p-2.5 rounded-lg border cursor-pointer text-xs transition ${
                    form.role === r ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50'
                  } ${isSelf && r !== 'ADMIN' ? 'opacity-40 pointer-events-none' : ''}`}
                >
                  <span className="flex items-center gap-2 font-semibold text-slate-800">
                    <input type="radio" name="role" className="accent-blue-600" checked={form.role === r} onChange={() => setForm({ ...form, role: r })} />
                    {ROLE_LABELS[r].label}
                  </span>
                  <span className="text-[10px] text-slate-500 leading-snug">{ROLE_LABELS[r].description}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className={label}>Warehouses {form.role !== 'ADMIN' && '*'}</label>
            {form.role === 'ADMIN' ? (
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-violet-600" /> Admins can access every warehouse.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {warehouses.map((w) => (
                  <label key={w.id} className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer ${form.warehouseIds.includes(w.id) ? 'border-blue-500 bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50'} ${!w.isActive ? 'opacity-60' : ''}`}>
                    <input type="checkbox" className="accent-blue-600" checked={form.warehouseIds.includes(w.id)} onChange={() => toggleWarehouse(w.id)} />
                    <span>
                      <span className="font-mono font-bold">{w.code}</span> · {w.name}
                      {!w.isActive && ' (inactive)'}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={label}>{isNew ? 'Initial password *' : 'Reset password'}</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder={isNew ? 'At least 10 characters' : 'Leave blank to keep the current password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={input}
            />
            {!isNew && form.password && (
              <p className="text-[10px] text-amber-600 mt-1">Resetting signs the employee out everywhere and unlocks the account.</p>
            )}
          </div>

          {!isNew && !isSelf && (
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" className="accent-blue-600" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Account active (unticking signs the employee out immediately)
            </label>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
              {saving ? 'Saving…' : isNew ? 'Create employee' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { user: me, refresh } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Employee | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, w] = await Promise.all([getUsers(), getWarehouses()]);
      setEmployees(u);
      setWarehouses(w);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load employees'));
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
          <h2 className="text-xl font-bold text-slate-900">Employees</h2>
          <p className="text-xs text-slate-500 mt-0.5">Who can sign in, what they can do, and in which warehouses.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100" title="Refresh">
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setEditing(null)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-sm">
            <UserPlus className="w-4 h-4" /> Add employee
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">{error}</div>}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Employee</th>
                <th className="px-6 py-3.5">Role</th>
                <th className="px-6 py-3.5">Warehouses</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Last sign-in</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => (
                <tr key={e.id} className={`hover:bg-slate-50/80 ${!e.isActive ? 'opacity-60' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">
                      {[e.firstName, e.lastName].filter(Boolean).join(' ')}
                      {e.id === me?.id && <span className="ml-1.5 text-[10px] text-slate-400">(you)</span>}
                    </div>
                    <div className="text-[11px] text-slate-400">{e.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ROLE_LABELS[e.role].badge}`}>{ROLE_LABELS[e.role].label}</span>
                  </td>
                  <td className="px-6 py-4">
                    {e.role === 'ADMIN' ? (
                      <span className="text-slate-400">All warehouses</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {e.warehouses.map((w) => (
                          <span key={w.id} className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600" title={w.name}>
                            {w.code}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {e.isActive ? (
                      <span className="text-emerald-600 font-semibold">Active</span>
                    ) : (
                      <span className="text-slate-400 font-semibold">Deactivated</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-400 font-mono text-[10px]">
                    {e.lastLoginAt ? new Date(e.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => setEditing(e)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Edit employee">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && employees.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">No employees yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <EmployeeModal
          employee={editing}
          warehouses={warehouses}
          isSelf={editing?.id === me?.id}
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
