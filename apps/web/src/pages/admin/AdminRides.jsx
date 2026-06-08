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

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-brand text-2xl font-bold">Rides</h2>
          <p className="mt-1 text-sm opacity-80">
            Trip history and live operations. {liveCount > 0 && (
              <span className="font-semibold text-emerald-700">{liveCount} active</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={rideFilterStatus}
            onChange={(e) => setRideFilterStatus(e.target.value)}
            className={`${inputClass} w-44`}
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
            className="rounded-lg bg-[#9d3733] px-4 py-2 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
          >
            Apply
          </button>
        </div>
      </header>

      <div className={cardClass}>
        <div className="overflow-x-auto">
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
              {busy && rides.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center opacity-70">
                    Loading…
                  </td>
                </tr>
              ) : rides.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center opacity-70">
                    No rides match your filter.
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
