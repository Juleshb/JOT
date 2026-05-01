import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import DriverTurnBanner from '../components/DriverTurnBanner'
import MapViewControls from '../components/MapViewControls'
import {
  cancelNavigationSpeech,
  formatDistanceSpoken,
  haversineMeters,
  isNavigationSpeechEnabled,
  parseRouteStepsFromDirections,
  playNavigationCue,
  setNavigationSpeechEnabled,
  speakNavigation,
} from '../lib/navigationGuidance'
import { addTrafficToMap, removeTrafficFromMap } from '../lib/mapTraffic'
import { getBasemapStyleUrl } from '../lib/mapStyles'
import { openGoogleStreetView } from '../lib/streetView'
import mapboxgl from 'mapbox-gl'
import { io } from 'socket.io-client'
import {
  acceptRide,
  completeRide,
  startRide,
  updateDriverStatus,
} from '../lib/api'

/** @param {GeolocationPositionError | { code?: number; message?: string } | null | undefined} err */
function friendlyGeolocationError(err) {
  if (err == null) {
    return 'Location could not be determined. Use HTTPS (or localhost), and allow location when the browser asks.'
  }
  const code = typeof err.code === 'number' ? err.code : null
  if (code === 1) {
    return 'Location is blocked. Use your browser’s site settings to allow location for this page, then tap Go online again.'
  }
  if (code === 2) {
    return 'Could not get a position fix (common on some laptops). Enable Wi‑Fi/location for your system, or try again— we also fall back to network-based location when you go online.'
  }
  if (code === 3) {
    return 'Location timed out. Check your connection and tap Go online again.'
  }
  const msg = typeof err.message === 'string' ? err.message : ''
  if (/secure origin|only supported/i.test(msg)) {
    return 'Location needs a secure origin. Use https:// or http://localhost for development.'
  }
  return msg || 'Location could not be determined. Try again or use a phone with GPS.'
}

function getCurrentPositionWithFallback() {
  const attempt = (highAccuracy) =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? 12_000 : 20_000,
        maximumAge: highAccuracy ? 0 : 120_000,
      })
    })
  return attempt(true).catch(() => attempt(false))
}

/** Shorten long addresses for text-to-speech. */
function speechSnippet(text, maxLen = 80) {
  if (!text || typeof text !== 'string') return ''
  const x = text.replace(/\s+/g, ' ').trim()
  if (x.length <= maxLen) return x
  return `${x.slice(0, maxLen - 1)}…`
}

/** Initial bearing from true north (degrees clockwise) between two WGS84 points. */
function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lng2 - lng1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = Math.atan2(y, x)
  return ((θ * 180) / Math.PI + 360) % 360
}

function lerpAngleDeg(from, to, t) {
  const d = ((to - from + 540) % 360) - 180
  let x = from + d * t
  x %= 360
  if (x < 0) x += 360
  return x
}

