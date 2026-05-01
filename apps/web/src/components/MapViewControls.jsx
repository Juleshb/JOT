const BASEMAP_MODES = [
  { id: 'navigate', label: 'Navigate' },
  { id: 'street', label: 'Street' },
  { id: 'transit', label: 'Transit' },
]

const VALID_BASEMAP_IDS = new Set(BASEMAP_MODES.map((m) => m.id))

export default function MapViewControls({
  darkMode,
  basemapMode,
  onBasemapModeChange,
  trafficOn,
  onTrafficToggle,
  onStreetView,
  disabled,
  className = '',
}) {
  const chipBase =
    'rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition sm:px-3 sm:text-xs disabled:opacity-50'

  return (
    <div
      className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center ${className}`}
    >
      <div
        className={`inline-flex flex-wrap justify-center gap-1 rounded-xl border p-0.5 ${
          darkMode ? 'border-[#9d3733]/40 bg-black/50' : 'border-[#9d3733]/25 bg-white/80'
        }`}
        role="group"
        aria-label="Map type"
      >
        {BASEMAP_MODES.map(({ id, label }) => {
          const active = basemapMode === id
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (VALID_BASEMAP_IDS.has(id)) onBasemapModeChange(id)
              }}
              className={`${chipBase} ${
                active
                  ? 'bg-[#9d3733] text-[#f2e3bb] shadow-sm'
                  : darkMode
                    ? 'text-[#f2e3bb]/85 hover:bg-[#9d3733]/20'
                    : 'text-[#2d100f] hover:bg-[#9d3733]/10'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onTrafficToggle(!trafficOn)}
          className={`${chipBase} border ${
            trafficOn
              ? 'border-[#9d3733] bg-[#9d3733]/20 text-[#9d3733]'
              : darkMode
                ? 'border-[#9d3733]/35 text-[#f2e3bb] hover:bg-[#9d3733]/15'
                : 'border-[#9d3733]/30 text-[#2d100f] hover:bg-[#9d3733]/10'
          }`}
        >
          Traffic {trafficOn ? 'on' : 'off'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onStreetView}
          className={`${chipBase} border ${
            darkMode
              ? 'border-[#9d3733]/35 text-[#f2e3bb] hover:bg-[#9d3733]/15'
              : 'border-[#9d3733]/30 text-[#2d100f] hover:bg-[#9d3733]/10'
          }`}
        >
          Street view
        </button>
      </div>
    </div>
  )
}
