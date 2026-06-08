const STATUS_STYLES = {
  REQUESTED: 'bg-amber-100 text-amber-900',
  ACCEPTED: 'bg-blue-100 text-blue-800',
  STARTED: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-neutral-100 text-neutral-800',
  CANCELLED: 'bg-red-100 text-red-800',
  PENDING: 'bg-amber-100 text-amber-900',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
}

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[status] ?? 'bg-neutral-100 text-neutral-700'}`}
    >
      {status}
    </span>
  )
}
