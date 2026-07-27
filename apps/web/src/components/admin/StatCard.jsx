export default function StatCard({ label, value, hint, accent, darkMode, onClick }) {
  const cardClass = `rounded-2xl border p-4 sm:p-5 transition ${
    darkMode ? 'border-[#9d3733]/40 bg-[#111]' : 'border-[#9d3733]/30 bg-[#fff8eb]'
  } ${onClick ? 'cursor-pointer hover:border-[#9d3733]/60 hover:shadow-md active:scale-[0.99]' : ''}`

  const inner = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9d3733] sm:text-xs">
        {label}
      </p>
      <p
        className={`mt-1 font-brand text-2xl font-bold sm:text-3xl ${accent ? 'text-[#9d3733]' : ''}`}
      >
        {value ?? '—'}
      </p>
      {hint && <p className="mt-1.5 text-[11px] opacity-80 sm:mt-2 sm:text-xs">{hint}</p>}
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
