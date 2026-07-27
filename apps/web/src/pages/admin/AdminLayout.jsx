import { useEffect, useState } from 'react'
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
  const [menuOpen, setMenuOpen] = useState(false)

  const activeNav =
    ADMIN_NAV.find(
      (item) =>
        item.id === section || (section === 'driver-detail' && item.id === 'drivers'),
    ) ?? ADMIN_NAV[0]

  useEffect(() => {
    setMenuOpen(false)
  }, [section])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  const panelClass = darkMode
    ? 'border-[#9d3733]/40 bg-[#111]'
    : 'border-[#9d3733]/30 bg-[#fff8eb]'

  const navButtonClass = (active) =>
    `flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
      active
        ? 'bg-[#9d3733] text-[#f2e3bb]'
        : 'text-[#9d3733] hover:bg-[#9d3733]/10'
    }`

  const renderNav = (onSelect) => (
    <nav className="space-y-1">
      {ADMIN_NAV.map((item) => {
        const active =
          section === item.id || (section === 'driver-detail' && item.id === 'drivers')
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onNavigateSection(item.id)
              onSelect?.()
            }}
            className={navButtonClass(active)}
          >
            <span className="text-base opacity-80" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </button>
        )
      })}
    </nav>
  )

  const renderActions = (compact = false) => (
    <div className={`space-y-2 ${compact ? '' : 'border-t border-[#9d3733]/20 pt-4'}`}>
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        className="w-full rounded-xl border border-[#9d3733]/50 px-3 py-2.5 text-xs font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10 disabled:opacity-50"
      >
        {busy ? 'Refreshing…' : 'Refresh data'}
      </button>
      <button
        type="button"
        onClick={() => navigateToPage('home')}
        className="w-full rounded-xl bg-[#9d3733] px-3 py-2.5 text-xs font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
      >
        Back to site
      </button>
    </div>
  )

  return (
    <div className={adminShellClass(darkMode)}>
      {/* Mobile top bar */}
      <div
        className={`sticky top-[4.25rem] z-30 -mx-3 mb-4 border-b px-3 py-2.5 backdrop-blur-md sm:-mx-4 sm:px-4 md:hidden ${
          darkMode
            ? 'border-[#9d3733]/35 bg-[#0a0a0a]/95'
            : 'border-[#9d3733]/25 bg-[#fffbf5]/95'
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open admin menu"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
              darkMode
                ? 'border-[#9d3733]/45 bg-[#111] text-[#f2e3bb]'
                : 'border-[#9d3733]/35 bg-white text-[#9d3733]'
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9d3733]">
              JOT Ops
            </p>
            <p className="truncate text-sm font-bold">{activeNav.label}</p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="rounded-xl border border-[#9d3733]/50 px-3 py-2 text-[11px] font-bold text-[#9d3733] disabled:opacity-50"
          >
            {busy ? '…' : 'Refresh'}
          </button>
        </div>

        {/* Horizontal section chips */}
        <div className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ADMIN_NAV.map((item) => {
            const active =
              section === item.id || (section === 'driver-detail' && item.id === 'drivers')
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigateSection(item.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  active
                    ? 'bg-[#9d3733] text-[#f2e3bb]'
                    : darkMode
                      ? 'bg-[#111] text-[#9d3733] ring-1 ring-[#9d3733]/35'
                      : 'bg-white text-[#9d3733] ring-1 ring-[#9d3733]/25'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            className={`absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r shadow-2xl ${panelClass}`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#9d3733]/20 p-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9d3733]">
                  Administration
                </p>
                <h1 className="font-brand mt-0.5 text-xl font-bold">JOT Ops</h1>
                <p className="mt-1 truncate text-xs opacity-70">{authUser?.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close"
                className="rounded-lg border border-[#9d3733]/40 px-2.5 py-1 text-sm font-bold text-[#9d3733]"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{renderNav(() => setMenuOpen(false))}</div>
            <div className="border-t border-[#9d3733]/20 p-4">{renderActions(true)}</div>
          </aside>
        </div>
      )}

      <div className="mx-auto flex max-w-7xl flex-col gap-5 lg:flex-row lg:gap-8">
        {/* Desktop sidebar */}
        <aside className={`hidden shrink-0 rounded-2xl border p-4 lg:block lg:w-56 ${panelClass}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9d3733]">
            Administration
          </p>
          <h1 className="font-brand mt-1 text-xl font-bold">JOT Ops</h1>
          <p className="mt-1 truncate text-xs opacity-70">{authUser?.email}</p>
          <div className="mt-5">{renderNav()}</div>
          <div className="mt-6">{renderActions()}</div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4 sm:space-y-6">
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
