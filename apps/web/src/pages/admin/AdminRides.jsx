import StatusBadge from '../../components/admin/StatusBadge'
import { adminCardClass, adminInputClass, adminTableHeadClass, adminTableRowClass } from '../../lib/adminTheme'

const RIDE_STATUSES = ['', 'REQUESTED', 'ACCEPTED', 'STARTED', 'COMPLETED', 'CANCELLED']

function formatFare(ride) {
  const amount = ride.fareFinal ?? ride.fareEstimate
  if (amount == null) return '—'
  return `$${Number(amount).toFixed(2)}`
}

export default function AdminRides({
  darkMode,
  rides,
  busy,
  rideFilterStatus,
  setRideFilterStatus,
  onApplyFilters,
}) {
  const cardClass = adminCardClass(darkMode)
  const inputClass = adminInputClass(darkMode)

  const liveCount = rides.filter((r) => r.status === 'STARTED' || r.status === 'ACCEPTED').length
  const emptyState = busy && rides.length === 0 ? 'Loading…' : 'No rides match your filter.'

  return (
    <>
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h2 className="font-brand text-xl font-bold sm:text-2xl">Rides</h2>
          <p className="mt-1 text-sm opacity-80">
            Trip history and live operations.{' '}
            {liveCount > 0 && (
              <span className="font-semibold text-emerald-700">{liveCount} active</span>
            )}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <select
            value={rideFilterStatus}
            onChange={(e) => setRideFilterStatus(e.target.value)}
            className={`${inputClass} sm:w-44`}
          >
            {RIDE_STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {s === '' ? 'All statuses' : s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onApplyFilters}
            className="rounded-xl bg-[#9d3733] px-4 py-2.5 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
          >
            Apply
          </button>
        </div>
      </header>

      <div className={cardClass}>
        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {rides.length === 0 ? (
            <p className="py-8 text-center text-sm opacity-70">{emptyState}</p>
          ) : (
            rides.map((ride) => (
              <article
                key={ride.id}
                className={`rounded-xl border p-3.5 ${
                  darkMode ? 'border-[#9d3733]/30 bg-black/30' : 'border-[#9d3733]/20 bg-white/70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <StatusBadge status={ride.status} />
                  <p className="text-[11px] opacity-60">
                    {new Date(ride.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[10px] font-semibold uppercase opacity-50">Rider</p>
                    <p className="truncate font-medium">{ride.rider?.name ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase opacity-50">Driver</p>
                    <p className="truncate font-medium">{ride.driver?.name ?? '—'}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold">{formatFare(ride)}</span>
                  <span className="opacity-70">
                    {ride.paymentMethod ?? '—'}
                    {ride.paymentStatus ? ` · ${ride.paymentStatus}` : ''}
                  </span>
                </div>
                <div className="mt-2 border-t border-[#9d3733]/15 pt-2 text-xs">
                  <p className="line-clamp-1">{ride.pickupAddress}</p>
                  <p className="mt-0.5 line-clamp-1 opacity-70">→ {ride.dropoffAddress}</p>
                </div>
              </article>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className={adminTableHeadClass(darkMode)}>
                <th className="py-2 pr-3 font-semibold">When</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Rider</th>
                <th className="py-2 pr-3 font-semibold">Driver</th>
                <th className="py-2 pr-3 font-semibold">Fare</th>
                <th className="py-2 pr-3 font-semibold">Payment</th>
                <th className="py-2 font-semibold">Route</th>
              </tr>
            </thead>
            <tbody>
              {rides.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center opacity-70">
                    {emptyState}
                  </td>
                </tr>
              ) : (
                rides.map((ride) => (
                  <tr key={ride.id} className={adminTableRowClass(darkMode)}>
                    <td className="py-3 pr-3 whitespace-nowrap text-xs">
                      {new Date(ride.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge status={ride.status} />
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-medium">{ride.rider?.name ?? '—'}</p>
                      <p className="text-xs opacity-70">{ride.rider?.email}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-medium">{ride.driver?.name ?? '—'}</p>
                      <p className="text-xs opacity-70">{ride.driver?.email}</p>
                    </td>
                    <td className="py-3 pr-3 font-semibold">{formatFare(ride)}</td>
                    <td className="py-3 pr-3 text-xs">
                      <span className="block">{ride.paymentMethod ?? '—'}</span>
                      <span className="opacity-70">{ride.paymentStatus ?? ''}</span>
                    </td>
                    <td className="py-3 text-xs">
                      <p className="max-w-[200px] truncate" title={ride.pickupAddress}>
                        {ride.pickupAddress}
                      </p>
                      <p className="max-w-[200px] truncate opacity-70" title={ride.dropoffAddress}>
                        → {ride.dropoffAddress}
                      </p>
                    </td>
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
