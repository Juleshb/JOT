export function adminShellClass(darkMode) {
  return `min-h-[calc(100dvh-5rem)] px-4 pb-20 pt-24 md:px-6 md:pt-28 ${
    darkMode ? 'bg-[#0a0a0a] text-[#f2e3bb]' : 'bg-[#fffbf5] text-[#2d100f]'
  }`
}

export function adminCardClass(darkMode) {
  return `rounded-2xl border p-5 md:p-6 ${
    darkMode ? 'border-[#9d3733]/40 bg-[#111]' : 'border-[#9d3733]/30 bg-[#fff8eb]'
  }`
}

export function adminInputClass(darkMode) {
  return `w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#9d3733] ${
    darkMode
      ? 'border-[#9d3733]/45 bg-black text-[#f2e3bb]'
      : 'border-[#9d3733]/30 bg-white text-[#2d100f]'
  }`
}

export function adminTableRowClass(darkMode) {
  return `border-b ${darkMode ? 'border-[#9d3733]/20' : 'border-[#9d3733]/15'}`
}

export function adminTableHeadClass(darkMode) {
  return `border-b ${darkMode ? 'border-[#9d3733]/35' : 'border-[#9d3733]/25'}`
}

export const ADMIN_NAV = [
  { id: 'overview', label: 'Overview', path: '/admin', icon: '◈' },
  { id: 'users', label: 'Users', path: '/admin/users', icon: '◎' },
  { id: 'drivers', label: 'Drivers', path: '/admin/drivers', icon: '◇' },
  { id: 'live-map', label: 'Live map', path: '/admin/map', icon: '⊞' },
  { id: 'rides', label: 'Rides', path: '/admin/rides', icon: '▣' },
]

export function getAdminDriverId(pathname) {
  const match = pathname.match(/^\/admin\/drivers\/([^/]+)$/)
  return match?.[1] ?? null
}

export function getAdminSection(pathname) {
  if (getAdminDriverId(pathname)) return 'driver-detail'
  if (pathname === '/admin/users') return 'users'
  if (pathname === '/admin/drivers') return 'drivers'
  if (pathname === '/admin/map') return 'live-map'
  if (pathname === '/admin/rides') return 'rides'
  return 'overview'
}

export function adminDriverPath(userId) {
  return `/admin/drivers/${userId}`
}
