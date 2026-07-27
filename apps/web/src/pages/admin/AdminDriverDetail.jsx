import { useCallback, useEffect, useState } from 'react'
import { adminDriverDetail } from '../../lib/api'
import StatusBadge from '../../components/admin/StatusBadge'
import { adminCardClass, adminTableHeadClass, adminTableRowClass } from '../../lib/adminTheme'

const EVENT_LABELS = {
  ride_created: { label: 'Trip assigned', color: 'text-blue-700' },
  ride_accepted: { label: 'Accepted trip', color: 'text-indigo-700' },
  ride_started: { label: 'Started trip', color: 'text-emerald-700' },
  ride_completed: { label: 'Completed trip', color: 'text-neutral-700' },
  ride_cancelled: { label: 'Cancelled trip', color: 'text-red-700' },
  rating_received: { label: 'Received rating', color: 'text-amber-700' },
}

function formatFare(ride) {
  const amount = ride.fareFinal ?? ride.fareEstimate
  if (amount == null) return '—'
  return `$${Number(amount).toFixed(2)}`
}

function formatWhen(iso) {
  return new Date(iso).toLocaleString()
}

export default function AdminDriverDetail({
  darkMode,
  driverId,
  authToken,
  onBack,
  onSetDriverVerification,
  actionBusyId,
}) {
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('activity')

  const cardClass = adminCardClass(darkMode)

  const load = useCallback(async () => {
    if (!authToken || !driverId) return
    setBusy(true)
    setError('')
    try {
      const result = await adminDriverDetail(authToken, driverId)
      setData(result)
    } catch (e) {
      setError(e.message || 'Failed to load driver profile.')
      setData(null)
    } finally {
      setBusy(false)
    }
  }, [authToken, driverId])

  useEffect(() => {
    load()
  }, [load])

  const driver = data?.driver
  const profile = driver?.driverProfile
  const stats = data?.stats
  const activities = data?.activities ?? []
  const rides = data?.rides ?? []

  if (busy && !driver) {
    return (
      <div className="py-16 text-center text-sm opacity-70">Loading driver profile…</div>
    )
  }

  if (error && !driver) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-[#9d3733]">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg border border-[#9d3733]/50 px-4 py-2 text-sm font-bold text-[#9d3733]"
        >
          Back to drivers
        </button>
      </div>
    )
  }

  if (!driver || !profile) return null

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 text-sm font-semibold text-[#9d3733] transition hover:underline"
          >
            ← All drivers
          </button>
          <div className="flex flex-wrap items-center gap-3">
            {driver.avatarUrl ? (
              <img
                src={driver.avatarUrl}
                alt=""
                className="h-14 w-14 rounded-full border-2 border-[#9d3733]/40 object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#9d3733]/20 font-brand text-xl font-bold text-[#9d3733]">
                {driver.name?.[0]?.toUpperCase() ?? 'D'}
              </div>
            )}
            <div>
              <h2 className="font-brand text-xl font-bold sm:text-2xl">{driver.name}</h2>
              <p className="text-sm opacity-80">{driver.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={profile.verificationStatus} />
                {profile.isOnline ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    Online now
                  </span>
                ) : (
                  <span className="text-xs opacity-60">Offline</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {profile.verificationStatus !== 'APPROVED' && (
            <button
              type="button"
              disabled={actionBusyId === `v-${driver.id}`}
              onClick={async () => {
                await onSetDriverVerification(driver.id, 'APPROVED')
                load()
              }}
              className="flex-1 rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50 sm:flex-none"
            >
              Approve
            </button>
          )}
          {profile.verificationStatus !== 'REJECTED' && (
            <button
              type="button"
              disabled={actionBusyId === `v-${driver.id}`}
              onClick={async () => {
                await onSetDriverVerification(driver.id, 'REJECTED')
                load()
              }}
              className="flex-1 rounded-xl bg-[#842f2b] px-3 py-2.5 text-xs font-bold text-[#f2e3bb] disabled:opacity-50 sm:flex-none"
            >
              Reject
            </button>
          )}
          <button
            type="button"
            onClick={load}
            disabled={busy}
            className="flex-1 rounded-xl border border-[#9d3733]/50 px-3 py-2.5 text-xs font-bold text-[#9d3733] disabled:opacity-50 sm:flex-none"
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <p className="rounded-xl border border-[#9d3733]/50 bg-[#9d3733]/10 px-4 py-3 text-sm text-[#9d3733]">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cardClass}>
          <p className="text-xs font-semibold uppercase text-[#9d3733]">Total trips</p>
          <p className="font-brand mt-1 text-3xl font-bold">{stats?.totalRides ?? 0}</p>
        </div>
        <div className={cardClass}>
          <p className="text-xs font-semibold uppercase text-emerald-700">Completed</p>
          <p className="font-brand mt-1 text-3xl font-bold">{stats?.completed ?? 0}</p>
        </div>
        <div className={cardClass}>
          <p className="text-xs font-semibold uppercase text-[#9d3733]">Earnings</p>
          <p className="font-brand mt-1 text-3xl font-bold">${stats?.totalEarnings ?? 0}</p>
          <p className="mt-1 text-xs opacity-70">From completed trips</p>
        </div>
        <div className={cardClass}>
          <p className="text-xs font-semibold uppercase text-amber-700">Rating</p>
          <p className="font-brand mt-1 text-3xl font-bold">
            {stats?.averageRating != null ? stats.averageRating.toFixed(1) : '—'}
          </p>
          <p className="mt-1 text-xs opacity-70">{stats?.ratingCount ?? 0} reviews</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`${cardClass} lg:col-span-1`}>
          <h3 className="font-accent text-lg font-bold">Profile</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase opacity-60">Phone</dt>
              <dd className="font-medium">{driver.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase opacity-60">Vehicle</dt>
              <dd className="font-medium">
                {profile.vehicleColor} {profile.vehicleMake} {profile.vehicleModel}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase opacity-60">License plate</dt>
              <dd className="font-mono font-medium">{profile.licensePlate}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase opacity-60">Member since</dt>
              <dd>{new Date(driver.createdAt).toLocaleDateString()}</dd>
            </div>
            {profile.isOnline && profile.currentLat != null && profile.currentLng != null && (
              <div>
                <dt className="text-xs font-semibold uppercase opacity-60">Last location</dt>
                <dd className="font-mono text-xs">
                  {profile.currentLat.toFixed(5)}, {profile.currentLng.toFixed(5)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold uppercase opacity-60">Profile updated</dt>
              <dd className="text-xs">{formatWhen(profile.updatedAt)}</dd>
            </div>
          </dl>
        </div>

        <div className={`${cardClass} lg:col-span-2`}>
          <div className="flex flex-wrap gap-2 border-b border-[#9d3733]/20 pb-3">
            <button
              type="button"
              onClick={() => setTab('activity')}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                tab === 'activity'
                  ? 'bg-[#9d3733] text-[#f2e3bb]'
                  : 'text-[#9d3733] hover:bg-[#9d3733]/10'
              }`}
            >
              Activity ({activities.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('trips')}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                tab === 'trips'
                  ? 'bg-[#9d3733] text-[#f2e3bb]'
                  : 'text-[#9d3733] hover:bg-[#9d3733]/10'
              }`}
            >
              All trips ({rides.length})
            </button>
          </div>

          {tab === 'activity' ? (
            <ul className="mt-4 max-h-[480px] space-y-3 overflow-y-auto pr-1">
              {activities.length === 0 ? (
                <li className="py-8 text-center text-sm opacity-70">No activity recorded yet.</li>
              ) : (
                activities.map((item) => {
                  const meta = EVENT_LABELS[item.event] ?? {
                    label: item.event,
                    color: 'text-neutral-700',
                  }
                  return (
                    <li
                      key={item.id}
                      className={`rounded-xl border px-4 py-3 text-sm ${
                        darkMode ? 'border-[#9d3733]/30' : 'border-[#9d3733]/20'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className={`font-bold ${meta.color}`}>
                          {meta.label}
                          {item.event === 'rating_received' && item.stars != null && (
                            <span className="ml-2 text-amber-600">★ {item.stars}/5</span>
                          )}
                        </p>
                        <time className="text-xs opacity-60">{formatWhen(item.at)}</time>
                      </div>
                      <p className="mt-1 opacity-80">
                        Rider: <span className="font-medium">{item.riderName}</span>
                        <span className="mx-2 opacity-40">·</span>
                        <StatusBadge status={item.rideStatus} />
                      </p>
                      <p className="mt-1 text-xs opacity-70">
                        {item.pickupAddress} → {item.dropoffAddress}
                      </p>
                    </li>
                  )
                })
              )}
            </ul>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className={adminTableHeadClass(darkMode)}>
                    <th className="py-2 pr-3 font-semibold">When</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 pr-3 font-semibold">Rider</th>
                    <th className="py-2 pr-3 font-semibold">Fare</th>
                    <th className="py-2 font-semibold">Route</th>
                  </tr>
                </thead>
                <tbody>
                  {rides.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center opacity-70">
                        No trips yet.
                      </td>
                    </tr>
                  ) : (
                    rides.map((ride) => (
                      <tr key={ride.id} className={adminTableRowClass(darkMode)}>
                        <td className="py-2 pr-3 text-xs whitespace-nowrap">
                          {formatWhen(ride.createdAt)}
                        </td>
                        <td className="py-2 pr-3">
                          <StatusBadge status={ride.status} />
                        </td>
                        <td className="py-2 pr-3">
                          <p className="font-medium">{ride.rider?.name}</p>
                          {ride.rating && (
                            <p className="text-xs text-amber-700">★ {ride.rating.stars}/5</p>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-semibold">{formatFare(ride)}</td>
                        <td className="py-2 text-xs">
                          <p className="max-w-[180px] truncate">{ride.pickupAddress}</p>
                          <p className="max-w-[180px] truncate opacity-70">→ {ride.dropoffAddress}</p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
