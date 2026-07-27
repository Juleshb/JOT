import StatusBadge from '../../components/admin/StatusBadge'
import { adminCardClass, adminTableHeadClass, adminTableRowClass } from '../../lib/adminTheme'

export default function AdminDrivers({
  darkMode,
  drivers,
  busy,
  onViewDriver,
  onOpenLiveMap,
  onSetDriverVerification,
  actionBusyId,
}) {
  const cardClass = adminCardClass(darkMode)
  const pending = drivers.filter((d) => d.driverProfile?.verificationStatus === 'PENDING')
  const approved = drivers.filter((d) => d.driverProfile?.verificationStatus === 'APPROVED')
  const rejected = drivers.filter((d) => d.driverProfile?.verificationStatus === 'REJECTED')

  const renderActions = (u, p) => (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onViewDriver(u.id)}
        className="rounded-lg border border-[#9d3733]/50 px-2.5 py-1.5 text-[11px] font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10"
      >
        Profile
      </button>
      {p?.verificationStatus !== 'APPROVED' && (
        <button
          type="button"
          disabled={actionBusyId === `v-${u.id}`}
          onClick={() => onSetDriverVerification(u.id, 'APPROVED')}
          className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
        >
          Approve
        </button>
      )}
      {p?.verificationStatus !== 'REJECTED' && (
        <button
          type="button"
          disabled={actionBusyId === `v-${u.id}`}
          onClick={() => onSetDriverVerification(u.id, 'REJECTED')}
          className="rounded-lg bg-[#842f2b] px-2.5 py-1.5 text-[11px] font-bold text-[#f2e3bb] disabled:opacity-50"
        >
          Reject
        </button>
      )}
      {p?.verificationStatus !== 'PENDING' && (
        <button
          type="button"
          disabled={actionBusyId === `v-${u.id}`}
          onClick={() => onSetDriverVerification(u.id, 'PENDING')}
          className="rounded-lg border border-[#9d3733]/40 px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-50"
        >
          Reset
        </button>
      )}
    </div>
  )

  const renderCards = (list, emptyMessage) => (
    <div className="mt-4 space-y-3 md:hidden">
      {busy && list.length === 0 ? (
        <p className="py-6 text-center text-sm opacity-70">Loading…</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm opacity-70">{emptyMessage}</p>
      ) : (
        list.map((u) => {
          const p = u.driverProfile
          return (
            <article
              key={u.id}
              className={`rounded-xl border p-3.5 ${
                darkMode ? 'border-[#9d3733]/30 bg-black/30' : 'border-[#9d3733]/20 bg-white/70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onViewDriver(u.id)}
                    className="truncate text-left font-semibold text-[#9d3733] hover:underline"
                  >
                    {u.name}
                  </button>
                  <p className="mt-0.5 truncate text-xs opacity-70">{u.email}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={p?.verificationStatus} />
                  {p?.isOnline && (
                    <span className="text-[10px] font-semibold text-emerald-700">Online</span>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs opacity-80">
                {p ? `${p.vehicleColor} ${p.vehicleMake} ${p.vehicleModel}` : '—'}
              </p>
              <p className="mt-0.5 font-mono text-xs">{p?.licensePlate ?? '—'}</p>
              <div className="mt-3">{renderActions(u, p)}</div>
            </article>
          )
        })
      )}
    </div>
  )

  const renderTable = (list, emptyMessage) => (
    <div className="mt-4 hidden overflow-x-auto md:block">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead>
          <tr className={adminTableHeadClass(darkMode)}>
            <th className="py-2 pr-3 font-semibold">Driver</th>
            <th className="py-2 pr-3 font-semibold">Vehicle</th>
            <th className="py-2 pr-3 font-semibold">Plate</th>
            <th className="py-2 pr-3 font-semibold">Status</th>
            <th className="py-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {busy && list.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center opacity-70">
                Loading…
              </td>
            </tr>
          ) : list.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center opacity-70">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            list.map((u) => {
              const p = u.driverProfile
              return (
                <tr key={u.id} className={adminTableRowClass(darkMode)}>
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      onClick={() => onViewDriver(u.id)}
                      className="text-left font-medium text-[#9d3733] transition hover:underline"
                    >
                      {u.name}
                    </button>
                    <p className="text-xs opacity-70">{u.email}</p>
                  </td>
                  <td className="py-3 pr-3 text-xs">
                    {p ? `${p.vehicleColor} ${p.vehicleMake} ${p.vehicleModel}` : '—'}
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs">{p?.licensePlate ?? '—'}</td>
                  <td className="py-3 pr-3">
                    <StatusBadge status={p?.verificationStatus} />
                    {p?.isOnline && (
                      <span className="ml-2 text-xs font-semibold text-emerald-700">Online</span>
                    )}
                  </td>
                  <td className="py-3">{renderActions(u, p)}</td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h2 className="font-brand text-xl font-bold sm:text-2xl">Drivers</h2>
          <p className="mt-1 text-sm opacity-80">
            Verification queue and fleet status. {drivers.length} driver accounts loaded.
          </p>
        </div>
        {onOpenLiveMap && (
          <button
            type="button"
            onClick={onOpenLiveMap}
            className="w-full rounded-xl bg-[#9d3733] px-4 py-2.5 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] sm:w-auto"
          >
            View live map
          </button>
        )}
      </header>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className={`${cardClass} px-2 py-3 text-center sm:p-5`}>
          <p className="text-[10px] font-semibold uppercase text-amber-700 sm:text-xs">Pending</p>
          <p className="font-brand mt-1 text-2xl font-bold sm:text-3xl">{pending.length}</p>
        </div>
        <div className={`${cardClass} px-2 py-3 text-center sm:p-5`}>
          <p className="text-[10px] font-semibold uppercase text-emerald-700 sm:text-xs">Approved</p>
          <p className="font-brand mt-1 text-2xl font-bold sm:text-3xl">{approved.length}</p>
        </div>
        <div className={`${cardClass} px-2 py-3 text-center sm:p-5`}>
          <p className="text-[10px] font-semibold uppercase text-red-700 sm:text-xs">Rejected</p>
          <p className="font-brand mt-1 text-2xl font-bold sm:text-3xl">{rejected.length}</p>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="font-accent text-base font-bold text-amber-800 sm:text-lg">
          Pending verification
        </h3>
        {renderCards(pending, 'No drivers awaiting review.')}
        {renderTable(pending, 'No drivers awaiting review.')}
      </div>

      <div className={cardClass}>
        <h3 className="font-accent text-base font-bold sm:text-lg">All drivers</h3>
        {renderCards(drivers, 'No driver accounts found.')}
        {renderTable(drivers, 'No driver accounts found.')}
      </div>
    </>
  )
}
