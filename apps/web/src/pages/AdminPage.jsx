import { useCallback, useEffect, useState } from 'react'
import {
  adminDriverVerification,
  adminOverview,
  adminRides,
  adminUpdateUser,
  adminUsers,
} from '../lib/api'

const ROLES = ['', 'RIDER', 'DRIVER', 'ADMIN']

export default function AdminPage({
  darkMode,
  authUser,
  authToken,
  navigateToPage,
  setAuthUser,
}) {
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState([])
  const [rides, setRides] = useState([])
  const [userFilterRole, setUserFilterRole] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [rideFilterStatus, setRideFilterStatus] = useState('')
  const [actionBusyId, setActionBusyId] = useState('')

  const shellClass = `min-h-[calc(100dvh-5rem)] px-6 pb-20 pt-24 md:pt-28 ${
    darkMode ? 'bg-[#0a0a0a] text-[#f2e3bb]' : 'bg-[#fffbf5] text-[#2d100f]'
  }`

  const cardClass = `rounded-2xl border p-5 md:p-6 ${
    darkMode ? 'border-[#9d3733]/40 bg-[#111]' : 'border-[#9d3733]/30 bg-[#fff8eb]'
  }`

  const inputClass = `w-full rounded-xl border px-3 py-2 text-sm outline-none ${
    darkMode
      ? 'border-[#9d3733]/45 bg-black text-[#f2e3bb]'
      : 'border-[#9d3733]/30 bg-white text-[#2d100f]'
  }`

  const loadAll = useCallback(async () => {
    if (!authToken) return
    setBusy(true)
    setError('')
    try {
      const [ov, u, r] = await Promise.all([
        adminOverview(authToken),
        adminUsers(authToken, {
          role: userFilterRole || undefined,
          q: userSearch.trim() || undefined,
          take: 80,
        }),
        adminRides(authToken, { status: rideFilterStatus || undefined, take: 80 }),
      ])
      setOverview(ov)
      setUsers(Array.isArray(u) ? u : [])
      setRides(Array.isArray(r) ? r : [])
    } catch (e) {
      setError(e.message || 'Failed to load admin data.')
    } finally {
      setBusy(false)
    }
  }, [authToken, userFilterRole, userSearch, rideFilterStatus])

  useEffect(() => {
    if (!authToken || authUser?.role !== 'ADMIN') {
      return undefined
    }
    let cancelled = false
    ;(async () => {
      setBusy(true)
      setError('')
      try {
        const [ov, u, r] = await Promise.all([
          adminOverview(authToken),
          adminUsers(authToken, { take: 80 }),
          adminRides(authToken, { take: 80 }),
        ])
        if (cancelled) return
        setOverview(ov)
        setUsers(Array.isArray(u) ? u : [])
        setRides(Array.isArray(r) ? r : [])
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load admin data.')
        }
      } finally {
        if (!cancelled) {
          setBusy(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authToken, authUser?.role])

  const setUserRole = async (userId, role) => {
    if (!authToken) return
    setActionBusyId(userId)
    setError('')
    try {
      await adminUpdateUser(authToken, userId, { role })
      if (userId === authUser?.id) {
        setAuthUser((prev) => {
          if (!prev) return prev
          const next = { ...prev, role }
          localStorage.setItem('jo-auth-user', JSON.stringify(next))
          return next
        })
      }
      await loadAll()
    } catch (e) {
      setError(e.message || 'Could not update user.')
    } finally {
      setActionBusyId('')
    }
  }

  const setDriverVerification = async (userId, verificationStatus) => {
    if (!authToken) return
    setActionBusyId(`v-${userId}`)
    setError('')
    try {
      await adminDriverVerification(authToken, userId, { verificationStatus })
      await loadAll()
    } catch (e) {
      setError(e.message || 'Could not update verification.')
    } finally {
      setActionBusyId('')
    }
  }

  if (!authUser) {
    return (
      <div className={shellClass}>
        <div className={`mx-auto max-w-lg ${cardClass}`}>
          <h1 className="font-brand text-2xl font-bold">Admin</h1>
          <p className="mt-3 text-sm opacity-90">Sign in to access the admin dashboard.</p>
          <button
            type="button"
            onClick={() => navigateToPage('home')}
            className="mt-6 rounded-lg border border-[#9d3733]/50 px-4 py-2 text-sm font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10"
          >
            Back to home
          </button>
        </div>
      </div>
    )
  }

  if (authUser.role !== 'ADMIN') {
    return (
      <div className={shellClass}>
        <div className={`mx-auto max-w-lg ${cardClass}`}>
          <h1 className="font-brand text-2xl font-bold">Admin</h1>
          <p className="mt-3 text-sm opacity-90">
            This area is restricted to administrators. Your role is {authUser.role}.
          </p>
          <button
            type="button"
            onClick={() => navigateToPage('home')}
            className="mt-6 rounded-lg bg-[#9d3733] px-4 py-2 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
          >
            Home
          </button>
        </div>
      </div>
    )
  }

  const byRole = overview?.users?.byRole ?? {}
  const byStatus = overview?.rides?.byStatus ?? {}

  return (
    <div className={shellClass}>
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9d3733]">
              Administration
            </p>
            <h1 className="font-brand text-3xl font-bold">Operations</h1>
            <p className="mt-1 text-sm opacity-80">
              Riders, drivers, verification, and recent ride activity.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loadAll()}
              disabled={busy}
              className="rounded-lg border border-[#9d3733]/50 px-4 py-2 text-sm font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10 disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => navigateToPage('home')}
              className="rounded-lg bg-[#9d3733] px-4 py-2 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
            >
              Home
            </button>
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-[#9d3733]/50 bg-[#9d3733]/10 px-4 py-3 text-sm text-[#9d3733]">
            {error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9d3733]">Users</p>
            <p className="mt-1 font-brand text-3xl font-bold">{overview?.users?.total ?? '—'}</p>
            <p className="mt-2 text-xs opacity-80">
              R {byRole.RIDER ?? 0} · D {byRole.DRIVER ?? 0} · A {byRole.ADMIN ?? 0}
            </p>
          </div>
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9d3733]">Rides</p>
            <p className="mt-1 font-brand text-3xl font-bold">{overview?.rides?.total ?? '—'}</p>
            <p className="mt-2 text-xs opacity-80">
              Req {byStatus.REQUESTED ?? 0} · Act {byStatus.ACCEPTED ?? 0} · Live {byStatus.STARTED ?? 0}
            </p>
          </div>
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9d3733]">Done</p>
            <p className="mt-1 font-brand text-3xl font-bold">{byStatus.COMPLETED ?? 0}</p>
            <p className="mt-2 text-xs opacity-80">Completed trips</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9d3733]">Cancelled</p>
            <p className="mt-1 font-brand text-3xl font-bold">{byStatus.CANCELLED ?? 0}</p>
            <p className="mt-2 text-xs opacity-80">Cancelled trips</p>
          </div>
        </div>

        <div className={cardClass}>
          <h2 className="font-accent text-lg font-bold">Users</h2>
          <p className="mt-1 text-sm opacity-80">
            Filter and manage roles. Promoting someone to DRIVER requires an existing driver profile.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold opacity-70">Search</label>
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
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
              onClick={() => loadAll()}
              className="rounded-xl bg-[#9d3733] px-4 py-2 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
            >
              Apply
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className={`border-b ${darkMode ? 'border-[#9d3733]/35' : 'border-[#9d3733]/25'}`}>
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="py-2 pr-3 font-semibold">Email</th>
                  <th className="py-2 pr-3 font-semibold">Role</th>
                  <th className="py-2 pr-3 font-semibold">Driver</th>
                  <th className="py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {busy && users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 opacity-70">
                      Loading…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 opacity-70">
                      No users match.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className={`border-b ${darkMode ? 'border-[#9d3733]/20' : 'border-[#9d3733]/15'}`}
                    >
                      <td className="py-2 pr-3 font-medium">{u.name}</td>
                      <td className="py-2 pr-3 text-xs opacity-90">{u.email}</td>
                      <td className="py-2 pr-3">
                        <span className="rounded-full bg-[#9d3733]/20 px-2 py-0.5 text-xs font-bold text-[#9d3733]">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {u.driverProfile ? (
                          <span>
                            {u.driverProfile.verificationStatus}
                            {u.driverProfile.isOnline ? ' · online' : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {['RIDER', 'DRIVER', 'ADMIN'].map((r) => (
                            <button
                              key={r}
                              type="button"
                              disabled={u.role === r || actionBusyId === u.id}
                              onClick={() => setUserRole(u.id, r)}
                              className="rounded border border-[#9d3733]/40 px-2 py-0.5 text-[11px] font-bold transition hover:bg-[#9d3733]/15 disabled:opacity-40"
                            >
                              {r[0]}
                            </button>
                          ))}
                          {u.driverProfile && u.driverProfile.verificationStatus === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                disabled={actionBusyId === `v-${u.id}`}
                                onClick={() => setDriverVerification(u.id, 'APPROVED')}
                                className="rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={actionBusyId === `v-${u.id}`}
                                onClick={() => setDriverVerification(u.id, 'REJECTED')}
                                className="rounded bg-[#842f2b] px-2 py-0.5 text-[11px] font-bold text-[#f2e3bb]"
                              >
                                Reject
                              </button>
                            </>
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

        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-accent text-lg font-bold">Rides</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={rideFilterStatus}
                onChange={(e) => setRideFilterStatus(e.target.value)}
                className={`${inputClass} w-44`}
              >
                <option value="">All statuses</option>
                <option value="REQUESTED">REQUESTED</option>
                <option value="ACCEPTED">ACCEPTED</option>
                <option value="STARTED">STARTED</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
              <button
                type="button"
                onClick={() => loadAll()}
                className="rounded-lg border border-[#9d3733]/50 px-3 py-2 text-xs font-bold text-[#9d3733]"
              >
                Apply
              </button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className={`border-b ${darkMode ? 'border-[#9d3733]/35' : 'border-[#9d3733]/25'}`}>
                  <th className="py-2 pr-3 font-semibold">When</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Rider</th>
                  <th className="py-2 pr-3 font-semibold">Driver</th>
                  <th className="py-2 font-semibold">Route</th>
                </tr>
              </thead>
              <tbody>
                {rides.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 opacity-70">
                      No rides.
                    </td>
                  </tr>
                ) : (
                  rides.map((ride) => (
                    <tr
                      key={ride.id}
                      className={`border-b ${darkMode ? 'border-[#9d3733]/20' : 'border-[#9d3733]/15'}`}
                    >
                      <td className="py-2 pr-3 text-xs whitespace-nowrap">
                        {new Date(ride.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-semibold text-[#9d3733]">{ride.status}</span>
                      </td>
                      <td className="py-2 pr-3 text-xs">{ride.rider?.name ?? '—'}</td>
                      <td className="py-2 pr-3 text-xs">{ride.driver?.name ?? '—'}</td>
                      <td className="py-2 text-xs">
                        {ride.pickupAddress} → {ride.dropoffAddress}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={cardClass}>
          <h2 className="font-accent text-lg font-bold">Latest activity</h2>
          <p className="mt-1 text-sm opacity-80">Most recent rides system-wide.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {(overview?.recentRides ?? []).length === 0 ? (
              <li className="opacity-70">No recent rides.</li>
            ) : (
              overview.recentRides.map((ride) => (
                <li
                  key={ride.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    darkMode ? 'border-[#9d3733]/30' : 'border-[#9d3733]/20'
                  }`}
                >
                  <span className="font-bold text-[#9d3733]">{ride.status}</span>
                  <span className="mx-2 opacity-40">·</span>
                  {ride.rider?.name ?? 'Rider'} → {ride.driver?.name ?? 'Unassigned'}
                  <span className="mx-2 opacity-40">·</span>
                  {ride.pickupAddress}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
