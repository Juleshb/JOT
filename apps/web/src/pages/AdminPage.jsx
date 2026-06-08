import { useCallback, useEffect, useState } from 'react'
import {
  adminDriverVerification,
  adminOverview,
  adminRides,
  adminUpdateUser,
  adminUsers,
} from '../lib/api'
import {
  ADMIN_NAV,
  adminCardClass,
  adminDriverPath,
  getAdminDriverId,
  getAdminSection,
} from '../lib/adminTheme'
import AdminDriverDetail from './admin/AdminDriverDetail'
import AdminLayout from './admin/AdminLayout'
import AdminOverview from './admin/AdminOverview'
import AdminUsers from './admin/AdminUsers'
import AdminDrivers from './admin/AdminDrivers'
import AdminRides from './admin/AdminRides'
import AdminLiveMap from './admin/AdminLiveMap'

export default function AdminPage({
  darkMode,
  authUser,
  authToken,
  navigateToPage,
  setAuthUser,
}) {
  const [section, setSection] = useState(() => getAdminSection(window.location.pathname))
  const [selectedDriverId, setSelectedDriverId] = useState(() =>
    getAdminDriverId(window.location.pathname),
  )
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState([])
  const [rides, setRides] = useState([])
  const [userFilterRole, setUserFilterRole] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [rideFilterStatus, setRideFilterStatus] = useState('')
  const [actionBusyId, setActionBusyId] = useState('')

  const cardClass = adminCardClass(darkMode)
  const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? ''
  const drivers = users.filter((u) => u.role === 'DRIVER' && u.driverProfile)
  const pendingDriverCount = drivers.filter(
    (d) => d.driverProfile?.verificationStatus === 'PENDING',
  ).length

  const overviewWithPending = overview
    ? { ...overview, pendingDriverCount }
    : null

  const navigateAdminSection = useCallback((nextSection) => {
    const item = ADMIN_NAV.find((n) => n.id === nextSection)
    if (!item) return
    const path = item.path
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path)
    }
    setSection(nextSection)
  }, [])

  const navigateToDriver = useCallback((userId) => {
    const path = adminDriverPath(userId)
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path)
    }
    setSelectedDriverId(userId)
    setSection('driver-detail')
  }, [])

  const navigateBackToDrivers = useCallback(() => {
    const path = '/admin/drivers'
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path)
    }
    setSelectedDriverId(null)
    setSection('drivers')
  }, [])

  useEffect(() => {
    const onPopState = () => {
      const pathname = window.location.pathname
      setSection(getAdminSection(pathname))
      setSelectedDriverId(getAdminDriverId(pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const loadData = useCallback(
    async (opts = {}) => {
      if (!authToken) return
      setBusy(true)
      setError('')
      try {
        const [ov, u, r] = await Promise.all([
          adminOverview(authToken),
          adminUsers(authToken, {
            role: (opts.userRole ?? userFilterRole) || undefined,
            q: (opts.userSearch ?? userSearch.trim()) || undefined,
            take: 100,
          }),
          adminRides(authToken, {
            status: (opts.rideStatus ?? rideFilterStatus) || undefined,
            take: 100,
          }),
        ])
        setOverview(ov)
        setUsers(Array.isArray(u) ? u : [])
        setRides(Array.isArray(r) ? r : [])
      } catch (e) {
        setError(e.message || 'Failed to load admin data.')
      } finally {
        setBusy(false)
      }
    },
    [authToken, userFilterRole, userSearch, rideFilterStatus],
  )

  useEffect(() => {
    if (!authToken || authUser?.role !== 'ADMIN') return undefined
    let cancelled = false
    ;(async () => {
      setBusy(true)
      setError('')
      try {
        const [ov, u, r] = await Promise.all([
          adminOverview(authToken),
          adminUsers(authToken, { take: 100 }),
          adminRides(authToken, { take: 100 }),
        ])
        if (cancelled) return
        setOverview(ov)
        setUsers(Array.isArray(u) ? u : [])
        setRides(Array.isArray(r) ? r : [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load admin data.')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authToken, authUser?.role])

  useEffect(() => {
    if (section === 'drivers' && userFilterRole !== 'DRIVER') {
      setUserFilterRole('DRIVER')
      if (authToken && authUser?.role === 'ADMIN') {
        adminUsers(authToken, { role: 'DRIVER', take: 100 })
          .then((u) => setUsers(Array.isArray(u) ? u : []))
          .catch(() => {})
      }
    }
  }, [section, authToken, authUser?.role, userFilterRole])

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
      await loadData()
    } catch (e) {
      setError(e.message || 'Could not update user.')
    } finally {
      setActionBusyId('')
    }
  }

  const updateUserProfile = async (userId, payload) => {
    if (!authToken) return
    setActionBusyId(userId)
    setError('')
    try {
      await adminUpdateUser(authToken, userId, payload)
      await loadData()
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
      await loadData()
    } catch (e) {
      setError(e.message || 'Could not update verification.')
    } finally {
      setActionBusyId('')
    }
  }

  if (!authUser) {
    return (
      <div className={`min-h-[calc(100dvh-5rem)] px-6 pb-20 pt-24 md:pt-28 ${darkMode ? 'bg-[#0a0a0a] text-[#f2e3bb]' : 'bg-[#fffbf5] text-[#2d100f]'}`}>
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
      <div className={`min-h-[calc(100dvh-5rem)] px-6 pb-20 pt-24 md:pt-28 ${darkMode ? 'bg-[#0a0a0a] text-[#f2e3bb]' : 'bg-[#fffbf5] text-[#2d100f]'}`}>
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

  let content = null
  if (section === 'users') {
    content = (
      <AdminUsers
        darkMode={darkMode}
        users={users}
        busy={busy}
        userFilterRole={userFilterRole}
        setUserFilterRole={setUserFilterRole}
        userSearch={userSearch}
        setUserSearch={setUserSearch}
        onApplyFilters={() => loadData()}
        onSetUserRole={setUserRole}
        onUpdateUser={updateUserProfile}
        actionBusyId={actionBusyId}
      />
    )
  } else if (section === 'driver-detail' && selectedDriverId) {
    content = (
      <AdminDriverDetail
        darkMode={darkMode}
        driverId={selectedDriverId}
        authToken={authToken}
        onBack={navigateBackToDrivers}
        onSetDriverVerification={setDriverVerification}
        actionBusyId={actionBusyId}
      />
    )
  } else if (section === 'drivers') {
    content = (
      <AdminDrivers
        darkMode={darkMode}
        drivers={drivers}
        busy={busy}
        onViewDriver={navigateToDriver}
        onOpenLiveMap={() => navigateAdminSection('live-map')}
        onSetDriverVerification={setDriverVerification}
        actionBusyId={actionBusyId}
      />
    )
  } else if (section === 'live-map') {
    content = (
      <AdminLiveMap
        darkMode={darkMode}
        authToken={authToken}
        mapboxAccessToken={mapboxAccessToken}
        onViewDriver={navigateToDriver}
      />
    )
  } else if (section === 'rides') {
    content = (
      <AdminRides
        darkMode={darkMode}
        rides={rides}
        busy={busy}
        rideFilterStatus={rideFilterStatus}
        setRideFilterStatus={setRideFilterStatus}
        onApplyFilters={() => loadData()}
      />
    )
  } else {
    content = (
      <AdminOverview
        darkMode={darkMode}
        overview={overviewWithPending}
        onNavigateSection={navigateAdminSection}
      />
    )
  }

  return (
    <AdminLayout
      darkMode={darkMode}
      authUser={authUser}
      section={section}
      onNavigateSection={navigateAdminSection}
      onRefresh={() => loadData()}
      busy={busy}
      error={error}
      navigateToPage={navigateToPage}
    >
      {content}
    </AdminLayout>
  )
}
