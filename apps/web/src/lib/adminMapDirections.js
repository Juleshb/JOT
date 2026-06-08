const routeCache = new Map()
const MAX_CACHE = 120

function cacheKey(fromLng, fromLat, toLng, toLat) {
  return `${fromLng.toFixed(4)},${fromLat.toFixed(4)};${toLng.toFixed(4)},${toLat.toFixed(4)}`
}

function straightLine(fromLng, fromLat, toLng, toLat) {
  return [
    [fromLng, fromLat],
    [toLng, toLat],
  ]
}

/**
 * Mapbox Driving directions between two points. Returns [lng, lat][].
 * Falls back to a straight segment when the API is unavailable.
 */
export async function fetchDrivingRouteCoordinates(
  mapboxToken,
  fromLng,
  fromLat,
  toLng,
  toLat,
) {
  if (
    !Number.isFinite(fromLng) ||
    !Number.isFinite(fromLat) ||
    !Number.isFinite(toLng) ||
    !Number.isFinite(toLat)
  ) {
    return []
  }

  const key = cacheKey(fromLng, fromLat, toLng, toLat)
  if (routeCache.has(key)) {
    return routeCache.get(key)
  }

  if (!mapboxToken) {
    const fallback = straightLine(fromLng, fromLat, toLng, toLat)
    routeCache.set(key, fallback)
    return fallback
  }

  const coordinates = `${fromLng},${fromLat};${toLng},${toLat}`
  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    alternatives: 'false',
    access_token: mapboxToken,
  })
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?${params.toString()}`

  try {
    const response = await fetch(url)
    const data = await response.json().catch(() => ({}))
    const coords = data?.routes?.[0]?.geometry?.coordinates
    if (Array.isArray(coords) && coords.length >= 2) {
      if (routeCache.size >= MAX_CACHE) {
        const first = routeCache.keys().next().value
        routeCache.delete(first)
      }
      routeCache.set(key, coords)
      return coords
    }
  } catch {
    /* use fallback */
  }

  const fallback = straightLine(fromLng, fromLat, toLng, toLat)
  routeCache.set(key, fallback)
  return fallback
}
