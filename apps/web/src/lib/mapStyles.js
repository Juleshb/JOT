/**
 * @typedef {'navigate' | 'street' | 'transit'} RiderBasemapMode
 */

/**
 * Basemap modes:
 * - navigate: Mapbox Navigation (driving-first, shields)
 * - street: general map (light/dark)
 * - transit: detailed streets in light (transit lines/labels where Mapbox provides them); dark uses dark-v11
 */
export function getBasemapStyleUrl(mode, isDark) {
  if (mode === 'street') {
    return isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'
  }
  if (mode === 'transit') {
    return isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12'
  }
  return isDark
    ? 'mapbox://styles/mapbox/navigation-night-v1'
    : 'mapbox://styles/mapbox/navigation-day-v1'
}

/** @deprecated Use getBasemapStyleUrl('navigate', isDark) */
export function getRideMapStyleUrl(isDark) {
  return getBasemapStyleUrl('navigate', isDark)
}
