const ROLE_STYLES = {
  RIDER: 'bg-sky-100 text-sky-800',
  DRIVER: 'bg-amber-100 text-amber-900',
  ADMIN: 'bg-[#9d3733]/20 text-[#9d3733]',
}

export default function RoleBadge({ role }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${ROLE_STYLES[role] ?? 'bg-neutral-100 text-neutral-700'}`}
    >
      {role}
    </span>
  )
}
