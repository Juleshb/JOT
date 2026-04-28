/** Rough Uber-style estimate in USD (not official pricing). */
const USD_BASE = 2.55
const USD_BOOKING = 1.25
const USD_PER_MILE = 1.35
const USD_PER_MINUTE = 0.32
const USD_MINIMUM = 6.5

/**
 * @param {{ distanceKm: number | null | undefined, durationMinutes: number | null | undefined }} params
 * @returns {number | null}
 */
export function estimateRideFareUsd({ distanceKm, durationMinutes }) {
  if (
    distanceKm == null ||
    durationMinutes == null ||
    Number.isNaN(distanceKm) ||
    Number.isNaN(durationMinutes)
  ) {
    return null
  }
  if (distanceKm <= 0 || durationMinutes <= 0) return null

  const miles = distanceKm * 0.621371
  let total = USD_BASE + USD_BOOKING + miles * USD_PER_MILE + durationMinutes * USD_PER_MINUTE
  total = Math.max(total, USD_MINIMUM)
  return Math.round(total * 20) / 20
}

/**
 * @param {number | null | undefined} amount
 * @returns {string | null}
 */
export function formatUsd(amount) {
  if (amount == null || Number.isNaN(amount)) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
