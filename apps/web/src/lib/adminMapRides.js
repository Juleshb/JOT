import { fetchDrivingRouteCoordinates } from './adminMapDirections'

/** Status colors for admin live map ride visualization. */
export const RIDE_MAP_COLORS = {
  REQUESTED: { trip: '#d97706', driver: '#b45309', pickup: '#f59e0b', dropoff: '#b45309' },
  ACCEPTED: { trip: '#93c5fd', driver: '#2563eb', pickup: '#3b82f6', dropoff: '#1d4ed8' },
  STARTED: { trip: '#34d399', driver: '#059669', pickup: '#10b981', dropoff: '#047857' },
}

export const ROUTES_SOURCE_ID = 'admin-active-rides-routes'
export const ROUTES_LAYER_ID = 'admin-active-rides-routes-layer'

export function driverCoordsMap(drivers) {
  const map = {}
  for (const d of drivers) {
    if (d?.userId != null) {
      map[d.userId] = { lat: d.lat, lng: d.lng }
    }
  }
  return map
}

function resolveDriverCoords(ride, driversByUserId) {
  const id = ride.driver?.id
  if (!id) return null
  const live = driversByUserId[id]
  if (live) return live
  if (ride.driver?.lat != null && ride.driver?.lng != null) {
    return { lat: ride.driver.lat, lng: ride.driver.lng }
  }
  return null
}

async function tripRouteFeature(ride, mapboxToken) {
  const status = ride.status ?? 'REQUESTED'
  const colors = RIDE_MAP_COLORS[status] ?? RIDE_MAP_COLORS.REQUESTED
  const coordinates = await fetchDrivingRouteCoordinates(
    mapboxToken,
    ride.pickupLng,
    ride.pickupLat,
    ride.dropoffLng,
    ride.dropoffLat,
  )

  return {
    type: 'Feature',
    id: `${ride.id}-trip`,
    geometry: { type: 'LineString', coordinates },
    properties: {
      rideId: ride.id,
      status,
      kind: 'trip',
      color: colors.trip,
      riderName: ride.rider?.name ?? 'Rider',
      label: 'Trip route',
    },
  }
}

async function driverLegFeature(ride, driversByUserId, mapboxToken) {
  const status = ride.status ?? 'REQUESTED'
  if (status !== 'ACCEPTED' && status !== 'STARTED') return null

  const driverPos = resolveDriverCoords(ride, driversByUserId)
  if (!driverPos) return null

  const colors = RIDE_MAP_COLORS[status] ?? RIDE_MAP_COLORS.ACCEPTED
  const toLng = status === 'ACCEPTED' ? ride.pickupLng : ride.dropoffLng
  const toLat = status === 'ACCEPTED' ? ride.pickupLat : ride.dropoffLat

  const coordinates = await fetchDrivingRouteCoordinates(
    mapboxToken,
    driverPos.lng,
    driverPos.lat,
    toLng,
    toLat,
  )

  return {
    type: 'Feature',
    id: `${ride.id}-driver`,
    geometry: { type: 'LineString', coordinates },
    properties: {
      rideId: ride.id,
      status,
      kind: 'driver-leg',
      color: colors.driver,
      driverName: ride.driver?.name ?? 'Driver',
      label: status === 'ACCEPTED' ? 'Driver → pickup' : 'Driver → dropoff',
    },
  }
}

/** Build GeoJSON with Mapbox driving geometry (roads), not straight lines. */
export async function buildRideRouteGeoJSONAsync(rides, driversByUserId = {}, mapboxToken) {
  const jobs = []
  for (const ride of rides) {
    if (!ride?.pickupLat || !ride?.dropoffLat) continue
    jobs.push(tripRouteFeature(ride, mapboxToken))
    jobs.push(driverLegFeature(ride, driversByUserId, mapboxToken))
  }

  const results = await Promise.all(jobs)
  const features = results.filter(Boolean)
  return { type: 'FeatureCollection', features }
}

