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

  const renderTable = (list, emptyMessage) => (
    <div className="mt-4 overflow-x-auto">
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
                    {p
                      ? `${p.vehicleColor} ${p.vehicleMake} ${p.vehicleModel}`
                      : '—'}
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs">{p?.licensePlate ?? '—'}</td>
                  <td className="py-3 pr-3">
                    <StatusBadge status={p?.verificationStatus} />
                    {p?.isOnline && (
                      <span className="ml-2 text-xs font-semibold text-emerald-700">Online</span>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => onViewDriver(u.id)}
                        className="rounded border border-[#9d3733]/50 px-2 py-1 text-[11px] font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10"
                      >
                        Profile
                      </button>
                      {p?.verificationStatus !== 'APPROVED' && (
                        <button
                          type="button"
                          disabled={actionBusyId === `v-${u.id}`}
                          onClick={() => onSetDriverVerification(u.id, 'APPROVED')}
                          className="rounded bg-emerald-700 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {p?.verificationStatus !== 'REJECTED' && (
                        <button
                          type="button"
                          disabled={actionBusyId === `v-${u.id}`}
                          onClick={() => onSetDriverVerification(u.id, 'REJECTED')}
                          className="rounded bg-[#842f2b] px-2 py-1 text-[11px] font-bold text-[#f2e3bb] disabled:opacity-50"
                        >
                          Reject
                        </button>
                      )}
                      {p?.verificationStatus !== 'PENDING' && (
                        <button
                          type="button"
                          disabled={actionBusyId === `v-${u.id}`}
                          onClick={() => onSetDriverVerification(u.id, 'PENDING')}
                          className="rounded border border-[#9d3733]/40 px-2 py-1 text-[11px] font-bold disabled:opacity-50"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </td>
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-brand text-2xl font-bold">Drivers</h2>
          <p className="mt-1 text-sm opacity-80">
            Verification queue and fleet status. {drivers.length} driver accounts loaded.
          </p>
        </div>
        {onOpenLiveMap && (
          <button
            type="button"
            onClick={onOpenLiveMap}
            className="rounded-lg bg-[#9d3733] px-4 py-2 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
          >
            View live map
          </button>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className={`${cardClass} text-center`}>
          <p className="text-xs font-semibold uppercase text-amber-700">Pending</p>
          <p className="font-brand mt-1 text-3xl font-bold">{pending.length}</p>
        </div>
        <div className={`${cardClass} text-center`}>
          <p className="text-xs font-semibold uppercase text-emerald-700">Approved</p>
          <p className="font-brand mt-1 text-3xl font-bold">{approved.length}</p>
        </div>
        <div className={`${cardClass} text-center`}>
          <p className="text-xs font-semibold uppercase text-red-700">Rejected</p>
          <p className="font-brand mt-1 text-3xl font-bold">{rejected.length}</p>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="font-accent text-lg font-bold text-amber-800">Pending verification</h3>
        {renderTable(pending, 'No drivers awaiting review.')}
      </div>

      <div className={cardClass}>
        <h3 className="font-accent text-lg font-bold">All drivers</h3>
        {renderTable(drivers, 'No driver accounts found.')}
      </div>
    </>
  )
}
