export default function StatCard({ label, value, hint, accent, darkMode, onClick }) {
  const cardClass = `rounded-2xl border p-5 transition ${
    darkMode ? 'border-[#9d3733]/40 bg-[#111]' : 'border-[#9d3733]/30 bg-[#fff8eb]'
  } ${onClick ? 'cursor-pointer hover:border-[#9d3733]/60 hover:shadow-md' : ''}`

  const inner = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#9d3733]">{label}</p>
      <p className={`mt-1 font-brand text-3xl font-bold ${accent ? 'text-[#9d3733]' : ''}`}>
        {value ?? '—'}
      </p>
      {hint && <p className="mt-2 text-xs opacity-80">{hint}</p>}
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cardClass} text-left`}>
        {inner}
      </button>
    )
  }

  return <div className={cardClass}>{inner}</div>
}