export default function DriverPage({
  darkMode,
  authUser,
  authToken,
  mapboxAccessToken,
  dashboardBusy,
  dashboardMessage,
  activeRide,
  rideHistory,
  fetchRideDashboard,
  navigateToPage,
  setAuthUser,
}) {
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusNote, setStatusNote] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [offerId, setOfferId] = useState('')
  const [offerPopup, setOfferPopup] = useState(null)
  const offerPopupRef = useRef(null)
  const [liveLocation, setLiveLocation] = useState(null)
  const [mapWebGlError, setMapWebGlError] = useState(null)
  const [driverBasemapMode, setDriverBasemapMode] = useState('transit')
  const [driverTrafficOn, setDriverTrafficOn] = useState(true)
  const [driverSheetOpen, setDriverSheetOpen] = useState(false)
  const [driverMenuOpen, setDriverMenuOpen] = useState(false)
  const [navigationSteps, setNavigationSteps] = useState([])
  const [driverNavUi, setDriverNavUi] = useState(null)
  const [driverNavVoiceMuted, setDriverNavVoiceMuted] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('jo-driver-nav-voice-muted') === '1'
    } catch {
      return false
    }
  })

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const driverMarkerRef = useRef(null)
  const routeSourceIdRef = useRef('driver-pickup-route-source')
  const routeLayerIdRef = useRef('driver-pickup-route-layer')
  const plannedRouteSourceIdRef = useRef('driver-planned-trip-route-source')
  const plannedRouteLayerIdRef = useRef('driver-planned-trip-route-layer')
  const liveLocationRef = useRef(null)
  const driverBasemapModeRef = useRef(driverBasemapMode)
  const driverTrafficOnRef = useRef(driverTrafficOn)
  const driverMainSocketRef = useRef(null)
  const lastDriverSocketLocationEmitRef = useRef(0)
  const isOnlineRef = useRef(false)
  const popupTimerRef = useRef(null)
  const navStepIndexRef = useRef(0)
  const nearSpokenForStepRef = useRef(new Set())
  const routeFetchMetaRef = useRef({ rideKey: '', lastAt: 0 })
  const routeThrottleTimerRef = useRef(null)
  const prevNavRideIdRef = useRef(null)
  const navStepsSigRef = useRef('')
  const prevGeoForBearingRef = useRef(null)
  const smoothedBearingRef = useRef(0)

  const profile = authUser?.driverProfile
  const isApproved = profile?.verificationStatus === 'APPROVED'
  const isOnline = Boolean(profile?.isOnline)
  const fullMapMode =
    isApproved && isOnline && Boolean(mapboxAccessToken) && !mapWebGlError

  driverBasemapModeRef.current = driverBasemapMode
  driverTrafficOnRef.current = driverTrafficOn
  isOnlineRef.current = isOnline
  liveLocationRef.current = liveLocation
  offerPopupRef.current = offerPopup

  useLayoutEffect(() => {
    setNavigationSpeechEnabled(!driverNavVoiceMuted)
    if (driverNavVoiceMuted) {
      cancelNavigationSpeech()
    }
  }, [driverNavVoiceMuted])

  useEffect(() => {
    try {
      window.localStorage.setItem('jo-driver-nav-voice-muted', driverNavVoiceMuted ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }, [driverNavVoiceMuted])

  const shellClass = `min-h-[calc(100dvh-5rem)] px-6 pb-16 pt-24 md:pt-28 ${
    darkMode ? 'bg-[#0a0a0a] text-[#f2e3bb]' : 'bg-[#fffbf5] text-[#2d100f]'
  }`

  const cardClass = `rounded-2xl border p-6 ${
    darkMode ? 'border-[#9d3733]/40 bg-[#111]' : 'border-[#9d3733]/30 bg-[#fff8eb]'
  }`

  const mergeProfile = useCallback(
    (nextProfile) => {
      setAuthUser((prev) => {
        if (!prev) return prev
        const merged = {
          ...prev,
          driverProfile: { ...prev.driverProfile, ...nextProfile },
        }
        localStorage.setItem('jo-auth-user', JSON.stringify(merged))
        return merged
      })
    },
    [setAuthUser],
  )

  useEffect(() => {
    if (!isOnline) {
      setLiveLocation(null)
      return
    }
    if (profile?.currentLat != null && profile?.currentLng != null) {
      setLiveLocation((prev) => prev ?? { lat: profile.currentLat, lng: profile.currentLng })
    }
  }, [isOnline, profile?.currentLat, profile?.currentLng])

  useEffect(() => {
    if (!isOnline || !isApproved || !navigator.geolocation) {
      return undefined
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        setStatusNote('')
      },
      (err) => {
        setStatusNote(friendlyGeolocationError(err))
      },
      { enableHighAccuracy: false, maximumAge: 10_000, timeout: 25_000 },
    )
    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [isOnline, isApproved])

  useEffect(() => {
    if (!isOnline || !isApproved || !authToken) {
      return undefined
    }
    const id = window.setInterval(async () => {
      const loc = liveLocationRef.current
      if (!loc) return
      try {
        const updated = await updateDriverStatus(authToken, {
          isOnline: true,
          lat: loc.lat,
          lng: loc.lng,
        })
        mergeProfile(updated)
      } catch {
        /* ignore transient network errors */
      }
    }, 12000)
    return () => window.clearInterval(id)
  }, [isOnline, isApproved, authToken, mergeProfile])

  useEffect(() => {
    if (!isOnline || !isApproved || !mapboxAccessToken) {
      return undefined
    }

    const container = mapContainerRef.current
    if (!container) {
      return undefined
    }

    setMapWebGlError(null)

    if (typeof mapboxgl.supported === 'function') {
      try {
        if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
          setMapWebGlError(
            'This browser cannot use the map (WebGL unavailable). Try another browser or enable hardware acceleration.',
          )
          return undefined
        }
      } catch {
        /* continue */
      }
    }

    const centerFromProfile =
      profile?.currentLng != null && profile?.currentLat != null
        ? { lat: profile.currentLat, lng: profile.currentLng }
        : null
    const start = liveLocationRef.current ?? centerFromProfile
    const centerLng = start?.lng ?? 30.0619
    const centerLat = start?.lat ?? -1.9441

    let map
    try {
      mapboxgl.accessToken = mapboxAccessToken
      map = new mapboxgl.Map({
        container,
        style: getBasemapStyleUrl(driverBasemapMode, darkMode),
        center: [centerLng, centerLat],
        zoom: 14.5,
        attributionControl: false,
        failIfMajorPerformanceCaveat: false,
      })
    } catch (err) {
      console.error(err)
      setMapWebGlError(
        'The map failed to start. Try another browser or disable battery saver.',
      )
      return undefined
    }

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'top-left')
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')

    const marker = new mapboxgl.Marker({ color: '#9d3733' }).setLngLat([centerLng, centerLat]).addTo(map)

    mapRef.current = map
    driverMarkerRef.current = marker

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
      if (driverTrafficOnRef.current) {
        addTrafficToMap(map)
      }
    })

    return () => {
      window.removeEventListener('resize', onResize)
      try {
        map.remove()
      } catch {
        /* ignore */
      }
      mapRef.current = null
      driverMarkerRef.current = null
    }
  }, [isOnline, isApproved, mapboxAccessToken, darkMode, driverBasemapMode])

  useEffect(() => {
    if (!mapRef.current || !isOnline || !isApproved) return
    const map = mapRef.current
    const applyTraffic = () => {
      if (driverTrafficOn) addTrafficToMap(map)
      else removeTrafficFromMap(map)
    }
    if (map.isStyleLoaded()) {
      applyTraffic()
    } else {
      map.once('style.load', applyTraffic)
    }
  }, [driverTrafficOn, isOnline, isApproved])

  useEffect(() => {
    const map = mapRef.current
    const marker = driverMarkerRef.current
    if (!map || !marker || !liveLocation) return

    marker.setLngLat([liveLocation.lng, liveLocation.lat])
    if (!map.isStyleLoaded()) return

    const turnByNav = fullMapMode
    const speed = liveLocation.speed
    const deviceHeading = liveLocation.heading
    const prev = prevGeoForBearingRef.current

    let targetBearing = null
    if (deviceHeading != null && (speed == null || speed > 0.35)) {
      targetBearing = deviceHeading
    } else if (prev) {
      const moved = haversineMeters(prev.lat, prev.lng, liveLocation.lat, liveLocation.lng)
      if (moved >= 4) {
        targetBearing = bearingDeg(prev.lat, prev.lng, liveLocation.lat, liveLocation.lng)
      }
    }

    prevGeoForBearingRef.current = { lat: liveLocation.lat, lng: liveLocation.lng }

    if (!turnByNav) {
      smoothedBearingRef.current = 0
      try {
        map.easeTo({
          center: [liveLocation.lng, liveLocation.lat],
          bearing: 0,
          pitch: 0,
          duration: 550,
        })
      } catch {
        /* ignore */
      }
      return
    }

    let bearing = smoothedBearingRef.current
    let pitch = 0
    if (targetBearing != null) {
      bearing = lerpAngleDeg(smoothedBearingRef.current, targetBearing, 0.2)
      smoothedBearingRef.current = bearing
      const moving = speed == null || speed > 0.8
      pitch = moving ? 42 : 18
    }

    try {
      map.easeTo({
        center: [liveLocation.lng, liveLocation.lat],
        bearing,
        pitch,
        duration: 520,
      })
    } catch {
      /* ignore */
    }
  }, [liveLocation, fullMapMode])

  useEffect(() => {
    if (!fullMapMode || !mapRef.current) return undefined
    const map = mapRef.current
    const run = () => {
      try {
        map.resize()
      } catch {
        /* ignore */
      }
    }
    run()
    const t = window.setTimeout(run, 320)
    window.addEventListener('resize', run)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', run)
    }
  }, [fullMapMode, driverSheetOpen])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapboxAccessToken || !activeRide || !liveLocation) return undefined

    const shouldShowTripRoute = ['ACCEPTED', 'STARTED'].includes(activeRide.status)
    if (!shouldShowTripRoute) {
      setNavigationSteps([])
      setDriverNavUi(null)
      navStepIndexRef.current = 0
      nearSpokenForStepRef.current.clear()
      navStepsSigRef.current = ''
      cancelNavigationSpeech()
      const src = map.getSource(routeSourceIdRef.current)
      if (src) {
        src.setData({ type: 'FeatureCollection', features: [] })
      }
      return undefined
    }

    const rideKey = `${activeRide.id}|${activeRide.status}|${activeRide.pickupLat.toFixed(5)},${activeRide.pickupLng.toFixed(5)}|${activeRide.dropoffLat.toFixed(5)},${activeRide.dropoffLng.toFixed(5)}`
    let cancelled = false

    const clearThrottle = () => {
      if (routeThrottleTimerRef.current != null) {
        window.clearTimeout(routeThrottleTimerRef.current)
        routeThrottleTimerRef.current = null
      }
    }

    const runFetch = async () => {
      if (cancelled || !mapRef.current) return
      const loc = liveLocationRef.current
      if (!loc) return

      try {
        const from = `${loc.lng},${loc.lat}`
        const routeTarget =
          activeRide.status === 'STARTED'
            ? `${activeRide.dropoffLng},${activeRide.dropoffLat}`
            : `${activeRide.pickupLng},${activeRide.pickupLat}`
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from};${routeTarget}?geometries=geojson&overview=full&steps=true&voice_instructions=true&alternatives=false&access_token=${mapboxAccessToken}`

        const response = await fetch(url)
        if (!response.ok || cancelled) return
        const data = await response.json()
        if (cancelled) return

        const steps = parseRouteStepsFromDirections(data)
        setNavigationSteps(steps)

        const coords = data?.routes?.[0]?.geometry?.coordinates
        if (!Array.isArray(coords) || coords.length < 2) return

        const mapNow = mapRef.current
        if (!mapNow) return

        const featureCollection = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: coords,
              },
            },
          ],
        }

        const ensureLayer = () => {
          if (!mapNow.getSource(routeSourceIdRef.current)) {
            mapNow.addSource(routeSourceIdRef.current, {
              type: 'geojson',
              data: featureCollection,
            })
          } else {
            mapNow.getSource(routeSourceIdRef.current).setData(featureCollection)
          }

          if (!mapNow.getLayer(routeLayerIdRef.current)) {
            mapNow.addLayer({
              id: routeLayerIdRef.current,
              type: 'line',
              source: routeSourceIdRef.current,
              layout: {
                'line-cap': 'round',
                'line-join': 'round',
              },
              paint: {
                'line-color': '#9d3733',
                'line-width': 5,
                'line-opacity': 0.95,
              },
            })
          }
          if (
            mapNow.getLayer(plannedRouteLayerIdRef.current) &&
            mapNow.getLayer(routeLayerIdRef.current)
          ) {
            try {
              mapNow.moveLayer(plannedRouteLayerIdRef.current, routeLayerIdRef.current)
            } catch {
              /* ignore */
            }
          }
        }

        if (mapNow.isStyleLoaded()) {
          ensureLayer()
        } else {
          mapNow.once('style.load', ensureLayer)
        }

        routeFetchMetaRef.current = { rideKey, lastAt: Date.now() }
      } catch {
        /* ignore transient routing errors */
      }
    }

    const meta = routeFetchMetaRef.current
    if (meta.rideKey !== rideKey) {
      routeFetchMetaRef.current = { rideKey, lastAt: 0 }
      clearThrottle()
      void runFetch()
    } else {
      const elapsed = Date.now() - meta.lastAt
      if (elapsed >= 7500) {
        clearThrottle()
        void runFetch()
      } else {
        clearThrottle()
        routeThrottleTimerRef.current = window.setTimeout(() => {
          routeThrottleTimerRef.current = null
          void runFetch()
        }, 7500 - elapsed)
      }
    }

    return () => {
      cancelled = true
      clearThrottle()
    }
  }, [activeRide, liveLocation, mapboxAccessToken])

  /** Full trip preview (pickup → dropoff) while navigating to pickup; voice still follows driver → pickup. */
  useEffect(() => {
    const emptyFc = { type: 'FeatureCollection', features: [] }
    const map = mapRef.current

    const clearPlanned = () => {
      const m = mapRef.current
      if (!m?.getSource(plannedRouteSourceIdRef.current)) return
      try {
        m.getSource(plannedRouteSourceIdRef.current).setData(emptyFc)
      } catch {
        /* style swap / teardown */
      }
    }

    if (
      !map ||
      !mapboxAccessToken ||
      !activeRide ||
      activeRide.status !== 'ACCEPTED' ||
      !isOnline ||
      !isApproved
    ) {
      clearPlanned()
      return undefined
    }

    const { pickupLng, pickupLat, dropoffLng, dropoffLat } = activeRide
    if (
      typeof pickupLng !== 'number' ||
      typeof pickupLat !== 'number' ||
      typeof dropoffLng !== 'number' ||
      typeof dropoffLat !== 'number'
    ) {
      clearPlanned()
      return undefined
    }

    let cancelled = false
    const srcId = plannedRouteSourceIdRef.current
    const lyrId = plannedRouteLayerIdRef.current

    const run = async () => {
      try {
        const coordPath = `${pickupLng},${pickupLat};${dropoffLng},${dropoffLat}`
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordPath}?geometries=geojson&overview=full&steps=false&alternatives=false&access_token=${mapboxAccessToken}`
        const response = await fetch(url)
        if (!response.ok || cancelled) return
        const data = await response.json()
        if (cancelled) return
        const coords = data?.routes?.[0]?.geometry?.coordinates
        if (!Array.isArray(coords) || coords.length < 2) return

        const mapNow = mapRef.current
        if (!mapNow) return

        const featureCollection = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: coords },
            },
          ],
        }

        const ensure = () => {
          if (!mapNow.getSource(srcId)) {
            mapNow.addSource(srcId, { type: 'geojson', data: featureCollection })
          } else {
            mapNow.getSource(srcId).setData(featureCollection)
          }
          if (!mapNow.getLayer(lyrId)) {
            mapNow.addLayer({
              id: lyrId,
              type: 'line',
              source: srcId,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': '#475569',
                'line-width': 4,
                'line-opacity': 0.55,
                'line-dasharray': [1, 2],
              },
            })
          }
          if (mapNow.getLayer(routeLayerIdRef.current) && mapNow.getLayer(lyrId)) {
            mapNow.moveLayer(lyrId, routeLayerIdRef.current)
          }
        }

        if (mapNow.isStyleLoaded()) {
          ensure()
        } else {
          mapNow.once('style.load', ensure)
        }
      } catch {
        /* ignore */
      }
    }

    void run()
    return () => {
      cancelled = true
      clearPlanned()
    }
  }, [
    activeRide?.id,
    activeRide?.status,
    activeRide?.pickupLat,
    activeRide?.pickupLng,
    activeRide?.dropoffLat,
    activeRide?.dropoffLng,
    mapboxAccessToken,
    isOnline,
    isApproved,
    darkMode,
    driverBasemapMode,
  ])

  useEffect(() => {
    if (prevNavRideIdRef.current !== activeRide?.id) {
      prevNavRideIdRef.current = activeRide?.id ?? null
      setNavigationSteps([])
      setDriverNavUi(null)
      navStepIndexRef.current = 0
      nearSpokenForStepRef.current.clear()
      navStepsSigRef.current = ''
      cancelNavigationSpeech()
    }
  }, [activeRide?.id])

  useEffect(() => {
    if (
      !liveLocation ||
      navigationSteps.length === 0 ||
      !activeRide ||
      !['ACCEPTED', 'STARTED'].includes(activeRide.status)
    ) {
      setDriverNavUi(null)
      return
    }

    const stepsSig = `${activeRide.id}|${navigationSteps.length}|${navigationSteps[0]?.instruction ?? ''}`
    let skipStepAdvanceVoice = false
    if (stepsSig !== navStepsSigRef.current) {
      navStepsSigRef.current = stepsSig
      navStepIndexRef.current = 0
      nearSpokenForStepRef.current.clear()
      const step0 = navigationSteps[0]
      if (step0) {
        playNavigationCue()
        const dist0 =
          step0.lat != null && step0.lng != null
            ? haversineMeters(liveLocation.lat, liveLocation.lng, step0.lat, step0.lng)
            : null
        const distSpoken = dist0 != null ? formatDistanceSpoken(Math.max(20, Math.round(dist0))) : ''
        speakNavigation(
          distSpoken ? `${step0.speakText}. In ${distSpoken}.` : `${step0.speakText}.`,
        )
        skipStepAdvanceVoice = true
      }
    }

    let idx = navStepIndexRef.current

    while (idx < navigationSteps.length - 1) {
      const s = navigationSteps[idx]
      if (s?.lat == null || s?.lng == null) {
        idx += 1
        continue
      }
      const d = haversineMeters(liveLocation.lat, liveLocation.lng, s.lat, s.lng)
      if (d < 22) idx += 1
      else break
    }

    const idxChanged = idx !== navStepIndexRef.current
    if (idxChanged && !skipStepAdvanceVoice) {
      navStepIndexRef.current = idx
      playNavigationCue()
      const step = navigationSteps[idx]
      const dist =
        step?.lat != null && step?.lng != null
          ? haversineMeters(liveLocation.lat, liveLocation.lng, step.lat, step.lng)
          : null
      nearSpokenForStepRef.current.delete(idx)
      const distSpoken = dist != null ? formatDistanceSpoken(Math.max(20, Math.round(dist))) : ''
      speakNavigation(
        distSpoken ? `${step.speakText}. In ${distSpoken}.` : `${step.speakText}.`,
      )
    } else if (idxChanged) {
      navStepIndexRef.current = idx
      nearSpokenForStepRef.current.delete(idx)
    }

    const step = navigationSteps[Math.min(navStepIndexRef.current, navigationSteps.length - 1)]
    if (!step) {
      setDriverNavUi(null)
      return
    }

    const dist =
      step.lat != null && step.lng != null
        ? haversineMeters(liveLocation.lat, liveLocation.lng, step.lat, step.lng)
        : null

    setDriverNavUi({
      instruction: step.instruction,
      distanceM: dist,
      maneuverKind: step.maneuverKind,
      phase: activeRide.status === 'STARTED' ? 'dropoff' : 'pickup',
    })

    if (
      !idxChanged &&
      !skipStepAdvanceVoice &&
      dist != null &&
      dist < 72 &&
      !nearSpokenForStepRef.current.has(navStepIndexRef.current)
    ) {
      nearSpokenForStepRef.current.add(navStepIndexRef.current)
      speakNavigation(`Now, ${step.speakText}`)
    }
  }, [liveLocation, navigationSteps, activeRide?.status, activeRide?.id])

  const toggleOnline = async (next) => {
    if (!authToken) return
    setStatusBusy(true)
    setStatusNote('')
    try {
      if (next) {
        if (!navigator.geolocation) {
          setStatusNote('This browser does not expose location. Try Chrome or Safari.')
          return
        }
        const pos = await getCurrentPositionWithFallback()
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const updated = await updateDriverStatus(authToken, {
          isOnline: true,
          lat,
          lng,
        })
        mergeProfile(updated)
        setLiveLocation({ lat, lng, heading: null, speed: null })
      } else {
        setStatusNote('')
        const updated = await updateDriverStatus(authToken, { isOnline: false })
        mergeProfile(updated)
        setLiveLocation(null)
        setMapWebGlError(null)
      }
    } catch (e) {
      if (e != null && typeof e.code === 'number') {
        setStatusNote(friendlyGeolocationError(e))
      } else {
        setStatusNote(e.message || 'Could not update online status.')
      }
    } finally {
      setStatusBusy(false)
    }
  }

  const onAcceptOffer = async () => {
    const id = offerId.trim()
    if (!id) return
    setActionBusy(true)
    setStatusNote('')
    try {
      await acceptRide(authToken, id)
      setOfferId('')
      setOfferPopup(null)
      await fetchRideDashboard()
    } catch (e) {
      setStatusNote(e.message || 'Could not accept ride.')
    } finally {
      setActionBusy(false)
    }
  }

  const onAcceptOfferById = async (rideId) => {
    const id = rideId?.trim()
    if (!authToken || !id) return
    setActionBusy(true)
    setStatusNote('')
    try {
      await acceptRide(authToken, id)
      setOfferId('')
      setOfferPopup(null)
      await fetchRideDashboard()
    } catch (e) {
      setStatusNote(e.message || 'Could not accept ride.')
    } finally {
      setActionBusy(false)
    }
  }

  useEffect(() => {
    if (!authToken || authUser?.role !== 'DRIVER') return undefined

    const socket = io(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000', {
      auth: { token: authToken },
      transports: ['websocket'],
    })
    driverMainSocketRef.current = socket

    socket.on('connect', () => {
      const loc = liveLocationRef.current
      if (loc && isOnlineRef.current) {
        socket.emit('driver:location', { lat: loc.lat, lng: loc.lng })
      }
    })

    socket.on('ride:offer', (payload) => {
      if (!payload?.rideId) return
      const sameRideRefresh = offerPopupRef.current?.rideId === payload.rideId
      setOfferPopup((prev) => (prev?.rideId === payload.rideId ? { ...prev, ...payload } : payload))
      setOfferId(payload.rideId)

      if (sameRideRefresh || payload.updated === true) {
        return
      }

      if (!isNavigationSpeechEnabled()) return

      // Subtle short alert tone for a new request (same mute as navigation / voice).
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = 880
          gain.gain.value = 0.0001
          osc.connect(gain)
          gain.connect(ctx.destination)
          const now = ctx.currentTime
          gain.gain.exponentialRampToValueAtTime(0.035, now + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
          osc.start(now)
          osc.stop(now + 0.23)
          window.setTimeout(() => {
            void ctx.close()
          }, 300)
        }
      } catch {
        /* Ignore audio errors caused by browser autoplay policies. */
      }

      const riderLabel = (payload.riderName && String(payload.riderName).trim()) || 'a rider'
      const pickup = speechSnippet(payload.pickupAddress ? String(payload.pickupAddress) : '')
      const drop = speechSnippet(payload.dropoffAddress ? String(payload.dropoffAddress) : '')
      const fare =
        payload.fareEstimate != null && Number.isFinite(Number(payload.fareEstimate))
          ? ` Estimated fare about ${Number(payload.fareEstimate)}.`
          : ''
      const wherePickup = pickup ? ` Pickup at ${pickup}.` : ''
      const whereDrop = drop ? ` Going to ${drop}.` : ''
      speakNavigation(
        `New ride request from ${riderLabel}.${wherePickup}${whereDrop}${fare} Tap accept in the app when you are ready.`,
      )
    })

    socket.on('ride:offer_update', (payload) => {
      if (!payload?.rideId) return
      setOfferPopup((prev) => (prev?.rideId === payload.rideId ? { ...prev, ...payload } : prev))
    })

    return () => {
      driverMainSocketRef.current = null
      socket.disconnect()
    }
  }, [authToken, authUser?.role])

  useEffect(() => {
    if (!isOnline || !liveLocation) return undefined
    const socket = driverMainSocketRef.current
    if (!socket?.connected) return undefined
    const now = Date.now()
    if (now - lastDriverSocketLocationEmitRef.current < 2000) return undefined
    lastDriverSocketLocationEmitRef.current = now
    socket.emit('driver:location', { lat: liveLocation.lat, lng: liveLocation.lng })
  }, [isOnline, liveLocation])

  useEffect(() => {
    if (popupTimerRef.current) {
      window.clearTimeout(popupTimerRef.current)
      popupTimerRef.current = null
    }

    if (!offerPopup) return undefined

    popupTimerRef.current = window.setTimeout(() => {
      setOfferPopup(null)
    }, 120000)

    return () => {
      if (popupTimerRef.current) {
        window.clearTimeout(popupTimerRef.current)
        popupTimerRef.current = null
      }
    }
  }, [offerPopup])

  const onStartTrip = async () => {
    if (!authToken || !activeRide?.id) return
    setActionBusy(true)
    setStatusNote('')
    try {
      await startRide(authToken, activeRide.id)
      await fetchRideDashboard()
    } catch (e) {
      setStatusNote(e.message || 'Could not start trip.')
    } finally {
      setActionBusy(false)
    }
  }

  const onCompleteTrip = async () => {
    if (!authToken || !activeRide?.id) return
    setActionBusy(true)
    setStatusNote('')
    try {
      await completeRide(authToken, activeRide.id, {})
      await fetchRideDashboard()
    } catch (e) {
      setStatusNote(e.message || 'Could not complete trip.')
    } finally {
      setActionBusy(false)
    }
  }

  if (!authUser) {
    return (
      <div className={shellClass}>
        <div className={`mx-auto max-w-lg ${cardClass}`}>
          <h1 className="font-brand text-2xl font-bold">Driver</h1>
          <p className="mt-3 text-sm opacity-90">Sign in to open your driver dashboard.</p>
          <button
            type="button"
            onClick={() => navigateToPage('home')}
            className="mt-6 rounded-lg border border-[#9d3733]/50 px-4 py-2 text-sm font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10"
          >
            Back to home
          </button>
        </div>
      </div>
    )
  }

  if (authUser.role !== 'DRIVER') {
    return (
      <div className={shellClass}>
        <div className={`mx-auto max-w-lg ${cardClass}`}>
          <h1 className="font-brand text-2xl font-bold">Driver area</h1>
          <p className="mt-3 text-sm opacity-90">
            This dashboard is for driver accounts. Your role is {authUser.role}. Book trips from the
            rider experience instead.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigateToPage('rider')}
              className="rounded-lg bg-[#9d3733] px-4 py-2 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
            >
              Book a ride
            </button>
            <button
              type="button"
              onClick={() => navigateToPage('home')}
              className="rounded-lg border border-[#9d3733]/50 px-4 py-2 text-sm font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className={shellClass}>
        <div className={`mx-auto max-w-lg ${cardClass}`}>
          <h1 className="font-brand text-2xl font-bold">Driver profile</h1>
          <p className="mt-3 text-sm opacity-90">
            No driver profile is linked to this account yet. Register as a driver through the API or
            mobile app to receive trips.
          </p>
          <button
            type="button"
            onClick={() => navigateToPage('home')}
            className="mt-6 rounded-lg border border-[#9d3733]/50 px-4 py-2 text-sm font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10"
          >
            Back to home
          </button>
        </div>
      </div>
    )
  }

  const mapPlaceholderClass = `flex min-h-[min(52vh,440px)] w-full flex-col items-center justify-center rounded-2xl border px-4 text-center text-sm ${
    darkMode ? 'border-[#9d3733]/35 bg-[#111]/80' : 'border-[#9d3733]/25 bg-[#fff8eb]/90'
  }`

  const sheetSurface = darkMode
    ? 'border-[#9d3733]/40 bg-[#0a0a0a] text-[#f2e3bb]'
    : 'border-[#9d3733]/25 bg-[#fff8eb] text-[#2d100f]'

  const floatingBtn =
    'pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition active:scale-95 sm:h-12 sm:w-12'

  const routeChip =
    activeRide?.status === 'ACCEPTED'
      ? 'Navigating to Pickup'
      : activeRide?.status === 'STARTED'
        ? 'Trip in Progress to Dropoff'
        : null

  const driverToolsScrollContent = (
    <div className="space-y-4 px-4 pb-28 pt-2 sm:px-5">
      <div className={`rounded-2xl border p-4 ${sheetSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-accent text-base font-bold">Voice &amp; alerts</h2>
            <p className="mt-0.5 text-xs opacity-80 sm:text-sm">
              Mute turn-by-turn voice, chimes, and spoken new-ride alerts. Banners and popups stay on.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!driverNavVoiceMuted}
            aria-label={
              driverNavVoiceMuted
                ? 'Turn voice alerts on'
                : 'Mute voice navigation and new ride alerts'
            }
            onClick={() => setDriverNavVoiceMuted((m) => !m)}
            className={`relative h-[2.125rem] w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9d3733] focus-visible:ring-offset-2 ${
              darkMode ? 'focus-visible:ring-offset-black' : 'focus-visible:ring-offset-[#fff8eb]'
            } ${driverNavVoiceMuted ? 'bg-[#9d3733]/40' : 'bg-[#15803d]'}`}
          >
            <span
              className={`absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
                driverNavVoiceMuted ? 'translate-x-0.5' : 'translate-x-[1.375rem]'
              }`}
            />
          </button>
        </div>
      </div>

      <div className={`rounded-2xl border p-4 ${sheetSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-accent text-base font-bold">Availability</h2>
            <p className="text-xs opacity-80 sm:text-sm">
              Status:{' '}
              <span className="font-semibold text-[#9d3733]">
                {isApproved ? (isOnline ? 'Online' : 'Offline') : 'Pending verification'}
              </span>
            </p>
          </div>
          <button
            type="button"
            disabled={!isApproved || statusBusy}
            onClick={() => toggleOnline(!isOnline)}
            className={`rounded-full px-4 py-2 text-xs font-bold transition disabled:opacity-50 sm:text-sm ${
              isOnline
                ? 'bg-[#842f2b] text-[#f2e3bb] hover:bg-[#6f2724]'
                : 'bg-[#9d3733] text-[#f2e3bb] hover:bg-[#842f2b]'
            }`}
          >
            {statusBusy ? 'Updating…' : isOnline ? 'Go offline' : 'Go online'}
          </button>
        </div>
        {(statusNote || dashboardMessage) && (
          <p className="mt-3 text-xs text-[#9d3733] sm:text-sm">{statusNote || dashboardMessage}</p>
        )}
      </div>

      <div className={`rounded-2xl border p-4 ${sheetSurface}`}>
        <h2 className="font-accent text-base font-bold">Active trip</h2>
        {dashboardBusy ? (
          <p className="mt-2 text-xs opacity-80">Loading…</p>
        ) : activeRide ? (
          <div className="mt-2 space-y-2 text-xs sm:text-sm">
            <p>
              <span className="opacity-70">Rider:</span>{' '}
              <span className="font-semibold">{activeRide.rider?.name ?? '—'}</span>
            </p>
            <p>
              <span className="opacity-70">Status:</span>{' '}
              <span className="font-semibold text-[#9d3733]">{activeRide.status}</span>
            </p>
            <p>
              <span className="opacity-70">Pickup:</span> {activeRide.pickupAddress}
            </p>
            <p>
              <span className="opacity-70">Dropoff:</span> {activeRide.dropoffAddress}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {activeRide.status === 'ACCEPTED' && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={onStartTrip}
                  className="rounded-lg bg-[#9d3733] px-4 py-2 text-xs font-bold text-[#f2e3bb] disabled:opacity-50 sm:text-sm"
                >
                  Start trip
                </button>
              )}
              {activeRide.status === 'STARTED' && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={onCompleteTrip}
                  className="rounded-lg bg-[#9d3733] px-4 py-2 text-xs font-bold text-[#f2e3bb] disabled:opacity-50 sm:text-sm"
                >
                  Complete trip
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs opacity-80">No active trip.</p>
        )}
      </div>

      <div className={`rounded-2xl border p-4 ${sheetSurface}`}>
        <h2 className="font-accent text-base font-bold">Accept a ride by ID</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={offerId}
            onChange={(e) => setOfferId(e.target.value)}
            placeholder="Ride UUID"
            className={`flex-1 rounded-xl border px-3 py-2.5 text-xs outline-none sm:text-sm ${
              darkMode
                ? 'border-[#9d3733]/45 bg-black text-[#f2e3bb]'
                : 'border-[#9d3733]/30 bg-white text-[#2d100f]'
            }`}
          />
          <button
            type="button"
            disabled={actionBusy || !offerId.trim() || !isOnline || !isApproved}
            onClick={onAcceptOffer}
            className="rounded-xl bg-[#9d3733] px-4 py-2.5 text-xs font-bold text-[#f2e3bb] disabled:opacity-50 sm:text-sm"
          >
            {actionBusy ? 'Working…' : 'Accept'}
          </button>
        </div>
      </div>

      <div className={`rounded-2xl border p-4 ${sheetSurface}`}>
        <h2 className="font-accent text-base font-bold">Recent trips</h2>
        {dashboardBusy ? (
          <p className="mt-2 text-xs opacity-80">Loading…</p>
        ) : rideHistory.length === 0 ? (
          <p className="mt-2 text-xs opacity-80">No trips yet.</p>
        ) : (
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs sm:text-sm">
            {rideHistory.slice(0, 8).map((ride) => (
              <li
                key={ride.id}
                className={`rounded-lg border px-2 py-1.5 ${
                  darkMode ? 'border-[#9d3733]/30' : 'border-[#9d3733]/20'
                }`}
              >
                <span className="font-semibold text-[#9d3733]">{ride.status}</span>
                <span className="mx-1 opacity-40">·</span>
                {ride.pickupAddress} → {ride.dropoffAddress}
              </li>
            ))}
          </ul>
        )}
      </div>

      {isApproved && mapboxAccessToken ? (
        <div className={`rounded-2xl border p-4 ${sheetSurface}`}>
          <h2 className="font-accent mb-2 text-base font-bold">Map & layers</h2>
          <MapViewControls
            darkMode={darkMode}
            basemapMode={driverBasemapMode}
            onBasemapModeChange={setDriverBasemapMode}
            trafficOn={driverTrafficOn}
            onTrafficToggle={setDriverTrafficOn}
            onStreetView={() =>
              openGoogleStreetView(
                liveLocation?.lat ?? profile?.currentLat ?? -1.9441,
                liveLocation?.lng ?? profile?.currentLng ?? 30.0619,
              )
            }
            disabled={Boolean(mapWebGlError)}
            className="!flex-col !items-stretch"
          />
        </div>
      ) : null}

      {liveLocation && (
        <p className="px-1 font-mono text-[10px] opacity-70">
          GPS · {liveLocation.lat.toFixed(5)}, {liveLocation.lng.toFixed(5)}
        </p>
      )}
    </div>
  )

  return (
    <div className={fullMapMode ? `w-full ${darkMode ? 'bg-black' : 'bg-[#fffbf5]'}` : shellClass}>
      {offerPopup && (
        <div
          className={`fixed z-[125] w-[min(92vw,380px)] rounded-2xl border border-[#9d3733]/60 bg-[#111] p-4 text-[#f2e3bb] shadow-2xl shadow-black/40 ${
            fullMapMode
              ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 max-h-[38vh] -translate-x-1/2 overflow-y-auto sm:bottom-24'
              : 'right-4 top-20'
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9d3733]">
            New ride request
          </p>
          <p className="mt-1 text-sm font-bold">{offerPopup.riderName ?? 'Rider request'}</p>
          <p className="mt-1 text-xs opacity-90">From: {offerPopup.pickupAddress}</p>
          <p className="text-xs opacity-90">To: {offerPopup.dropoffAddress}</p>
          <p className="mt-1 text-xs opacity-80">
            Fare: {offerPopup.fareEstimate != null ? `$${offerPopup.fareEstimate}` : 'N/A'}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => onAcceptOfferById(offerPopup.rideId)}
              className="flex-1 rounded-lg bg-[#9d3733] px-3 py-2 text-xs font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:opacity-60"
            >
              {actionBusy ? 'Accepting…' : 'Accept now'}
            </button>
            <button
              type="button"
              onClick={() => setOfferPopup(null)}
              className="rounded-lg border border-[#9d3733]/50 px-3 py-2 text-xs font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {fullMapMode ? (
        <>
          <div className="relative mx-auto h-[calc(100dvh-5rem)] w-full max-w-[100vw] overflow-hidden lg:h-[min(88vh,820px)] lg:max-w-6xl lg:rounded-2xl lg:border lg:border-[#9d3733]/35 lg:shadow-2xl">
            <div ref={mapContainerRef} className="absolute inset-0 h-full w-full bg-neutral-900" />
            {routeChip ? (
              <div
                className={`pointer-events-none absolute left-3 top-3 z-10 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-md ${
                  darkMode
                    ? 'border-[#f2e3bb]/35 bg-black/80 text-[#f2e3bb]'
                    : 'border-[#9d3733]/30 bg-white/95 text-[#9d3733]'
                }`}
              >
                {routeChip}
              </div>
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <div
                className={`pointer-events-auto max-w-[55%] rounded-2xl border px-3 py-2 text-xs shadow-lg backdrop-blur-md sm:text-sm ${
                  darkMode
                    ? 'border-[#9d3733]/40 bg-black/75 text-[#f2e3bb]'
                    : 'border-[#9d3733]/25 bg-white/90 text-[#2d100f]'
                }`}
              >
                <p className="font-brand font-bold leading-tight">{authUser.name}</p>
                <p className="mt-0.5 text-[10px] opacity-80 sm:text-xs">
                  {profile.vehicleMake} {profile.vehicleModel} · {profile.licensePlate}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label="North up — recenter on my location"
                  onClick={() => {
                    const map = mapRef.current
                    const loc = liveLocationRef.current
                    if (map && loc) {
                      smoothedBearingRef.current = 0
                      prevGeoForBearingRef.current = null
                      map.easeTo({
                        center: [loc.lng, loc.lat],
                        zoom: 15,
                        bearing: 0,
                        pitch: 0,
                        duration: 600,
                      })
                    }
                  }}
                  className={`${floatingBtn} ${
                    darkMode
                      ? 'border-[#9d3733]/50 bg-black/80 text-[#f2e3bb]'
                      : 'border-[#9d3733]/35 bg-white/95 text-[#9d3733]'
                  }`}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => navigateToPage('home')}
                  className={`${floatingBtn} border-[#9d3733]/40 bg-[#9d3733] text-sm font-bold text-[#f2e3bb]`}
                >
                  Home
                </button>
              </div>
            </div>

            {driverNavUi ? (
              <div className="pointer-events-none absolute left-0 right-0 top-[max(4.75rem,env(safe-area-inset-top)+4rem)] z-[18] flex justify-center px-2">
                <DriverTurnBanner
                  darkMode={darkMode}
                  phase={driverNavUi.phase}
                  instruction={driverNavUi.instruction}
                  distanceM={driverNavUi.distanceM}
                  maneuverKind={driverNavUi.maneuverKind}
                />
              </div>
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center">
              <div className="pointer-events-auto w-full max-w-lg px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
                <div className="mb-3 flex justify-center">
                  <button
                    type="button"
                    disabled={!isApproved || statusBusy}
                    onClick={() => {
                      if (!isOnline) void toggleOnline(true)
                      else setDriverSheetOpen(true)
                    }}
                    className={`flex h-16 w-16 items-center justify-center rounded-full text-lg font-extrabold tracking-wide text-[#f2e3bb] shadow-xl shadow-black/30 transition active:scale-95 disabled:opacity-50 sm:h-[4.5rem] sm:w-[4.5rem] sm:text-xl ${
                      isOnline ? 'bg-[#15803d] ring-4 ring-[#15803d]/40' : 'bg-[#9d3733] ring-4 ring-[#9d3733]/35'
                    }`}
                  >
                    {isOnline ? '●' : 'GO'}
                  </button>
                </div>

                <div
                  className={`flex items-center gap-2 rounded-t-2xl border px-3 py-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md sm:px-4 ${
                    darkMode
                      ? 'border-[#9d3733]/40 bg-black/85 text-[#f2e3bb]'
                      : 'border-[#9d3733]/25 bg-white/95 text-[#2d100f]'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={driverSheetOpen ? 'Close tools' : 'Open trip tools'}
                    onClick={() => setDriverSheetOpen((o) => !o)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#9d3733]/35 text-[#9d3733] transition hover:bg-[#9d3733]/10"
                  >
                    <svg
                      className={`h-5 w-5 transition-transform ${driverSheetOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setDriverSheetOpen(true)}
                  >
                    <p className="text-sm font-bold leading-tight">
                      {isOnline ? "You're online" : 'Offline'}
                    </p>
                    <p className="text-[11px] opacity-75">
                      {isOnline
                        ? activeRide
                          ? `Trip · ${activeRide.status}`
                          : 'Live location · tap for tools'
                        : 'Tap GO or open tools to go online'}
                    </p>
                  </button>
                  <button
                    type="button"
                    aria-label="Quick menu"
                    onClick={() => {
                      setDriverMenuOpen(true)
                      setDriverSheetOpen(false)
                    }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#9d3733]/35 text-[#9d3733] transition hover:bg-[#9d3733]/10"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {driverSheetOpen ? (
            <div
              className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/45 backdrop-blur-[2px]"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setDriverSheetOpen(false)
              }}
            >
              <div
                className={`max-h-[min(78dvh,640px)] overflow-hidden rounded-t-3xl border-t-2 border-[#9d3733]/40 shadow-2xl ${
                  darkMode ? 'bg-[#0a0a0a]' : 'bg-[#fff8eb]'
                }`}
              >
                <div className="flex items-center justify-between border-b border-[#9d3733]/20 px-4 py-3">
                  <p className="font-brand text-lg font-bold text-[#9d3733]">Driver tools</p>
                  <button
                    type="button"
                    onClick={() => setDriverSheetOpen(false)}
                    className="rounded-lg p-2 text-xl leading-none opacity-70 hover:opacity-100"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <div className="max-h-[min(68dvh,560px)] overflow-y-auto overscroll-contain">
                  {driverToolsScrollContent}
                </div>
              </div>
            </div>
          ) : null}

          {driverMenuOpen ? (
            <div
              className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby="driver-menu-title"
            >
              <div
                className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
                  darkMode
                    ? 'border-[#9d3733]/45 bg-[#111] text-[#f2e3bb]'
                    : 'border-[#9d3733]/35 bg-white text-[#2d100f]'
                }`}
              >
                <h2 id="driver-menu-title" className="font-brand text-xl font-bold text-[#9d3733]">
                  Quick menu
                </h2>
                <p className="mt-2 text-sm opacity-80">
                  Map type, traffic, and street view. Full trip tools are in the bottom sheet (chevron).
                </p>
                {mapboxAccessToken ? (
                  <div className="mt-4">
                    <MapViewControls
                      darkMode={darkMode}
                      basemapMode={driverBasemapMode}
                      onBasemapModeChange={setDriverBasemapMode}
                      trafficOn={driverTrafficOn}
                      onTrafficToggle={setDriverTrafficOn}
                      onStreetView={() =>
                        openGoogleStreetView(
                          liveLocation?.lat ?? profile?.currentLat ?? -1.9441,
                          liveLocation?.lng ?? profile?.currentLng ?? 30.0619,
                        )
                      }
                      disabled={Boolean(mapWebGlError)}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDriverMenuOpen(false)}
                  className="mt-6 w-full rounded-xl border-2 border-[#9d3733]/50 py-3 text-sm font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10"
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-20 pt-2 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start lg:gap-8 lg:pb-16 lg:pt-0">
          <div className="order-2 flex flex-col gap-6 lg:order-1">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9d3733]">Driver</p>
                <h1 className="font-brand text-2xl font-bold sm:text-3xl">Welcome, {authUser.name}</h1>
                <p className="mt-1 text-sm opacity-80">
                  {profile.vehicleMake} {profile.vehicleModel} · {profile.licensePlate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateToPage('home')}
                className="rounded-lg border border-[#9d3733]/50 px-4 py-2 text-sm font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10"
              >
                Home
              </button>
            </div>

            {isApproved && !isOnline && (
              <div className="flex justify-center py-4 lg:hidden">
                <button
                  type="button"
                  disabled={statusBusy}
                  onClick={() => toggleOnline(true)}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-[#9d3733] text-xl font-extrabold text-[#f2e3bb] shadow-xl ring-4 ring-[#9d3733]/30 transition active:scale-95 disabled:opacity-50"
                >
                  GO
                </button>
              </div>
            )}

            <div className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-accent text-lg font-bold">Availability</h2>
                  <p className="text-sm opacity-80">
                    Status:{' '}
                    <span className="font-semibold text-[#9d3733]">
                      {isApproved ? (isOnline ? 'Online' : 'Offline') : 'Pending verification'}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!isApproved || statusBusy}
                  onClick={() => toggleOnline(!isOnline)}
                  className={`rounded-full px-5 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isOnline
                      ? 'bg-[#842f2b] text-[#f2e3bb] hover:bg-[#6f2724]'
                      : 'bg-[#9d3733] text-[#f2e3bb] hover:bg-[#842f2b]'
                  }`}
                >
                  {statusBusy ? 'Updating…' : isOnline ? 'Go offline' : 'Go online'}
                </button>
              </div>
              {!isApproved && (
                <p className="mt-3 text-sm text-[#9d3733]">
                  Your vehicle must be approved before you can go online and accept rides.
                </p>
              )}
              {(statusNote || dashboardMessage) && (
                <div className="mt-3 flex flex-wrap items-start gap-3">
                  <p className="min-w-0 flex-1 text-sm text-[#9d3733]">
                    {statusNote || dashboardMessage}
                  </p>
                  {statusNote ? (
                    <button
                      type="button"
                      onClick={() => setStatusNote('')}
                      className="shrink-0 text-xs font-bold text-[#9d3733] underline"
                    >
                      Dismiss
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <div className={cardClass}>
              <h2 className="font-accent text-lg font-bold">Accept a ride by ID</h2>
              <p className="mt-1 text-sm opacity-80">
                Paste a ride UUID while online. Notifications also appear when a request arrives.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={offerId}
                  onChange={(e) => setOfferId(e.target.value)}
                  placeholder="Ride UUID"
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm outline-none ${
                    darkMode
                      ? 'border-[#9d3733]/45 bg-black text-[#f2e3bb]'
                      : 'border-[#9d3733]/30 bg-white text-[#2d100f]'
                  }`}
                />
                <button
                  type="button"
                  disabled={actionBusy || !offerId.trim() || !isOnline || !isApproved}
                  onClick={onAcceptOffer}
                  className="rounded-xl bg-[#9d3733] px-5 py-3 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionBusy ? 'Working…' : 'Accept'}
                </button>
              </div>
            </div>

            <div className={cardClass}>
              <h2 className="font-accent text-lg font-bold">Active trip</h2>
              {dashboardBusy ? (
                <p className="mt-2 text-sm opacity-80">Loading…</p>
              ) : activeRide ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p>
                    <span className="opacity-70">Rider:</span>{' '}
                    <span className="font-semibold">{activeRide.rider?.name ?? '—'}</span>
                  </p>
                  <p>
                    <span className="opacity-70">Status:</span>{' '}
                    <span className="font-semibold text-[#9d3733]">{activeRide.status}</span>
                  </p>
                  <p>
                    <span className="opacity-70">Pickup:</span> {activeRide.pickupAddress}
                  </p>
                  <p>
                    <span className="opacity-70">Dropoff:</span> {activeRide.dropoffAddress}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {activeRide.status === 'ACCEPTED' && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={onStartTrip}
                        className="rounded-lg bg-[#9d3733] px-4 py-2 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:opacity-50"
                      >
                        Start trip
                      </button>
                    )}
                    {activeRide.status === 'STARTED' && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={onCompleteTrip}
                        className="rounded-lg bg-[#9d3733] px-4 py-2 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:opacity-50"
                      >
                        Complete trip
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm opacity-80">No active trip. Go online to receive requests.</p>
              )}
            </div>

            <div className={cardClass}>
              <h2 className="font-accent text-lg font-bold">Recent trips</h2>
              {dashboardBusy ? (
                <p className="mt-2 text-sm opacity-80">Loading…</p>
              ) : rideHistory.length === 0 ? (
                <p className="mt-2 text-sm opacity-80">No completed rides yet.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {rideHistory.slice(0, 8).map((ride) => (
                    <li
                      key={ride.id}
                      className={`rounded-lg border px-3 py-2 ${
                        darkMode ? 'border-[#9d3733]/30' : 'border-[#9d3733]/20'
                      }`}
                    >
                      <span className="font-semibold text-[#9d3733]">{ride.status}</span>
                      <span className="mx-2 opacity-40">·</span>
                      {ride.pickupAddress} → {ride.dropoffAddress}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="order-1 space-y-3 lg:sticky lg:top-24 lg:order-2">
            <div className={cardClass}>
              <h2 className="font-accent text-lg font-bold">Your location</h2>
              <p className="mt-1 text-sm opacity-80">
                Go online for a full-screen map with live GPS. Tools open from the bottom bar.
              </p>
              {isApproved && mapboxAccessToken ? (
                <MapViewControls
                  darkMode={darkMode}
                  basemapMode={driverBasemapMode}
                  onBasemapModeChange={setDriverBasemapMode}
                  trafficOn={driverTrafficOn}
                  onTrafficToggle={setDriverTrafficOn}
                  onStreetView={() =>
                    openGoogleStreetView(
                      liveLocation?.lat ?? profile?.currentLat ?? -1.9441,
                      liveLocation?.lng ?? profile?.currentLng ?? 30.0619,
                    )
                  }
                  disabled={!isOnline || Boolean(mapWebGlError)}
                  className="mt-3"
                />
              ) : null}
              {!mapboxAccessToken ? (
                <div className={`${mapPlaceholderClass} mt-4`}>
                  <p className="text-[#9d3733]">
                    Set <code className="rounded bg-black/10 px-1">VITE_MAPBOX_ACCESS_TOKEN</code> in your
                    web environment to load the map.
                  </p>
                </div>
              ) : !isApproved ? (
                <div className={`${mapPlaceholderClass} mt-4 opacity-80`}>
                  Map is available after your driver profile is approved.
                </div>
              ) : !isOnline ? (
                <div className={`${mapPlaceholderClass} mt-4`}>
                  <p className="font-medium">Go online for full-screen driving map.</p>
                  <p className="mt-2 text-xs opacity-75">Allow location when your browser asks.</p>
                </div>
              ) : mapWebGlError ? (
                <div className={`${mapPlaceholderClass} mt-4 text-[#9d3733]`}>{mapWebGlError}</div>
              ) : (
                <>
                  {driverNavUi ? (
                    <div className="mt-3 flex justify-center">
                      <DriverTurnBanner
                        darkMode={darkMode}
                        phase={driverNavUi.phase}
                        instruction={driverNavUi.instruction}
                        distanceM={driverNavUi.distanceM}
                        maneuverKind={driverNavUi.maneuverKind}
                      />
                    </div>
                  ) : null}
                  <div className="relative mt-4">
                  <div
                    ref={mapContainerRef}
                    className={`h-[min(52vh,440px)] w-full overflow-hidden rounded-2xl border ${
                      darkMode ? 'border-[#9d3733]/40' : 'border-[#9d3733]/30'
                    }`}
                  />
                  {activeRide?.status === 'ACCEPTED' && (
                    <div
                      className={`pointer-events-none absolute left-3 top-3 rounded-full border px-3 py-1 text-xs font-semibold ${
                        darkMode
                          ? 'border-[#f2e3bb]/35 bg-black/75 text-[#f2e3bb]'
                          : 'border-[#9d3733]/30 bg-white/90 text-[#9d3733]'
                      }`}
                    >
                      Navigating to Pickup
                    </div>
                  )}
                  {activeRide?.status === 'STARTED' && (
                    <div
                      className={`pointer-events-none absolute left-3 top-3 rounded-full border px-3 py-1 text-xs font-semibold ${
                        darkMode
                          ? 'border-[#f2e3bb]/35 bg-black/75 text-[#f2e3bb]'
                          : 'border-[#9d3733]/30 bg-white/90 text-[#9d3733]'
                      }`}
                    >
                      Trip in Progress to Dropoff
                    </div>
                  )}
                </div>
                </>
              )}
              {isOnline && isApproved && liveLocation && (
                <p className="mt-3 font-mono text-xs opacity-80">
                  {liveLocation.lat.toFixed(5)}, {liveLocation.lng.toFixed(5)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
