import { ADMIN_NAV, adminShellClass } from '../../lib/adminTheme'

export default function AdminLayout({
  darkMode,
  authUser,
  section,
  onNavigateSection,
  onRefresh,
  busy,
  error,
  navigateToPage,
  children,
}) {
  return (
    <div className={adminShellClass(darkMode)}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:gap-8">
        <aside
          className={`shrink-0 rounded-2xl border p-4 lg:w-56 ${
            darkMode ? 'border-[#9d3733]/40 bg-[#111]' : 'border-[#9d3733]/30 bg-[#fff8eb]'
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9d3733]">
            Administration
          </p>
          <h1 className="font-brand mt-1 text-xl font-bold">JOT Ops</h1>
          <p className="mt-1 truncate text-xs opacity-70">{authUser?.email}</p>

          <nav className="mt-5 space-y-1">
            {ADMIN_NAV.map((item) => {
              const active =
                section === item.id || (section === 'driver-detail' && item.id === 'drivers')
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigateSection(item.id)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                    active
                      ? 'bg-[#9d3733] text-[#f2e3bb]'
                      : 'text-[#9d3733] hover:bg-[#9d3733]/10'
                  }`}
                >
                  <span className="text-base opacity-80">{item.icon}</span>
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="mt-6 space-y-2 border-t border-[#9d3733]/20 pt-4">
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              className="w-full rounded-lg border border-[#9d3733]/50 px-3 py-2 text-xs font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10 disabled:opacity-50"
            >
              {busy ? 'Refreshing…' : 'Refresh data'}
            </button>
            <button
              type="button"
              onClick={() => navigateToPage('home')}
              className="w-full rounded-lg bg-[#9d3733] px-3 py-2 text-xs font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
            >
              Back to site
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          {error && (
            <p className="rounded-xl border border-[#9d3733]/50 bg-[#9d3733]/10 px-4 py-3 text-sm text-[#9d3733]">
              {error}
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}
