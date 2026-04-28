/**
 * @param {number | null | undefined} totalMinutes
 * @returns {string | null} Clock-style hours:minutes, e.g. "0:45", "1:05", "3:49"
 */
export function formatDurationHoursMinutes(totalMinutes) {
  if (totalMinutes == null || Number.isNaN(totalMinutes) || totalMinutes < 1) {
    return null
  }
  const rounded = Math.round(totalMinutes)
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  return `${h}:${String(m).padStart(2, '0')}`
}
