function ManeuverIcon({ kind, className }) {
  const stroke = 'currentColor'
  const common = { fill: 'none', stroke, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }

  switch (kind) {
    case 'left':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <path {...common} d="M28 8v10c0 6-4 10-10 10H8M8 28 14 22l-6-6" />
        </svg>
      )
    case 'slight-left':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <path {...common} d="M30 10v8c0 5-3 9-8 11l-12 5M8 34l8-4-2-8" />
        </svg>
      )
    case 'right':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <path {...common} d="M20 8v10c0 6 4 10 10 10h10M40 28 34 22l6-6" />
        </svg>
      )
    case 'slight-right':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <path {...common} d="M18 10v8c0 5 3 9 8 11l12 5M40 34l-8-4 2-8" />
        </svg>
      )
    case 'uturn':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <path {...common} d="M32 12a12 12 0 0 0-12-12h-4a12 12 0 0 0-12 12v14a12 12 0 0 0 12 12h6M26 38l6-6-6-6" />
        </svg>
      )
    case 'roundabout':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <circle {...common} cx="24" cy="22" r="10" />
          <path {...common} d="M24 4v6M34 10l-4 4" />
        </svg>
      )
    case 'arrive':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <path {...common} d="M24 6l12 10v14c0 8-6 14-12 14S12 38 12 30V16L24 6z" />
          <path {...common} d="M24 20v10" />
        </svg>
      )
    case 'fork-left':
    case 'merge-left':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <path {...common} d="M24 40V20M24 20 14 10M24 20 34 10" />
        </svg>
      )
    case 'fork-right':
    case 'merge-right':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <path {...common} d="M24 40V20M24 20 14 10M24 20 34 10" />
        </svg>
      )
    default:
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <path {...common} d="M24 40V8M16 16l8-8 8 8" />
        </svg>
      )
  }
}

/**
 * Google-Maps-style next-turn banner for drivers.
 * @param {object} props
 * @param {boolean} props.darkMode
 * @param {'pickup'|'dropoff'} props.phase
 * @param {string} props.instruction
 * @param {number | null} props.distanceM — straight-line to maneuver, meters
 * @param {string} props.maneuverKind
 */
export default function DriverTurnBanner({ darkMode, phase, instruction, distanceM, maneuverKind }) {
  const label = phase === 'pickup' ? 'To pickup' : 'To dropoff'
  const distLabel =
    distanceM != null && Number.isFinite(distanceM)
      ? distanceM >= 1000
        ? `${(distanceM / 1000).toFixed(1)} km`
        : `${Math.max(10, Math.round(distanceM / 10) * 10)} m`
      : null

  return (
    <div
      className={`pointer-events-none z-[18] flex w-full max-w-lg justify-center px-3 sm:max-w-xl ${
        darkMode
          ? 'text-[#f2e3bb] drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]'
          : 'text-[#2d100f] drop-shadow-[0_2px_6px_rgba(255,255,255,0.9)]'
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex w-full items-stretch overflow-hidden rounded-2xl border shadow-xl backdrop-blur-md ${
          darkMode ? 'border-[#1a4d2e]/60 bg-[#0d1f14]/92' : 'border-[#15803d]/35 bg-[#ecfdf3]/95'
        }`}
      >
        <div
          className={`flex w-[4.25rem] shrink-0 items-center justify-center sm:w-[5rem] ${
            darkMode ? 'bg-[#15803d]/25' : 'bg-[#15803d]/20'
          }`}
        >
          <ManeuverIcon kind={maneuverKind} className="h-11 w-11 sm:h-14 sm:w-14 text-[#15803d]" />
        </div>
        <div className="min-w-0 flex-1 py-2.5 pl-3 pr-3 sm:py-3 sm:pl-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#15803d] sm:text-[11px]">
            {label}
          </p>
          <p className="mt-0.5 font-brand text-base font-bold leading-snug sm:text-lg">{instruction}</p>
          {distLabel ? (
            <p className={`mt-1 text-xs font-semibold ${darkMode ? 'text-[#f2e3bb]/75' : 'text-[#2d100f]/70'}`}>
              in ~{distLabel}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
