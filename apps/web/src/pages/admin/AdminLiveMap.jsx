import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { io } from 'socket.io-client'
import { adminActiveRides, adminDriverLocations } from '../../lib/api'
import { downloadRideMapSnapshot, fitMapToRide } from '../../lib/adminMapExport'
import {
  RIDE_MAP_COLORS,
  buildRideStopPopup,
  buildRiderMarkerPopup,
  createRideStopElement,
  createRiderMarkerElement,
  driverCoordsMap,
  ensureRideRouteLayers,
  setRideRouteLayersStraight,
  updateRideRouteLayersAsync,
} from '../../lib/adminMapRides'
import { getBasemapStyleUrl } from '../../lib/mapStyles'
import { adminCardClass } from '../../lib/adminTheme'

const DEFAULT_CENTER = { lat: 32.7767, lng: -96.797 }
const SYNC_POLL_MS = 60_000
const ROUTE_DEBOUNCE_MS = 500
const ANIM_MS = 900

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

function createMarkerElement(name) {
  const el = document.createElement('div')
  el.className =
    'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-[#9d3733] font-bold text-sm text-[#f2e3bb] shadow-lg ring-2 ring-[#9d3733]/30'
  el.title = name
  el.textContent = name?.[0]?.toUpperCase() ?? 'D'
  return el
}

function buildPopupContent(driver, onViewDriver) {
  const root = document.createElement('div')
  root.className = 'min-w-[200px] p-1 text-sm text-[#2d100f]'

  const title = document.createElement('p')
  title.className = 'font-bold text-[#9d3733]'
  title.textContent = driver.name
  root.appendChild(title)

  const vehicle = document.createElement('p')
  vehicle.className = 'mt-1 text-xs opacity-80'
  vehicle.textContent = `${driver.vehicleColor} ${driver.vehicleMake} ${driver.vehicleModel}`
  root.appendChild(vehicle)

  const plate = document.createElement('p')
  plate.className = 'font-mono text-xs'
  plate.textContent = driver.licensePlate
  root.appendChild(plate)

  if (driver.averageRiderRating != null) {
    const rating = document.createElement('p')
    rating.className = 'mt-1 text-xs'
    rating.textContent = `★ ${driver.averageRiderRating.toFixed(1)} (${driver.riderRatingCount} reviews)`
    root.appendChild(rating)
  }

  const status = document.createElement('p')
  status.className = 'mt-1 text-[11px] font-semibold text-emerald-700'
  status.textContent = '● Online · live'
  root.appendChild(status)

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className =
    'mt-2 w-full rounded-md bg-[#9d3733] px-3 py-1.5 text-xs font-bold text-[#f2e3bb] hover:bg-[#842f2b]'
  btn.textContent = 'View profile'
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    onViewDriver(driver.userId)
  })
  root.appendChild(btn)

  return root
}

function animateMarker(marker, toLng, toLat, duration = ANIM_MS) {
  const from = marker.getLngLat()
  const start = [from.lng, from.lat]
  const end = [toLng, toLat]
  if (Math.abs(start[0] - end[0]) < 1e-7 && Math.abs(start[1] - end[1]) < 1e-7) return

  const t0 = performance.now()
  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration)
    const ease = t * (2 - t)
    const lng = start[0] + (end[0] - start[0]) * ease
    const lat = start[1] + (end[1] - start[1]) * ease
    marker.setLngLat([lng, lat])
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

