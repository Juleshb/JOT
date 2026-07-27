import { useState } from 'react'
import RoleBadge from '../../components/admin/RoleBadge'
import StatusBadge from '../../components/admin/StatusBadge'
import {
  adminCardClass,
  adminInputClass,
  adminTableHeadClass,
  adminTableRowClass,
} from '../../lib/adminTheme'

const ROLES = ['', 'RIDER', 'DRIVER', 'ADMIN']

export default function AdminUsers({
  darkMode,
  users,
  busy,
  userFilterRole,
  setUserFilterRole,
  userSearch,
  setUserSearch,
  onApplyFilters,
  onSetUserRole,
  onUpdateUser,
  actionBusyId,
}) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const cardClass = adminCardClass(darkMode)
  const inputClass = adminInputClass(darkMode)

  const startEdit = (user) => {
    setEditingId(user.id)
    setEditName(user.name ?? '')
    setEditPhone(user.phone ?? '')
  }

  const saveEdit = async (userId) => {
    await onUpdateUser(userId, {
      name: editName.trim(),
      phone: editPhone.trim() || null,
    })
    setEditingId(null)
  }

  const emptyState = busy && users.length === 0 ? 'Loading…' : 'No users match your filters.'

  const renderActions = (u) =>
    editingId === u.id ? (
      <div className="flex flex-wrap gap-1.5">
        <input
          value={editPhone}
          onChange={(e) => setEditPhone(e.target.value)}
          placeholder="Phone"
          className={`${inputClass} max-w-[140px]`}
        />
        <button
          type="button"
          disabled={actionBusyId === u.id}
          onClick={() => saveEdit(u.id)}
          className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-bold text-white"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditingId(null)}
          className="rounded-lg border border-[#9d3733]/40 px-2.5 py-1.5 text-[11px] font-bold"
        >
          Cancel
        </button>
      </div>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => startEdit(u)}
          className="rounded-lg border border-[#9d3733]/40 px-2.5 py-1.5 text-[11px] font-bold transition hover:bg-[#9d3733]/10"
        >
          Edit
        </button>
        {['RIDER', 'DRIVER', 'ADMIN'].map((r) => (
          <button
            key={r}
            type="button"
            disabled={u.role === r || actionBusyId === u.id}
            onClick={() => onSetUserRole(u.id, r)}
            className="rounded-lg border border-[#9d3733]/40 px-2.5 py-1.5 text-[11px] font-bold transition hover:bg-[#9d3733]/15 disabled:opacity-40"
            title={`Set role to ${r}`}
          >
            {r[0]}
          </button>
        ))}
      </div>
    )

  return (
    <>
      <header>
        <h2 className="font-brand text-xl font-bold sm:text-2xl">Users</h2>
        <p className="mt-1 text-sm opacity-80">Search accounts, edit profiles, and manage roles.</p>
      </header>

      <div className={cardClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold opacity-70">Search</label>
            <input
              type="search"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onApplyFilters()}
              placeholder="Email or name"
              className={inputClass}
            />
          </div>
          <div className="sm:w-40">
            <label className="mb-1 block text-xs font-semibold opacity-70">Role</label>
            <select
              value={userFilterRole}
              onChange={(e) => setUserFilterRole(e.target.value)}
              className={inputClass}
            >
              {ROLES.map((r) => (
                <option key={r || 'all'} value={r}>
                  {r === '' ? 'All roles' : r}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onApplyFilters}
            className="w-full rounded-xl bg-[#9d3733] px-4 py-2.5 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] sm:w-auto"
          >
            Apply
          </button>
        </div>

        {/* Mobile cards */}
        <div className="mt-5 space-y-3 md:hidden">
          {users.length === 0 ? (
            <p className="py-8 text-center text-sm opacity-70">{emptyState}</p>
          ) : (
            users.map((u) => (
              <article
                key={u.id}
                className={`rounded-xl border p-3.5 ${
                  darkMode ? 'border-[#9d3733]/30 bg-black/30' : 'border-[#9d3733]/20 bg-white/70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {editingId === u.id ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={inputClass}
                      />
                    ) : (
                      <p className="truncate font-semibold">{u.name}</p>
                    )}
                    <p className="mt-0.5 truncate text-xs opacity-70">{u.email}</p>
                  </div>
                  <RoleBadge role={u.role} />
                </div>
                {u.driverProfile && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <StatusBadge status={u.driverProfile.verificationStatus} />
                    {u.driverProfile.isOnline && (
                      <span className="font-semibold text-emerald-700">Online</span>
                    )}
                  </div>
                )}
                <div className="mt-3">{renderActions(u)}</div>
              </article>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="mt-6 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className={adminTableHeadClass(darkMode)}>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Email</th>
                <th className="py-2 pr-3 font-semibold">Role</th>
                <th className="py-2 pr-3 font-semibold">Driver</th>
                <th className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center opacity-70">
                    {emptyState}
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className={adminTableRowClass(darkMode)}>
                    <td className="py-3 pr-3">
                      {editingId === u.id ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className={`${inputClass} max-w-[140px]`}
                        />
                      ) : (
                        <span className="font-medium">{u.name}</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-xs opacity-90">{u.email}</td>
                    <td className="py-3 pr-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="py-3 pr-3 text-xs">
                      {u.driverProfile ? (
                        <span className="flex flex-col gap-1">
                          <StatusBadge status={u.driverProfile.verificationStatus} />
                          {u.driverProfile.isOnline && (
                            <span className="font-semibold text-emerald-700">Online</span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3">{renderActions(u)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
