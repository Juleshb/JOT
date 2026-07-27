import StatCard from '../../components/admin/StatCard'
import StatusBadge from '../../components/admin/StatusBadge'
import {
  DriversVerificationChart,
  RidesByStatusChart,
  RidesPerDayChart,
  UsersByRoleChart,
} from '../../components/admin/AdminCharts'
import { adminCardClass } from '../../lib/adminTheme'

export default function AdminOverview({ darkMode, overview, onNavigateSection }) {
  const byRole = overview?.users?.byRole ?? {}
  const byStatus = overview?.rides?.byStatus ?? {}
  const byVerification = overview?.drivers?.byVerification ?? {}
  const ridesPerDay = overview?.ridesPerDay ?? []
  const cardClass = adminCardClass(darkMode)

  const pendingDrivers = byVerification.PENDING ?? overview?.pendingDriverCount ?? 0

  return (
    <>
      <header>
        <h2 className="font-brand text-xl font-bold sm:text-2xl">Overview</h2>
        <p className="mt-1 text-sm opacity-80">Platform health and statistics at a glance.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          darkMode={darkMode}
          label="Total users"
          value={overview?.users?.total}
          hint={`R ${byRole.RIDER ?? 0} · D ${byRole.DRIVER ?? 0} · A ${byRole.ADMIN ?? 0}`}
          onClick={() => onNavigateSection('users')}
        />
        <StatCard
          darkMode={darkMode}
          label="Total rides"
          value={overview?.rides?.total}
          hint={`Live ${byStatus.STARTED ?? 0} · Req ${byStatus.REQUESTED ?? 0}`}
          onClick={() => onNavigateSection('rides')}
        />
        <StatCard
          darkMode={darkMode}
          label="Completed"
          value={byStatus.COMPLETED ?? 0}
          hint="Finished trips"
          accent
        />
        <StatCard
          darkMode={darkMode}
          label="Pending drivers"
          value={pendingDrivers}
          hint="Awaiting verification"
          onClick={() => onNavigateSection('drivers')}
        />
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <UsersByRoleChart byRole={byRole} darkMode={darkMode} />
        <RidesByStatusChart byStatus={byStatus} darkMode={darkMode} />
        <RidesPerDayChart ridesPerDay={ridesPerDay} darkMode={darkMode} />
        <DriversVerificationChart byVerification={byVerification} darkMode={darkMode} />
      </div>

      <div className={cardClass}>
        <h3 className="font-accent text-base font-bold sm:text-lg">Quick actions</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={() => onNavigateSection('drivers')}
            className="rounded-xl bg-[#9d3733] px-3 py-2.5 text-xs font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] sm:px-4 sm:text-sm"
          >
            Review drivers
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('users')}
            className="rounded-xl border border-[#9d3733]/50 px-3 py-2.5 text-xs font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10 sm:px-4 sm:text-sm"
          >
            Manage users
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('rides')}
            className="rounded-xl border border-[#9d3733]/50 px-3 py-2.5 text-xs font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10 sm:px-4 sm:text-sm"
          >
            View rides
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('gallery')}
            className="rounded-xl border border-[#9d3733]/50 px-3 py-2.5 text-xs font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10 sm:px-4 sm:text-sm"
          >
            Gallery uploads
          </button>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="font-accent text-base font-bold sm:text-lg">Latest activity</h3>
        <p className="mt-1 text-sm opacity-80">Most recent rides system-wide.</p>
        <ul className="mt-4 space-y-2">
          {(overview?.recentRides ?? []).length === 0 ? (
            <li className="text-sm opacity-70">No recent rides.</li>
          ) : (
            overview.recentRides.map((ride) => (
              <li
                key={ride.id}
                className={`flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 ${
                  darkMode ? 'border-[#9d3733]/30' : 'border-[#9d3733]/20'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={ride.status} />
                  <span className="font-medium">{ride.rider?.name ?? 'Rider'}</span>
                  <span className="opacity-40">→</span>
                  <span>{ride.driver?.name ?? 'Unassigned'}</span>
                </div>
                <span className="text-xs opacity-70 sm:ml-auto">{ride.pickupAddress}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </>
  )
}