export default function AdminLiveMap({ darkMode, authToken, mapboxAccessToken, onViewDriver }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const rideMarkersRef = useRef(new Map())
  const driversRef = useRef([])
  const activeRidesRef = useRef([])
  const onViewDriverRef = useRef(onViewDriver)
  const hasFitBoundsRef = useRef(false)
  const fetchMapDataRef = useRef(null)

  const [drivers, setDrivers] = useState([])
  const [activeRides, setActiveRides] = useState([])
  const [liveConnected, setLiveConnected] = useState(false)
  const [lastLiveAt, setLastLiveAt] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [mapError, setMapError] = useState(null)
  const [routesLoading, setRoutesLoading] = useState(false)
  const [selectedRideId, setSelectedRideId] = useState(null)
  const [exportBusy, setExportBusy] = useState(false)

  const cardClass = adminCardClass(darkMode)
  onViewDriverRef.current = onViewDriver
  driversRef.current = drivers
  activeRidesRef.current = activeRides

  const fetchMapData = useCallback(async () => {
    if (!authToken) return
    try {
      const [driverData, rideData] = await Promise.all([
        adminDriverLocations(authToken),
        adminActiveRides(authToken),
      ])
      setDrivers(Array.isArray(driverData.drivers) ? driverData.drivers : [])
      setActiveRides(Array.isArray(rideData.rides) ? rideData.rides : [])
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to load map data.')
    } finally {
      setBusy(false)
    }
  }, [authToken])

  fetchMapDataRef.current = fetchMapData

  const focusRide = useCallback(
    (ride) => {
      if (!ride?.id) return
      setSelectedRideId(ride.id)
      const map = mapRef.current
      if (!map) return
      hasFitBoundsRef.current = true
      fitMapToRide(map, ride, driverCoordsMap(drivers))
    },
    [drivers],
  )

  const exportRideSnapshot = useCallback(
    async (ride) => {
      if (!ride || !mapRef.current || exportBusy) return
      setExportBusy(true)
      setSelectedRideId(ride.id)
      setError('')
      try {
        const map = mapRef.current
        const driversByUserId = driverCoordsMap(drivers)
        if (map.isStyleLoaded()) {
          await updateRideRouteLayersAsync(map, [ride], driversByUserId, mapboxAccessToken)
        }
        await downloadRideMapSnapshot(map, ride, driversByUserId)
      } catch (e) {
        setError(e.message || 'Could not export map image.')
      } finally {
        setExportBusy(false)
      }
    },
    [drivers, exportBusy, mapboxAccessToken],
  )

  useEffect(() => {
    hasFitBoundsRef.current = false
    fetchMapData()
    const id = setInterval(fetchMapData, SYNC_POLL_MS)
    return () => clearInterval(id)
  }, [fetchMapData])

  useEffect(() => {
    if (!authToken) return undefined

    const socket = io(API_BASE, {
      auth: { token: authToken },
      transports: ['websocket'],
    })

    socket.on('connect', () => setLiveConnected(true))
    socket.on('disconnect', () => setLiveConnected(false))

    socket.on('admin:driver_location', (payload) => {
      const userId = payload?.userId
      const lat = Number(payload?.lat)
      const lng = Number(payload?.lng)
      if (!userId || !Number.isFinite(lat) || !Number.isFinite(lng)) return

      setLastLiveAt(payload?.at ?? new Date().toISOString())

      setDrivers((prev) => {
        const idx = prev.findIndex((d) => d.userId === userId)
        if (idx === -1) {
          fetchMapDataRef.current?.()
          return prev
        }
        const next = [...prev]
        next[idx] = { ...next[idx], lat, lng }
        return next
      })

      const marker = markersRef.current.get(userId)
      if (marker) {
        animateMarker(marker, lng, lat)
      }
    })

    socket.on('admin:driver_online', (driver) => {
      if (!driver?.userId) return
      setLastLiveAt(new Date().toISOString())
      setDrivers((prev) => {
        const exists = prev.some((d) => d.userId === driver.userId)
        if (exists) {
          return prev.map((d) => (d.userId === driver.userId ? { ...d, ...driver } : d))
        }
        hasFitBoundsRef.current = false
        return [...prev, driver]
      })
    })

    socket.on('admin:driver_offline', (payload) => {
      const userId = payload?.userId
      if (!userId) return
      setDrivers((prev) => prev.filter((d) => d.userId !== userId))
      const marker = markersRef.current.get(userId)
      if (marker) {
        marker.remove()
        markersRef.current.delete(userId)
      }
    })

    socket.on('admin:ride_map', (payload) => {
      if (payload?.action === 'remove' && payload?.rideId) {
        setActiveRides((prev) => prev.filter((r) => r.id !== payload.rideId))
        return
      }
      if (payload?.action === 'upsert' && payload?.ride?.id) {
        setActiveRides((prev) => {
          const idx = prev.findIndex((r) => r.id === payload.ride.id)
          if (idx === -1) return [...prev, payload.ride]
          const next = [...prev]
          next[idx] = payload.ride
          return next
        })
      }
    })

    return () => {
      socket.disconnect()
      setLiveConnected(false)
    }
  }, [authToken])

  useEffect(() => {
    if (!mapboxAccessToken || !mapContainerRef.current) return undefined

    setMapError(null)

    if (typeof mapboxgl.supported === 'function') {
      try {
        if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
          setMapError('WebGL is unavailable in this browser.')
          return undefined
        }
      } catch {
        /* continue */
      }
    }

    let map
    try {
      mapboxgl.accessToken = mapboxAccessToken
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: getBasemapStyleUrl('street', darkMode),
        center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
        zoom: 11,
        attributionControl: false,
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: true,
      })
    } catch (err) {
      console.error(err)
      setMapError('The map failed to start.')
      return undefined
    }

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'top-left')
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    mapRef.current = map

    const onResize = () => {
      try {
        map.resize()
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('resize', onResize)
    map.on('load', () => {
      onResize()
      ensureRideRouteLayers(map)
    })

    return () => {
      window.removeEventListener('resize', onResize)
      markersRef.current.forEach((m) => m.remove())
      markersRef.current.clear()
      rideMarkersRef.current.forEach((m) => m.remove())
      rideMarkersRef.current.clear()
      hasFitBoundsRef.current = false
      try {
        map.remove()
      } catch {
        /* ignore */
      }
      mapRef.current = null
    }
  }, [mapboxAccessToken, darkMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined

    const syncMarkers = () => {
      const seen = new Set()

      for (const driver of drivers) {
        seen.add(driver.userId)
        const lngLat = [driver.lng, driver.lat]
        const popup = new mapboxgl.Popup({ offset: 20, closeOnClick: true }).setDOMContent(
          buildPopupContent(driver, (id) => onViewDriverRef.current(id)),
        )

        let marker = markersRef.current.get(driver.userId)
        if (!marker) {
          const el = createMarkerElement(driver.name)
          el.addEventListener('click', () => {
            onViewDriverRef.current(driver.userId)
          })

          marker = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).setPopup(popup).addTo(map)
          markersRef.current.set(driver.userId, marker)
        } else {
          marker.setPopup(popup)
          const current = marker.getLngLat()
          const dist =
            Math.abs(current.lng - driver.lng) + Math.abs(current.lat - driver.lat)
          if (dist > 0.0001) {
            animateMarker(marker, driver.lng, driver.lat)
          }
        }
      }

      for (const [userId, marker] of markersRef.current) {
        if (!seen.has(userId)) {
          marker.remove()
          markersRef.current.delete(userId)
        }
      }

      if (!hasFitBoundsRef.current && drivers.length > 0) {
        hasFitBoundsRef.current = true
        if (drivers.length === 1) {
          map.easeTo({ center: [drivers[0].lng, drivers[0].lat], zoom: 13 })
        } else {
          const bounds = new mapboxgl.LngLatBounds()
          drivers.forEach((d) => bounds.extend([d.lng, d.lat]))
          map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 800 })
        }
      }
    }

    if (map.isStyleLoaded()) {
      syncMarkers()
    } else {
      map.once('load', syncMarkers)
    }
  }, [drivers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return undefined

    const driversByUserId = driverCoordsMap(drivers)
    setRideRouteLayersStraight(map, activeRides, driversByUserId)

    let cancelled = false
    const timer = window.setTimeout(() => {
      setRoutesLoading(true)
      updateRideRouteLayersAsync(map, activeRides, driversByUserId, mapboxAccessToken)
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setRoutesLoading(false)
        })
    }, ROUTE_DEBOUNCE_MS)

    const seen = new Set()
    for (const ride of activeRides) {
      const status = ride.status ?? 'REQUESTED'

      const riderKey = `rider-${ride.id}`
      seen.add(riderKey)
      if (Number.isFinite(ride.pickupLat) && Number.isFinite(ride.pickupLng)) {
        const riderLngLat = [ride.pickupLng, ride.pickupLat]
        let riderMarker = rideMarkersRef.current.get(riderKey)
        const riderPopup = new mapboxgl.Popup({ offset: 22 }).setHTML(buildRiderMarkerPopup(ride))
        if (!riderMarker) {
          const el = createRiderMarkerElement(ride.rider?.name, status)
          el.addEventListener('click', () => focusRide(ride))
          riderMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(riderLngLat)
            .setPopup(riderPopup)
            .addTo(map)
          rideMarkersRef.current.set(riderKey, riderMarker)
        } else {
          riderMarker.setLngLat(riderLngLat)
          riderMarker.setPopup(riderPopup)
          const el = riderMarker.getElement()
          if (el) {
            el.style.outline =
              selectedRideId === ride.id ? '3px solid #9d3733' : 'none'
            el.style.outlineOffset = '2px'
          }
        }
      }

      for (const kind of ['pickup', 'dropoff']) {
        const key = `${ride.id}-${kind}`
        seen.add(key)
        const lat = kind === 'pickup' ? ride.pickupLat : ride.dropoffLat
        const lng = kind === 'pickup' ? ride.pickupLng : ride.dropoffLng
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

        const lngLat = [lng, lat]
        let marker = rideMarkersRef.current.get(key)
        const popup = new mapboxgl.Popup({ offset: 14 }).setHTML(buildRideStopPopup(ride, kind))

        if (!marker) {
          const el = createRideStopElement(kind, status)
          marker = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).setPopup(popup).addTo(map)
          rideMarkersRef.current.set(key, marker)
        } else {
          marker.setLngLat(lngLat)
          marker.setPopup(popup)
          const el = marker.getElement()
          if (el) {
            el.style.backgroundColor =
              kind === 'pickup'
                ? (RIDE_MAP_COLORS[status]?.pickup ?? '#f59e0b')
                : (RIDE_MAP_COLORS[status]?.dropoff ?? '#b45309')
          }
        }
      }
    }

    for (const [key, marker] of rideMarkersRef.current) {
      if (!seen.has(key)) {
        marker.remove()
        rideMarkersRef.current.delete(key)
      }
    }

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [activeRides, drivers, mapboxAccessToken, selectedRideId, focusRide])

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-brand text-2xl font-bold">Live driver map</h2>
          <p className="mt-1 text-sm opacity-80">
            Live drivers and active riders on trip routes. Click a rider to zoom in, or export a trip
            snapshot image.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              liveConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                liveConnected ? 'animate-pulse bg-emerald-600' : 'bg-amber-600'
              }`}
            />
            {liveConnected ? 'Live' : 'Connecting…'}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              drivers.length > 0
                ? 'bg-[#9d3733]/15 text-[#9d3733]'
                : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {drivers.length} drivers
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              activeRides.length > 0
                ? 'bg-amber-100 text-amber-900'
                : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {activeRides.length} active rides
          </span>
          <button
            type="button"
            onClick={() => {
              hasFitBoundsRef.current = false
              fetchMapData()
            }}
            disabled={busy}
            className="rounded-lg border border-[#9d3733]/50 px-4 py-2 text-sm font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10 disabled:opacity-50"
          >
            {busy ? 'Syncing…' : 'Sync all'}
          </button>
        </div>
      </header>

      {error && (
        <p className="rounded-xl border border-[#9d3733]/50 bg-[#9d3733]/10 px-4 py-3 text-sm text-[#9d3733]">
          {error}
        </p>
      )}

      {!mapboxAccessToken ? (
        <div className={cardClass}>
          <p className="text-sm text-[#9d3733]">
            Set <code className="rounded bg-black/10 px-1">VITE_MAPBOX_ACCESS_TOKEN</code> in your web
            environment to load the map.
          </p>
        </div>
      ) : mapError ? (
        <div className={cardClass}>
          <p className="text-sm text-[#9d3733]">{mapError}</p>
        </div>
      ) : (
        <div className={cardClass}>
          <div
            ref={mapContainerRef}
            className={`relative h-[min(70vh,560px)] w-full overflow-hidden rounded-2xl border ${
              darkMode ? 'border-[#9d3733]/40' : 'border-[#9d3733]/30'
            }`}
          />
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
            {['REQUESTED', 'ACCEPTED', 'STARTED'].map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-6 rounded-sm border border-white shadow-sm"
                  style={{ backgroundColor: RIDE_MAP_COLORS[status].trip }}
                />
                <span className="opacity-80">{status} route</span>
              </span>
            ))}
            <span className="flex items-center gap-1.5 opacity-80">
              <span className="inline-block h-1 w-6 rounded bg-[#2563eb]" />
              Driver leg (roads)
            </span>
            {routesLoading && (
              <span className="text-[#9d3733] opacity-80">Updating driving routes…</span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#9d3733] text-[10px] text-white">
                D
              </span>
              Driver
            </span>
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white">
                P
              </span>
              Pickup
            </span>
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[10px] text-white ring-2 ring-sky-300">
                R
              </span>
              Active rider
            </span>
          </div>
          {drivers.length === 0 && activeRides.length === 0 && !busy && (
            <p className="mt-4 text-center text-sm opacity-70">
              No active rides or online drivers. Trips and driver positions appear here in real time.
            </p>
          )}
          {lastLiveAt && liveConnected && (
            <p className="mt-3 text-center text-xs opacity-60">
              Last movement {new Date(lastLiveAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {activeRides.length > 0 && (
        <div className={cardClass}>
          <h3 className="font-accent text-lg font-bold">Active riders & trips</h3>
          <p className="mt-1 text-sm opacity-80">
            Click a rider to focus the map, or export a PNG snapshot of their trip on the map.
          </p>
          <ul className="mt-3 space-y-2">
            {activeRides.map((ride) => {
              const c = RIDE_MAP_COLORS[ride.status] ?? RIDE_MAP_COLORS.REQUESTED
              const selected = selectedRideId === ride.id
              return (
                <li
                  key={ride.id}
                  className={`rounded-xl border px-3 py-2.5 text-sm transition ${
                    selected
                      ? 'border-[#9d3733] bg-[#9d3733]/5 ring-2 ring-[#9d3733]/30'
                      : darkMode
                        ? 'border-[#9d3733]/30'
                        : 'border-[#9d3733]/20'
                  }`}
                  style={{ borderLeftWidth: 4, borderLeftColor: c.trip }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => focusRide(ride)}
                      className="font-bold hover:underline"
                      style={{ color: c.trip }}
                    >
                      {ride.status}
                    </button>
                    {ride.fareEstimate != null && (
                      <span className="text-xs font-semibold">${Number(ride.fareEstimate).toFixed(2)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => focusRide(ride)}
                    className="mt-1 flex w-full items-center gap-2 text-left font-medium text-sky-700 hover:underline"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-white">
                      {ride.rider?.name?.[0]?.toUpperCase() ?? 'R'}
                    </span>
                    {ride.rider?.name ?? 'Rider'}
                  </button>
                  <p className="text-xs opacity-80">
                    {ride.driver?.name ? `Driver: ${ride.driver.name}` : 'Waiting for driver'}
                  </p>
                  <p className="mt-1 text-xs">
                    <span className="text-amber-700">P</span> {ride.pickupAddress}
                  </p>
                  <p className="text-xs">
                    <span className="text-amber-900">D</span> {ride.dropoffAddress}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => focusRide(ride)}
                      className="rounded-lg border border-[#9d3733]/50 px-3 py-1.5 text-xs font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10"
                    >
                      View on map
                    </button>
                    <button
                      type="button"
                      disabled={exportBusy}
                      onClick={() => exportRideSnapshot(ride)}
                      className="rounded-lg bg-[#9d3733] px-3 py-1.5 text-xs font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:opacity-50"
                    >
                      {exportBusy && selected ? 'Exporting…' : 'Export snapshot'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {drivers.length > 0 && (
        <div className={cardClass}>
          <h3 className="font-accent text-lg font-bold">Online drivers</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {drivers.map((d) => (
              <li key={d.userId}>
                <button
                  type="button"
                  onClick={() => onViewDriver(d.userId)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition hover:border-[#9d3733]/50 hover:bg-[#9d3733]/5 ${
                    darkMode ? 'border-[#9d3733]/30' : 'border-[#9d3733]/20'
                  }`}
                >
                  <p className="font-bold text-[#9d3733]">{d.name}</p>
                  <p className="text-xs opacity-80">
                    {d.vehicleColor} {d.vehicleMake} · {d.licensePlate}
                  </p>
                  <p className="mt-1 font-mono text-[10px] opacity-60">
                    {d.lat.toFixed(5)}, {d.lng.toFixed(5)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