/** Straight-line fallback (sync) — used only before async routes load. */
export function buildRideRouteGeoJSONStraight(rides, driversByUserId = {}) {
  const features = []
  for (const ride of rides) {
    if (!ride?.pickupLat || !ride?.dropoffLat) continue
    const status = ride.status ?? 'REQUESTED'
    const colors = RIDE_MAP_COLORS[status] ?? RIDE_MAP_COLORS.REQUESTED
    features.push({
      type: 'Feature',
      id: `${ride.id}-trip`,
      geometry: {
        type: 'LineString',
        coordinates: [
          [ride.pickupLng, ride.pickupLat],
          [ride.dropoffLng, ride.dropoffLat],
        ],
      },
      properties: {
        rideId: ride.id,
        status,
        kind: 'trip',
        color: colors.trip,
      },
    })
    const driverPos = resolveDriverCoords(ride, driversByUserId)
    if (driverPos && (status === 'ACCEPTED' || status === 'STARTED')) {
      const toLng = status === 'ACCEPTED' ? ride.pickupLng : ride.dropoffLng
      const toLat = status === 'ACCEPTED' ? ride.pickupLat : ride.dropoffLat
      features.push({
        type: 'Feature',
        id: `${ride.id}-driver`,
        geometry: {
          type: 'LineString',
          coordinates: [
            [driverPos.lng, driverPos.lat],
            [toLng, toLat],
          ],
        },
        properties: {
          rideId: ride.id,
          status,
          kind: 'driver-leg',
          color: colors.driver,
        },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

export function ensureRideRouteLayers(map) {
  if (!map.getSource(ROUTES_SOURCE_ID)) {
    map.addSource(ROUTES_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }
  if (!map.getLayer(ROUTES_LAYER_ID)) {
    map.addLayer({
      id: ROUTES_LAYER_ID,
      type: 'line',
      source: ROUTES_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['==', ['get', 'kind'], 'driver-leg'], 5, 4],
        'line-opacity': 0.92,
        'line-dasharray': [
          'case',
          ['==', ['get', 'kind'], 'driver-leg'],
          ['literal', [1, 0]],
          ['==', ['get', 'status'], 'REQUESTED'],
          ['literal', [2, 2]],
          ['literal', [1, 0]],
        ],
      },
    })
  }
}

export async function updateRideRouteLayersAsync(map, rides, driversByUserId, mapboxToken) {
  const source = map.getSource(ROUTES_SOURCE_ID)
  if (!source) return
  const geo = await buildRideRouteGeoJSONAsync(rides, driversByUserId, mapboxToken)
  source.setData(geo)
}

export function setRideRouteLayersStraight(map, rides, driversByUserId) {
  const source = map.getSource(ROUTES_SOURCE_ID)
  if (!source) return
  source.setData(buildRideRouteGeoJSONStraight(rides, driversByUserId))
}

export function createRiderMarkerElement(name, status) {
  const colors = RIDE_MAP_COLORS[status] ?? RIDE_MAP_COLORS.REQUESTED
  const el = document.createElement('div')
  el.className =
    'flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white shadow-lg ring-2 ring-sky-400/50 transition hover:scale-110'
  el.style.backgroundColor = '#0ea5e9'
  el.title = name ? `Rider: ${name}` : 'Active rider'
  el.textContent = name?.[0]?.toUpperCase() ?? 'R'
  return el
}

export function buildRiderMarkerPopup(ride) {
  const status = ride.status ?? 'REQUESTED'
  return `
    <div class="min-w-[200px] p-1 text-sm text-[#2d100f]">
      <p class="font-bold text-sky-700">Active rider</p>
      <p class="mt-1 font-semibold">${ride.rider?.name ?? 'Rider'}</p>
      <p class="text-xs font-bold" style="color:${RIDE_MAP_COLORS[status]?.trip ?? '#9d3733'}">${status}</p>
      <p class="mt-1 text-xs opacity-80">Pickup: ${ride.pickupAddress ?? ''}</p>
      ${ride.driver?.name ? `<p class="text-xs">Driver: ${ride.driver.name}</p>` : ''}
    </div>
  `
}

export function createRideStopElement(kind, status) {
  const colors = RIDE_MAP_COLORS[status] ?? RIDE_MAP_COLORS.REQUESTED
  const bg = kind === 'pickup' ? colors.pickup : colors.dropoff
  const el = document.createElement('div')
  el.className =
    'flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md'
  el.style.backgroundColor = bg
  el.textContent = kind === 'pickup' ? 'P' : 'D'
  return el
}

export function buildRideStopPopup(ride, kind) {
  const isPickup = kind === 'pickup'
  const addr = isPickup ? ride.pickupAddress : ride.dropoffAddress
  const status = ride.status ?? 'REQUESTED'
  return `
    <div class="min-w-[180px] p-1 text-sm text-[#2d100f]">
      <p class="font-bold" style="color:${RIDE_MAP_COLORS[status]?.trip ?? '#9d3733'}">${ride.status}</p>
      <p class="mt-1 text-xs"><strong>${isPickup ? 'Pickup' : 'Dropoff'}</strong></p>
      <p class="text-xs opacity-80">${ride.rider?.name ?? 'Rider'}</p>
      <p class="mt-1 text-xs">${addr ?? ''}</p>
      ${ride.driver?.name ? `<p class="mt-1 text-xs">Driver: ${ride.driver.name}</p>` : '<p class="mt-1 text-xs text-amber-700">Awaiting driver</p>'}
    </div>
  `
}
