import { useCallback, useEffect, useRef, useState } from 'react'
import icon from './assets/ICON.png'
import step1 from './assets/step1.png'
import step2 from './assets/step2.png'
import step3 from './assets/step3.png'
import {
  createRide,
  cancelRide,
  getActiveRide,
  getMe,
  getRideHistory,
  loginWithGoogle,
  loginWithPassword,
  registerAccount,
  setRidePayment,
  updateMe,
  updateRideLocations,
} from './lib/api'
import AuthModal from './components/AuthModal'
import { resolveGoogleWebClientId } from './lib/googleAuth'
import { formatDurationHoursMinutes } from './lib/formatDuration'
import { estimateRideFareUsd } from './lib/estimateFare'
import { addTrafficToMap, removeTrafficFromMap } from './lib/mapTraffic'
import { getBasemapStyleUrl } from './lib/mapStyles'
import mapboxgl from 'mapbox-gl'
import { io } from 'socket.io-client'
import RiderPage from './pages/RiderPage'
import DriverPage from './pages/DriverPage'
import AdminPage from './pages/AdminPage'
import AboutPage from './pages/AboutPage'
import ContactPage from './pages/ContactPage'
import usePageSeo from './hooks/usePageSeo'

const pageToPath = {
  home: '/',
  rider: '/ride',
  driver: '/driver',
  admin: '/admin',
  profile: '/profile',
  about: '/about',
  contact: '/contact',
}

/** Avoid losing stars when refetch returns the same ride without `rating` (race / stale `/rides/active`). */
function rideHasPersistedRating(ride) {
  return Boolean(ride?.rating && typeof ride.rating.stars === 'number')
}

/** Matches studio hero art / mockup cream so the vehicle plate blends with the page. */
const WELCOME_CREAM = '#F5EFE6'
/** Solid panel fill (no transparency). */
const WELCOME_CONTENT_PANEL_BG = '#FFFCF9'

/** Rider map default region before pickup/drop are set (Dallas, TX). */
const DALLAS_DEFAULT_RIDER_COORDS = {
  pickup: { lat: 32.7767, lng: -96.797 },
  dropoff: { lat: 32.7906, lng: -96.8044 },
}

/** Hero carousel images (JPEG assets in public/). */
const WELCOME_HERO_SLIDES = [
  {
    src: '/hero-suburban-black.png',
    alt: 'Chevrolet Suburban High Country in black, three-quarter front view',
    objectPosition: '32% 50%',
    kicker: 'Executive travel',
    title: 'Arrive composed. Leave the driving to us.',
    body: 'Discreet airport and hotel transfers with vetted chauffeurs, quiet cabins, and on-time pickup—every mile feels first class.',
  },
  {
    src: '/hero-suburban-red.png',
    alt: 'Chevrolet Suburban High Country in red, side profile',
    objectPosition: '48% 52%',
    kicker: 'Groups & events',
    title: 'Room for seven—without compromising comfort.',
    body: 'Full-size luxury for families, teams, and celebrations: generous luggage space, climate control, and clear, upfront pricing.',
  },
  {
    src: '/hero-suburban-white.png',
    alt: 'Chevrolet Suburban High Country in white, side profile',
    objectPosition: '52% 50%',
    kicker: 'Always on',
    title: 'Early flights. Late nights. We show up.',
    body: '24/7 booking support and professional drivers when plans shift—reliable rides when your schedule does not wait.',
  },
]

const getPageFromPath = (pathname) => {
  if (pathname === '/rider') return 'rider'
  if (pathname === '/ride') return 'rider'
  if (pathname === '/driver') return 'driver'
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin'
  if (pathname === '/profile') return 'profile'
  if (pathname === '/about') return 'about'
  if (pathname === '/contact') return 'contact'
  return 'home'
}

const createLineFeature = (coordinates) => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates,
  },
})

const createFeatureCollection = (features) => ({
  type: 'FeatureCollection',
  features,
})

/** @param {Record<string, unknown>} feature Mapbox Geocoding feature */
function suggestionFromGeocodeFeature(feature, opts = {}) {
  const [lng, lat] = feature?.center ?? []
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  const badge = typeof opts.badge === 'string' ? opts.badge : undefined
  const nearYou = Boolean(opts.nearYou)
  return {
    id: feature.id,
    name: feature.text ?? feature.place_name ?? 'Location',
    placeName: feature.place_name ?? feature.text ?? 'Location',
    coords: { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) },
    nearYou,
    ...(badge ? { badge } : {}),
  }
}

/**
 * Build a specific rider-friendly label from reverse geocoding (POI/street first, then area).
 * Example: "AEBR Church, Minmarket, Gisenyi"
 */
function reverseFeatureToLabel(feature) {
  if (!feature || typeof feature !== 'object') return null
  const text = typeof feature.text === 'string' ? feature.text.trim() : ''
  const placeName = typeof feature.place_name === 'string' ? feature.place_name.trim() : ''
  const context = Array.isArray(feature.context) ? feature.context : []
  const contextNames = []
  for (const c of context) {
    const id = typeof c?.id === 'string' ? c.id : ''
    const value = typeof c?.text === 'string' ? c.text.trim() : ''
    if (!value) continue
    if (
      id.startsWith('address.') ||
      id.startsWith('neighborhood.') ||
      id.startsWith('locality.') ||
      id.startsWith('place.') ||
      id.startsWith('region.')
    ) {
      contextNames.push(value)
    }
  }
  const merged = [text, ...contextNames].filter(Boolean)
  const unique = []
  const seen = new Set()
  for (const p of merged) {
    const k = p.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(p)
  }
  const label = unique.slice(0, 3).join(', ')
  if (label) return label
  return placeName || text || null
}

function dedupeSuggestionsById(list) {
  const seen = new Set()
  const out = []
  for (const s of list) {
    if (!s?.id) continue
    if (seen.has(s.id)) continue
    seen.add(s.id)
    out.push(s)
  }
  return out
}

function haversineMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)))
}

function App() {
  const darkMode = false
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem('jo-auth-token') ?? '',
  )
  const [authUser, setAuthUser] = useState(() => {
    const saved = localStorage.getItem('jo-auth-user')
    if (!saved) return null
    try {
      return JSON.parse(saved)
    } catch {
      return null
    }
  })
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [activePage, setActivePage] = useState(() => getPageFromPath(window.location.pathname))
  usePageSeo(activePage)
  const [profileForm, setProfileForm] = useState({ name: '', phone: '' })
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [riderBusy, setRiderBusy] = useState(false)
  const [riderMessage, setRiderMessage] = useState('')
  const [activeRide, setActiveRide] = useState(null)
  const activeRideRef = useRef(null)
  /** Last server pickup/drop signature applied to the rider map (avoids stale markers vs `activeRide`). */
  const rideMapServerCoordsRef = useRef(null)
  const authTokenRef = useRef(null)
  const [rideHistory, setRideHistory] = useState([])
  const [riderForm, setRiderForm] = useState({
    pickupAddress: '',
    dropoffAddress: '',
    when: 'Pickup now',
    riderFor: 'For me',
  })
  const riderFormRef = useRef(riderForm)
  const [welcomeSlideIndex, setWelcomeSlideIndex] = useState(0)
  const welcomeTouchStartXRef = useRef(null)

  useEffect(() => {
    if (WELCOME_HERO_SLIDES.length < 2) return
    let id = null
    const start = () => {
      if (id != null) return
      id = window.setInterval(() => {
        setWelcomeSlideIndex((i) => (i + 1) % WELCOME_HERO_SLIDES.length)
      }, 5500)
    }
    const stop = () => {
      if (id != null) {
        window.clearInterval(id)
        id = null
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const [riderCoords, setRiderCoords] = useState(() => ({
    pickup: { ...DALLAS_DEFAULT_RIDER_COORDS.pickup },
    dropoff: { ...DALLAS_DEFAULT_RIDER_COORDS.dropoff },
  }))
  const [pickupSuggestions, setPickupSuggestions] = useState([])
  const [dropoffSuggestions, setDropoffSuggestions] = useState([])
  const [pickupSearchBusy, setPickupSearchBusy] = useState(false)
  const [dropoffSearchBusy, setDropoffSearchBusy] = useState(false)
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false)
  const [showDropoffSuggestions, setShowDropoffSuggestions] = useState(false)
  const [routeOptions, setRouteOptions] = useState([])
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0)
  const [mapWebGlError, setMapWebGlError] = useState(null)
  const [riderBasemapMode, setRiderBasemapMode] = useState('transit')
  const [riderTrafficOn, setRiderTrafficOn] = useState(true)
  const [riderLiveDriverCoords, setRiderLiveDriverCoords] = useState(null)
  const darkModeRef = useRef(darkMode)
  const riderBasemapModeRef = useRef(riderBasemapMode)
  const riderTrafficOnRef = useRef(riderTrafficOn)
  const riderCoordsRef = useRef(riderCoords)
  const snapToRoadRef = useRef(null)
  const reverseGeocodeRef = useRef(null)
  const routeOptionsRef = useRef(routeOptions)
  const selectedRouteIndexRef = useRef(selectedRouteIndex)
  const googleButtonRef = useRef(null)
  const userMenuRef = useRef(null)
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const pickupMarkerRef = useRef(null)
  const dropoffMarkerRef = useRef(null)
  const riderDriverMarkerRef = useRef(null)
  const pickupFollowsDeviceGpsRef = useRef(true)
  /** Latest device GPS (always updated) — biases search & “near you” rows. */
  const riderGeolocationRef = useRef(null)
  const lastRiderPickupSnapRef = useRef(0)
  const lastRiderPickupGeocodeRef = useRef(0)
  const routeOptionsSourceIdRef = useRef('ride-route-options-source')
  const routeOptionsLayerIdRef = useRef('ride-route-options-layer')
  const selectedRouteSourceIdRef = useRef('ride-selected-route-source')
  const selectedRouteLayerIdRef = useRef('ride-selected-route-layer')
  const driverToPickupSourceIdRef = useRef('driver-to-pickup-source')
  const driverToPickupLayerIdRef = useRef('driver-to-pickup-layer')
  const lastRiderVoiceUpdateRef = useRef(0)
  const hasAnnouncedDriverArrivalRef = useRef(false)
  const hasPromptedGoogleRef = useRef(false)
  const googleClientId = resolveGoogleWebClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID)
  const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? ''
  const bookingSteps = [
    {
      title: 'Add your trip details',
      description:
        'Enter your pickup spot and destination, then check estimated prices for your trip.',
      cta: 'Set pickup and destination',
      image: step1,
    },
    {
      title: 'Pay easily',
      description:
        'Add your preferred payment method, then choose from ride options available in your area.',
      cta: 'Choose payment method',
      image: step2,
    },
    {
      title: 'Meet your driver',
      description:
        'Get matched with a nearby driver and receive real-time updates for your ride arrival.',
      cta: 'Book your first ride',
      image: step3,
    },
  ]

  const ensureRouteLayer = useCallback(
    (map, optionsFeatureCollection, selectedFeature) => {
      if (!map?.isStyleLoaded()) {
        return false
      }

      if (!map.getSource(routeOptionsSourceIdRef.current)) {
        map.addSource(routeOptionsSourceIdRef.current, {
          type: 'geojson',
          data: optionsFeatureCollection,
        })
      }

      if (!map.getLayer(routeOptionsLayerIdRef.current)) {
        map.addLayer({
          id: routeOptionsLayerIdRef.current,
          type: 'line',
          source: routeOptionsSourceIdRef.current,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#60a5fa',
            'line-width': 4,
            'line-opacity': 0.5,
          },
        })
      }

      if (!map.getSource(selectedRouteSourceIdRef.current)) {
        map.addSource(selectedRouteSourceIdRef.current, {
          type: 'geojson',
          data: selectedFeature,
        })
      }

      if (!map.getLayer(selectedRouteLayerIdRef.current)) {
        map.addLayer({
          id: selectedRouteLayerIdRef.current,
          type: 'line',
          source: selectedRouteSourceIdRef.current,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#2563eb',
            'line-width': 6,
            'line-opacity': 0.95,
          },
        })
      }

      return true
    },
    [],
  )

  const searchLocationSuggestions = useCallback(
    async (query, biasCoords) => {
      if (!mapboxAccessToken || !query?.trim()) return []
      const q = query.trim()
      const encoded = encodeURIComponent(q)
      const types = 'poi,address,neighborhood,locality,place'
      const baseUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json`
      const biasValid =
        biasCoords &&
        Number.isFinite(biasCoords.lng) &&
        Number.isFinite(biasCoords.lat)
      const biasProximity = biasValid ? `&proximity=${biasCoords.lng},${biasCoords.lat}` : ''
      const rwBbox = '28.85,-2.85,30.95,-1.00'
      const localBbox = biasValid
        ? `&bbox=${(biasCoords.lng - 0.22).toFixed(6)},${(biasCoords.lat - 0.22).toFixed(6)},${(biasCoords.lng + 0.22).toFixed(6)},${(biasCoords.lat + 0.22).toFixed(6)}`
        : ''
      const searchUrlNearby = `${baseUrl}?autocomplete=true&limit=12&types=${types}&language=en&country=rw${biasProximity}&access_token=${mapboxAccessToken}`
      const searchUrlLocalBox = `${baseUrl}?autocomplete=true&limit=12&types=${types}&language=en&country=rw${localBbox}&access_token=${mapboxAccessToken}`
      const searchUrlRwanda = `${baseUrl}?autocomplete=true&limit=12&types=${types}&language=en&country=rw&bbox=${rwBbox}&access_token=${mapboxAccessToken}`
      const searchUrlGlobal = `${baseUrl}?autocomplete=true&limit=12&types=${types}&language=en&access_token=${mapboxAccessToken}`
      const loadNearby = async () => {
        if (!biasValid) return []
        const { lng, lat } = biasCoords
        const nearbyUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?limit=10&types=poi,address,place,locality,neighborhood&access_token=${mapboxAccessToken}`
        const nearbyResponse = await fetch(nearbyUrl)
        if (!nearbyResponse.ok) return []
        const nearbyData = await nearbyResponse.json()
        const nearbyFeatures = Array.isArray(nearbyData?.features) ? nearbyData.features : []
        return dedupeSuggestionsById(
          nearbyFeatures.map((feature) => suggestionFromGeocodeFeature(feature)).filter(Boolean),
        )
      }
      const [nearbyResponse, localBoxResponse, rwandaResponse, globalResponse, nearby] = await Promise.all([
        fetch(searchUrlNearby),
        fetch(searchUrlLocalBox),
        fetch(searchUrlRwanda),
        fetch(searchUrlGlobal),
        loadNearby(),
      ])
      const localMatches = (nearby ?? []).filter((s) => {
        const hay = `${s?.name ?? ''} ${s?.placeName ?? ''}`.toLowerCase()
        return hay.includes(q.toLowerCase())
      })
      const localTagged = localMatches.map((s) => ({
        ...s,
        badge: s.badge ?? 'Nearby match',
      }))

      const parseRemote = async (res, badge) => {
        if (!res.ok) return []
        const data = await res.json()
        const features = Array.isArray(data?.features) ? data.features : []
        return features
          .map((feature) => suggestionFromGeocodeFeature(feature))
          .filter(Boolean)
          .map((s) => ({ ...s, ...(badge ? { badge } : {}) }))
      }
      const [nearbyRemote, localBoxRemote, rwandaRemote, globalRemote] = await Promise.all([
        parseRemote(nearbyResponse, ''),
        parseRemote(localBoxResponse, 'Nearby area'),
        parseRemote(rwandaResponse, 'Rwanda'),
        parseRemote(globalResponse, ''),
      ])

      const combined = dedupeSuggestionsById([
        ...localTagged,
        ...nearbyRemote,
        ...localBoxRemote,
        ...rwandaRemote,
        ...globalRemote,
      ])

      const qLower = q.toLowerCase()
      const scoreSuggestion = (s) => {
        const name = String(s?.name ?? '').toLowerCase()
        const placeName = String(s?.placeName ?? '').toLowerCase()
        const inRwanda = placeName.includes('rwanda')
        const starts = name.startsWith(qLower) || placeName.startsWith(qLower)
        const contains = name.includes(qLower) || placeName.includes(qLower)
        const nearBoost = s?.badge === 'Nearby match' || s?.badge === 'Nearby area'
        let distancePenalty = 0
        if (biasValid && Number.isFinite(s?.coords?.lat) && Number.isFinite(s?.coords?.lng)) {
          const km = haversineMeters(biasCoords.lat, biasCoords.lng, s.coords.lat, s.coords.lng) / 1000
          distancePenalty = Math.min(20, km / 6)
        }
        return (
          (starts ? 50 : 0) +
          (contains ? 25 : 0) +
          (nearBoost ? 18 : 0) +
          (inRwanda ? 12 : 0) -
          distancePenalty
        )
      }

      const ranked = [...combined].sort((a, b) => scoreSuggestion(b) - scoreSuggestion(a))
      if (ranked.length > 0) {
        // Prefer Rwanda/nearby matches first when available.
        const localFirst = ranked.filter(
          (s) =>
            String(s?.placeName ?? '').toLowerCase().includes('rwanda') ||
            s?.badge === 'Nearby match' ||
            s?.badge === 'Nearby area',
        )
        if (localFirst.length > 0) {
          const finalList = dedupeSuggestionsById([...localFirst, ...ranked])
          return finalList.slice(0, 12)
        }
        return ranked.slice(0, 12)
      }
      return dedupeSuggestionsById(localTagged).slice(0, 12)
    },
    [mapboxAccessToken],
  )

  /** Reverse-geocode stack near a point — POIs, streets, places (biased to coordinates). */
  const fetchNearbyLocationSuggestions = useCallback(
    async (biasCoords) => {
      if (
        !mapboxAccessToken ||
        !biasCoords ||
        !Number.isFinite(biasCoords.lng) ||
        !Number.isFinite(biasCoords.lat)
      ) {
        return []
      }
      const { lng, lat } = biasCoords
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?limit=10&types=poi,address,place,locality,neighborhood&access_token=${mapboxAccessToken}`
      const response = await fetch(url)
      if (!response.ok) return []
      const data = await response.json()
      const features = Array.isArray(data?.features) ? data.features : []
      return dedupeSuggestionsById(
        features.map((feature) => suggestionFromGeocodeFeature(feature)).filter(Boolean),
      )
    },
    [mapboxAccessToken],
  )

  const snapToRoad = useCallback(
    async (coords) => {
      if (!mapboxAccessToken) return coords
      const tinyOffset = 0.0003
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coords.lng},${coords.lat};${coords.lng + tinyOffset},${coords.lat + tinyOffset}?alternatives=false&geometries=geojson&overview=false&steps=false&access_token=${mapboxAccessToken}`,
      )
      if (!response.ok) return coords
      const data = await response.json()
      const snapped = data?.waypoints?.[0]?.location
      if (!Array.isArray(snapped) || snapped.length < 2) return coords
      return {
        lat: Number(snapped[1].toFixed(6)),
        lng: Number(snapped[0].toFixed(6)),
      }
    },
    [mapboxAccessToken],
  )

  const handleRiderLocationInput = useCallback((field, value) => {
    if (field === 'pickup') {
      pickupFollowsDeviceGpsRef.current = false
    }
    setRiderForm((prev) => ({
      ...prev,
      [field === 'pickup' ? 'pickupAddress' : 'dropoffAddress']: value,
    }))

    if (field === 'pickup') {
      setShowPickupSuggestions(true)
      if (!value.trim()) setPickupSuggestions([])
      return
    }

    setShowDropoffSuggestions(true)
    if (!value.trim()) setDropoffSuggestions([])
  }, [])

  const handleSelectRiderLocation = useCallback(async (field, suggestion) => {
    if (field === 'pickup') {
      pickupFollowsDeviceGpsRef.current = false
    }
    const snappedCoords = await snapToRoad(suggestion.coords)
    const nextPickupCoord = field === 'pickup' ? snappedCoords : riderCoords.pickup
    const nextDropoffCoord = field === 'dropoff' ? snappedCoords : riderCoords.dropoff
    const nextPickupAddr = field === 'pickup' ? suggestion.placeName : riderForm.pickupAddress
    const nextDropoffAddr = field === 'dropoff' ? suggestion.placeName : riderForm.dropoffAddress

    setRiderForm((prev) => ({
      ...prev,
      [field === 'pickup' ? 'pickupAddress' : 'dropoffAddress']: suggestion.placeName,
    }))
    setRiderCoords((prev) => ({
      ...prev,
      [field]: snappedCoords,
    }))
    setSelectedRouteIndex(0)

    if (field === 'pickup') {
      setPickupSuggestions([])
      setShowPickupSuggestions(false)
    } else {
      setDropoffSuggestions([])
      setShowDropoffSuggestions(false)
    }

    const ride = activeRideRef.current
    if (authToken && ride?.status === 'REQUESTED') {
      try {
        const updated = await updateRideLocations(authToken, ride.id, {
          pickupLat: nextPickupCoord.lat,
          pickupLng: nextPickupCoord.lng,
          pickupAddress: nextPickupAddr.trim(),
          dropoffLat: nextDropoffCoord.lat,
          dropoffLng: nextDropoffCoord.lng,
          dropoffAddress: nextDropoffAddr.trim(),
        })
        setActiveRide(updated)
      } catch (e) {
        setRiderMessage(e.message || 'Could not update ride location for drivers.')
      }
    }
  }, [authToken, riderCoords.pickup, riderCoords.dropoff, riderForm.pickupAddress, riderForm.dropoffAddress, snapToRoad])

  const resolveLocationFromQuery = useCallback(
    async (query) => {
      const bias = riderGeolocationRef.current ?? riderCoordsRef.current.pickup
      const results = await searchLocationSuggestions(query, bias)
      return Array.isArray(results) && results.length > 0 ? results[0] : null
    },
    [searchLocationSuggestions],
  )

  const fetchRouteOptions = useCallback(
    async (pickup, dropoff) => {
      const fallbackFeature = createLineFeature([
        [pickup.lng, pickup.lat],
        [dropoff.lng, dropoff.lat],
      ])
      const fallbackOption = {
        id: 'fallback-0',
        feature: fallbackFeature,
        name: 'Straight line (no driving route)',
        summaryLine: '',
        roadsLine: '',
        durationMinutes: null,
        distanceKm: null,
        priceUsd: null,
      }

      if (!mapboxAccessToken) {
        return [fallbackOption]
      }

      const coordinates = `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}`

      const buildDirectionsUrl = (profile) => {
        const params = new URLSearchParams({
          geometries: 'geojson',
          overview: 'full',
          steps: 'true',
          alternatives: 'true',
          access_token: mapboxAccessToken,
        })
        if (profile === 'driving-traffic') {
          params.set('departure_time', 'now')
        }
        return `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?${params.toString()}`
      }

      const collectDrivableRoadNames = (route) => {
        const names = []
        for (const leg of route.legs ?? []) {
          for (const step of leg.steps ?? []) {
            const n = typeof step.name === 'string' ? step.name.trim() : ''
            if (n && !/^unnamed$/i.test(n)) names.push(n)
          }
        }
        const seen = new Set()
        const unique = []
        for (const n of names) {
          if (!seen.has(n)) {
            seen.add(n)
            unique.push(n)
          }
        }
        return unique
      }

      const parseRoutes = (data) => {
        const routes = Array.isArray(data?.routes) ? data.routes : []
        const parsed = routes
          .map((route, index) => {
            const routeCoordinates = route?.geometry?.coordinates
            if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) return null
            const durationSeconds = Number(route.duration ?? 0)
            const distanceMeters = Number(route.distance ?? 0)
            const legs = Array.isArray(route?.legs) ? route.legs : []
            const legSummary = legs
              .map((leg) => leg?.summary)
              .filter(Boolean)
              .join(' — ')
              .split(';')
              .map((part) => part.trim())
              .filter(Boolean)
              .slice(0, 4)
              .join(' · ')
            const roadNames = collectDrivableRoadNames(route)
            const roadsLine = roadNames.join(' · ')
            const summaryLine = roadsLine || legSummary
            return {
              id: `route-${index}`,
              feature: createLineFeature(routeCoordinates),
              durationMinutes:
                durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : null,
              distanceKm: distanceMeters > 0 ? Number((distanceMeters / 1000).toFixed(1)) : null,
              summaryLine,
              roadsLine,
            }
          })
          .filter(Boolean)

        const minDuration = Math.min(
          ...parsed.map((r) => (r.durationMinutes != null ? r.durationMinutes : Infinity)),
        )
        const minDistance = Math.min(
          ...parsed.map((r) => (r.distanceKm != null ? r.distanceKm : Infinity)),
        )

        return parsed.map((r, index) => {
          let name = r.summaryLine
          if (name && name.length > 46) {
            name = `${name.slice(0, 43)}…`
          }
          if (!name) {
            if (parsed.length === 1) name = 'Driving route'
            else if (index === 0) name = 'Primary option'
            else name = `Alternate ${index}`
          }
          const tags = []
          if (parsed.length > 1 && r.durationMinutes != null && r.durationMinutes === minDuration) {
            tags.push('Fastest')
          }
          if (
            parsed.length > 1 &&
            r.distanceKm != null &&
            r.distanceKm === minDistance &&
            r.durationMinutes !== minDuration
          ) {
            tags.push('Shortest')
          }
          const prefix = tags.length > 0 ? `${tags.join(' · ')} · ` : ''
          const fullName = `${prefix}${name}`
          const signatureCounts = parsed.filter(
            (o) =>
              o.summaryLine === r.summaryLine &&
              o.durationMinutes === r.durationMinutes &&
              o.distanceKm === r.distanceKm,
          ).length
          const disambiguated =
            signatureCounts > 1 && r.durationMinutes != null
              ? `${fullName} (${formatDurationHoursMinutes(r.durationMinutes)})`
              : fullName
          return {
            ...r,
            name: disambiguated.length > 72 ? `${disambiguated.slice(0, 69)}…` : disambiguated,
            priceUsd: estimateRideFareUsd({
              distanceKm: r.distanceKm,
              durationMinutes: r.durationMinutes,
            }),
          }
        })
      }

      let response = await fetch(buildDirectionsUrl('driving-traffic'))
      if (!response.ok) {
        response = await fetch(buildDirectionsUrl('driving'))
      }
      if (!response.ok) {
        return [fallbackOption]
      }

      let data = await response.json()
      let normalized = parseRoutes(data)
      if (normalized.length === 0) {
        response = await fetch(buildDirectionsUrl('driving'))
        if (response.ok) {
          data = await response.json()
          normalized = parseRoutes(data)
        }
      }
      return normalized.length > 0 ? normalized : [fallbackOption]
    },
    [mapboxAccessToken],
  )

  const reverseGeocode = useCallback(
    async (coords) => {
      if (!mapboxAccessToken) return null
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.lng},${coords.lat}.json?limit=5&types=poi,address,neighborhood,locality,place&language=en&access_token=${mapboxAccessToken}`,
      )
      if (!response.ok) return null
      const data = await response.json()
      const features = Array.isArray(data?.features) ? data.features : []
      if (features.length === 0) return null
      const rank = (f) => {
        const types = Array.isArray(f?.place_type) ? f.place_type : []
        if (types.includes('poi')) return 0
        if (types.includes('address')) return 1
        if (types.includes('neighborhood')) return 2
        if (types.includes('locality')) return 3
        if (types.includes('place')) return 4
        return 9
      }
      const best = [...features].sort((a, b) => rank(a) - rank(b))[0]
      return reverseFeatureToLabel(best)
    },
    [mapboxAccessToken],
  )

  snapToRoadRef.current = snapToRoad
  reverseGeocodeRef.current = reverseGeocode
  darkModeRef.current = darkMode
  riderBasemapModeRef.current = riderBasemapMode
  riderTrafficOnRef.current = riderTrafficOn
  riderCoordsRef.current = riderCoords
  activeRideRef.current = activeRide
  authTokenRef.current = authToken
  riderFormRef.current = riderForm
  routeOptionsRef.current = routeOptions
  selectedRouteIndexRef.current = selectedRouteIndex

  useEffect(() => {
    const handlePopState = () => {
      setActivePage(getPageFromPath(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigateToPage = useCallback((page, { replace = false } = {}) => {
    const nextPage = pageToPath[page] ? page : 'home'
    const nextPath = pageToPath[nextPage]
    const currentPath = window.location.pathname

    if (currentPath !== nextPath) {
      const method = replace ? 'replaceState' : 'pushState'
      window.history[method](null, '', nextPath)
    }

    setActivePage(nextPage)
  }, [])

  useEffect(() => {
    if (!authToken) {
      localStorage.removeItem('jo-auth-token')
      localStorage.removeItem('jo-auth-user')
      setAuthUser(null)
      return
    }

    localStorage.setItem('jo-auth-token', authToken)
    getMe(authToken)
      .then((user) => {
        setAuthUser((prev) => {
          const nextUser = {
            ...user,
            avatarUrl: user.avatarUrl ?? prev?.avatarUrl ?? null,
          }
          localStorage.setItem('jo-auth-user', JSON.stringify(nextUser))
          return nextUser
        })
        setAuthError('')
      })
      .catch(() => {
        setAuthToken('')
        setAuthUser(null)
        localStorage.removeItem('jo-auth-user')
      })
  }, [authToken])

  const completeAuthSession = useCallback(
    (data) => {
      setAuthToken(data.token)
      setAuthUser(data.user)
      localStorage.setItem('jo-auth-user', JSON.stringify(data.user))
      setProfileForm({
        name: data.user.name ?? '',
        phone: data.user.phone ?? '',
      })
      setAuthModalOpen(false)
      setAuthError('')
      if (data.user.role === 'ADMIN') {
        navigateToPage('admin', { replace: true })
      } else if (data.user.role === 'DRIVER') {
        navigateToPage('driver', { replace: true })
      }
    },
    [navigateToPage],
  )

  const handleGoogleCredential = useCallback(
    async (response) => {
      if (!response?.credential) {
        return
      }

      try {
        setAuthBusy(true)
        setAuthError('')
        const data = await loginWithGoogle(response.credential)
        completeAuthSession(data)
      } catch (error) {
        setAuthError(error.message || 'Google login failed')
      } finally {
        setAuthBusy(false)
      }
    },
    [completeAuthSession],
  )

  const handleEmailLogin = useCallback(
    async ({ email, password }) => {
      try {
        setAuthBusy(true)
        setAuthError('')
        const data = await loginWithPassword(email, password)
        completeAuthSession(data)
      } catch (error) {
        setAuthError(error.message || 'Sign in failed')
      } finally {
        setAuthBusy(false)
      }
    },
    [completeAuthSession],
  )

  const handleRegister = useCallback(
    async (payload) => {
      try {
        setAuthBusy(true)
        setAuthError('')
        const data = await registerAccount(payload)
        completeAuthSession(data)
      } catch (error) {
        setAuthError(error.message || 'Could not create account')
      } finally {
        setAuthBusy(false)
      }
    },
    [completeAuthSession],
  )

  useEffect(() => {
    if (!authModalOpen || !googleButtonRef.current || authUser || !googleClientId) {
      return
    }

    const renderGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) {
        return
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      })
      googleButtonRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: darkMode ? 'filled_black' : 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: 210,
      })

      if (!hasPromptedGoogleRef.current) {
        window.google.accounts.id.prompt()
        hasPromptedGoogleRef.current = true
      }
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = renderGoogleButton
    document.head.appendChild(script)
  }, [authModalOpen, authUser, darkMode, googleClientId, handleGoogleCredential])

  const handleLogout = () => {
    setAuthToken('')
    setAuthUser(null)
    setAuthError('')
    localStorage.removeItem('jo-auth-user')
    hasPromptedGoogleRef.current = false
    setAuthModalOpen(false)
    setUserMenuOpen(false)
    navigateToPage('home', { replace: true })
  }

  useEffect(() => {
    if (!userMenuOpen) return

    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [activePage])

  useEffect(() => {
    setProfileForm({
      name: authUser?.name ?? '',
      phone: authUser?.phone ?? '',
    })
  }, [authUser])

  const handleProfileSave = async (event) => {
    event.preventDefault()
    if (!authToken) return

    try {
      setProfileBusy(true)
      setProfileMessage('')
      const updated = await updateMe(authToken, {
        name: profileForm.name,
        phone: profileForm.phone || null,
      })
      const nextUser = {
        ...authUser,
        ...updated,
        avatarUrl: authUser?.avatarUrl ?? updated.avatarUrl ?? null,
      }
      setAuthUser(nextUser)
      localStorage.setItem('jo-auth-user', JSON.stringify(nextUser))
      setProfileMessage('Profile updated successfully.')
    } catch (error) {
      setProfileMessage(error.message || 'Failed to update profile.')
    } finally {
      setProfileBusy(false)
    }
  }

  const fetchRiderData = useCallback(async () => {
    if (!authToken) return
    try {
      setRiderBusy(true)
      setRiderMessage('')
      const [active, history] = await Promise.all([
        getActiveRide(authToken),
        getRideHistory(authToken, 50),
      ])
      const historyArr = Array.isArray(history) ? history : []
      setActiveRide((prev) => {
        if (active == null) return null
        if (
          prev &&
          prev.id === active.id &&
          rideHasPersistedRating(prev) &&
          !rideHasPersistedRating(active)
        ) {
          return { ...active, rating: prev.rating }
        }
        if (active.id && !rideHasPersistedRating(active)) {
          const fromHist = historyArr.find((r) => r.id === active.id && rideHasPersistedRating(r))
          if (fromHist?.rating) {
            return { ...active, rating: fromHist.rating }
          }
        }
        return active
      })
      setRideHistory(historyArr)
      return { active, history }
    } catch (error) {
      setRiderMessage(error.message || 'Unable to load rider data.')
      return { active: null, history: [] }
    } finally {
      setRiderBusy(false)
    }
  }, [authToken])

  useEffect(() => {
    if (activePage === 'rider' && authToken) {
      fetchRiderData()
    }
  }, [activePage, authToken, fetchRiderData])

  useEffect(() => {
    if (activePage !== 'rider' || !authToken) return undefined

    const trackingDriver =
      activeRide?.status === 'ACCEPTED' || activeRide?.status === 'STARTED'
    const intervalMs = trackingDriver ? 5000 : 15000

    const pollId = window.setInterval(() => {
      void fetchRiderData()
    }, intervalMs)

    return () => window.clearInterval(pollId)
  }, [activePage, authToken, fetchRiderData, activeRide?.status])

  /** Keep map pins + blue trip line aligned with the server ride; green driver→pickup uses `activeRide` coords. */
  useEffect(() => {
    if (activePage !== 'rider') return
    const ride = activeRide
    if (!ride || !['REQUESTED', 'ACCEPTED', 'STARTED'].includes(ride.status)) {
      rideMapServerCoordsRef.current = null
      return
    }

    const plat = Number(ride.pickupLat)
    const plng = Number(ride.pickupLng)
    const dlat = Number(ride.dropoffLat)
    const dlng = Number(ride.dropoffLng)
    if (![plat, plng, dlat, dlng].every(Number.isFinite)) return

    const signature = `${ride.id}|${plat}|${plng}|${dlat}|${dlng}`
    const prevSig = rideMapServerCoordsRef.current
    if (prevSig === signature) return

    const pickupDrift = haversineMeters(riderCoords.pickup.lat, riderCoords.pickup.lng, plat, plng)
    const dropDrift = haversineMeters(riderCoords.dropoff.lat, riderCoords.dropoff.lng, dlat, dlng)
    const idChanged = prevSig == null || !prevSig.startsWith(`${ride.id}|`)

    if (pickupDrift > 35 || dropDrift > 35 || idChanged) {
      setRiderCoords({
        pickup: { lat: plat, lng: plng },
        dropoff: { lat: dlat, lng: dlng },
      })
    }

    const pAddr = typeof ride.pickupAddress === 'string' ? ride.pickupAddress.trim() : ''
    const dAddr = typeof ride.dropoffAddress === 'string' ? ride.dropoffAddress.trim() : ''
    if (pAddr || dAddr) {
      setRiderForm((prev) => ({
        ...prev,
        ...(pAddr ? { pickupAddress: pAddr } : {}),
        ...(dAddr ? { dropoffAddress: dAddr } : {}),
      }))
    }

    rideMapServerCoordsRef.current = signature
  }, [
    activePage,
    activeRide?.id,
    activeRide?.status,
    activeRide?.pickupLat,
    activeRide?.pickupLng,
    activeRide?.dropoffLat,
    activeRide?.dropoffLng,
    activeRide?.pickupAddress,
    activeRide?.dropoffAddress,
    riderCoords.pickup.lat,
    riderCoords.pickup.lng,
    riderCoords.dropoff.lat,
    riderCoords.dropoff.lng,
  ])

  useEffect(() => {
    if (activePage === 'rider') {
      pickupFollowsDeviceGpsRef.current = true
    }
  }, [activePage])

  useEffect(() => {
    if (activePage !== 'rider' || !authUser) return undefined

    if (!navigator.geolocation) {
      setRiderMessage('Geolocation is not supported in this browser.')
      return undefined
    }

    let cancelled = false

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (cancelled) return

        const rawPickup = {
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        }
        riderGeolocationRef.current = rawPickup

        if (!pickupFollowsDeviceGpsRef.current) return

        const now = Date.now()
        let nextPickup = rawPickup

        if (now - lastRiderPickupSnapRef.current >= 8000) {
          try {
            const snapped = await snapToRoadRef.current?.(rawPickup)
            if (snapped) nextPickup = snapped
          } catch {
            nextPickup = rawPickup
          }
          lastRiderPickupSnapRef.current = now
        }

        if (cancelled || !pickupFollowsDeviceGpsRef.current) return

        setRiderCoords((prev) => ({ ...prev, pickup: nextPickup }))

        if (now - lastRiderPickupGeocodeRef.current >= 12000) {
          lastRiderPickupGeocodeRef.current = now
          try {
            const placeName = await reverseGeocodeRef.current?.(nextPickup)
            if (
              !cancelled &&
              pickupFollowsDeviceGpsRef.current &&
              typeof placeName === 'string' &&
              placeName
            ) {
              setRiderForm((prev) => ({ ...prev, pickupAddress: placeName }))
            } else if (!cancelled && pickupFollowsDeviceGpsRef.current && !placeName) {
              setRiderForm((prev) => ({
                ...prev,
                pickupAddress: `${nextPickup.lat.toFixed(5)}, ${nextPickup.lng.toFixed(5)}`,
              }))
            }
          } catch {
            /* keep last label */
          }
        }

        setRiderMessage('')
      },
      () => {
        setRiderMessage(
          'Location access denied. Enable GPS permission to auto-fill pickup in real time.',
        )
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    )

    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(watchId)
    }
  }, [activePage, authUser])

  /** Keep rider UI in sync if the server broadcasts ride updates (e.g. another device). */
  useEffect(() => {
    if (activePage !== 'rider' || !authToken || authUser?.role !== 'RIDER') return undefined
    if (!activeRide?.id || activeRide.status !== 'REQUESTED') return undefined
    const rideId = activeRide.id
    const socket = io(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000', {
      auth: { token: authToken },
      transports: ['websocket'],
    })
    socket.on('connect', () => {
      socket.emit('ride:subscribe', { rideId })
    })
    socket.on('ride:status', (p) => {
      if (p?.rideId !== rideId || !p?.ride) return
      setActiveRide(p.ride)
    })
    return () => {
      socket.disconnect()
    }
  }, [activePage, authToken, authUser?.role, activeRide?.id, activeRide?.status])

  /** While waiting for/meeting a driver, push pickup updates if the rider moves with GPS follow on. */
  useEffect(() => {
    if (activePage !== 'rider' || !authToken) return undefined
    const ride = activeRideRef.current
    if (!ride || !['REQUESTED', 'ACCEPTED'].includes(ride.status)) return undefined
    if (!pickupFollowsDeviceGpsRef.current) return undefined

    const pick = riderCoords.pickup
    const dist = haversineMeters(ride.pickupLat, ride.pickupLng, pick.lat, pick.lng)
    if (dist < 38) return undefined

    let cancelled = false
    const tid = window.setTimeout(async () => {
      if (cancelled) return
      const r = activeRideRef.current
      if (!r || r.id !== ride.id || !['REQUESTED', 'ACCEPTED'].includes(r.status)) return
      if (!pickupFollowsDeviceGpsRef.current) return
      const rc = riderCoordsRef.current
      const d = haversineMeters(r.pickupLat, r.pickupLng, rc.pickup.lat, rc.pickup.lng)
      if (d < 32) return
      try {
        let addr = riderForm.pickupAddress.trim()
        const label = await reverseGeocodeRef.current?.(rc.pickup)
        if (label) addr = label
        const updated = await updateRideLocations(authToken, ride.id, {
          pickupLat: rc.pickup.lat,
          pickupLng: rc.pickup.lng,
          pickupAddress: addr || r.pickupAddress,
          dropoffLat: rc.dropoff.lat,
          dropoffLng: rc.dropoff.lng,
          dropoffAddress: riderForm.dropoffAddress.trim(),
        })
        if (!cancelled) setActiveRide(updated)
      } catch {
        /* ignore transient errors */
      }
    }, 10_000)

    return () => {
      cancelled = true
      window.clearTimeout(tid)
    }
  }, [
    activePage,
    authToken,
    riderCoords.pickup.lat,
    riderCoords.pickup.lng,
    riderCoords.dropoff.lat,
    riderCoords.dropoff.lng,
    riderForm.pickupAddress,
    riderForm.dropoffAddress,
    activeRide?.id,
    activeRide?.status,
    activeRide?.pickupLat,
    activeRide?.pickupLng,
  ])

  useEffect(() => {
    if (activePage !== 'rider' || !authToken || !authUser) {
      setRiderLiveDriverCoords(null)
      return undefined
    }

    const rideId = activeRide?.id
    const unratedCompleted =
      activeRide?.status === 'COMPLETED' &&
      !activeRide?.rating &&
      Boolean(activeRide?.driverId)
    const track =
      activeRide?.driverId &&
      (activeRide?.status === 'ACCEPTED' ||
        activeRide?.status === 'STARTED' ||
        unratedCompleted)

    if (!track || !rideId) {
      setRiderLiveDriverCoords(null)
      return undefined
    }

    const socket = io(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000', {
      auth: { token: authToken },
      transports: ['websocket'],
    })

    const onDriverLocation = (payload) => {
      if (payload?.rideId !== rideId) return
      const lat = Number(payload?.lat)
      const lng = Number(payload?.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      setRiderLiveDriverCoords({ lat, lng })
    }

    const onRideStatus = (payload) => {
      if (payload?.rideId !== rideId || !payload?.ride) return
      setActiveRide(payload.ride)
    }

    socket.on('connect', () => {
      socket.emit('ride:subscribe', { rideId })
    })
    socket.on('driver:location', onDriverLocation)
    socket.on('ride:status', onRideStatus)

    return () => {
      setRiderLiveDriverCoords(null)
      socket.disconnect()
    }
  }, [
    activePage,
    authToken,
    authUser,
    activeRide?.id,
    activeRide?.status,
    activeRide?.driverId,
    activeRide?.rating,
  ])

  /** Driver: stay subscribed to the active ride room so pickup/dropoff updates match the server (same as rider `ride:status`). */
  useEffect(() => {
    if (activePage !== 'driver' || !authToken || authUser?.role !== 'DRIVER') return undefined
    const rideId = activeRide?.id
    if (!rideId) return undefined

    const socket = io(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000', {
      auth: { token: authToken },
      transports: ['websocket'],
    })

    const onRideStatus = (p) => {
      if (p?.rideId !== rideId || !p?.ride) return
      setActiveRide(p.ride)
    }

    socket.on('connect', () => {
      socket.emit('ride:subscribe', { rideId })
    })
    socket.on('ride:status', onRideStatus)

    return () => {
      socket.disconnect()
    }
  }, [activePage, authToken, authUser?.role, activeRide?.id])

  useEffect(() => {
    if (activePage === 'driver' && authToken && authUser?.role === 'DRIVER') {
      fetchRiderData()
    }
  }, [activePage, authToken, authUser?.role, fetchRiderData])

  useEffect(() => {
    if (activePage !== 'rider' || !showPickupSuggestions) return
    const query = riderForm.pickupAddress.trim()
    let cancelled = false
    const delay = query.length < 2 ? 200 : 500

    const timeout = window.setTimeout(async () => {
      try {
        setPickupSearchBusy(true)
        const geo = riderGeolocationRef.current
        const bias = geo ?? riderCoordsRef.current.pickup

        if (query.length < 2) {
          if (!mapboxAccessToken) {
            if (!cancelled) setPickupSuggestions([])
            return
          }
          const nearby = await fetchNearbyLocationSuggestions(bias)
          let list = nearby
          if (geo) {
            const label = await reverseGeocodeRef.current?.(geo)
            const currentRow = {
              id: '__jo_near_gps__',
              name: label ?? 'Current location',
              placeName: label ? `${label} · Near you` : 'Current location · Near you',
              coords: { ...geo },
              nearYou: true,
              badge: 'Near you',
            }
            list = dedupeSuggestionsById([currentRow, ...nearby])
          }
          if (!cancelled) setPickupSuggestions(list)
          return
        }

        let suggestions = await searchLocationSuggestions(query, geo ?? bias)
        if (suggestions.length === 0) {
          const nearbyFallback = await fetchNearbyLocationSuggestions(geo ?? bias)
          suggestions = nearbyFallback.map((s) => ({
            ...s,
            badge: s.badge ?? 'Nearby area',
          }))
        }
        if (!cancelled) setPickupSuggestions(suggestions)
      } finally {
        if (!cancelled) setPickupSearchBusy(false)
      }
    }, delay)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [
    activePage,
    riderForm.pickupAddress,
    mapboxAccessToken,
    showPickupSuggestions,
    searchLocationSuggestions,
    fetchNearbyLocationSuggestions,
  ])

  useEffect(() => {
    if (activePage !== 'rider' || !showDropoffSuggestions) return
    const query = riderForm.dropoffAddress.trim()
    let cancelled = false
    const delay = query.length < 2 ? 200 : 500
    const pickupPivot = riderCoordsRef.current.pickup

    const timeout = window.setTimeout(async () => {
      try {
        setDropoffSearchBusy(true)

        if (query.length < 2) {
          if (!mapboxAccessToken) {
            if (!cancelled) setDropoffSuggestions([])
            return
          }
          const nearby = await fetchNearbyLocationSuggestions(pickupPivot)
          const tagged = nearby.map((s) => ({
            ...s,
            badge: s.badge ?? 'Near pickup',
          }))
          if (!cancelled) setDropoffSuggestions(tagged)
          return
        }

        let suggestions = await searchLocationSuggestions(query, pickupPivot)
        if (suggestions.length === 0) {
          const nearbyFallback = await fetchNearbyLocationSuggestions(pickupPivot)
          suggestions = nearbyFallback.map((s) => ({
            ...s,
            badge: s.badge ?? 'Near pickup',
          }))
        }
        if (!cancelled) setDropoffSuggestions(suggestions)
      } finally {
        if (!cancelled) setDropoffSearchBusy(false)
      }
    }, delay)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [
    activePage,
    riderForm.dropoffAddress,
    mapboxAccessToken,
    showDropoffSuggestions,
    searchLocationSuggestions,
    fetchNearbyLocationSuggestions,
  ])

  useEffect(() => {
    if (!showPickupSuggestions) {
      setPickupSearchBusy(false)
    }
  }, [showPickupSuggestions])

  useEffect(() => {
    if (!showDropoffSuggestions) {
      setDropoffSearchBusy(false)
    }
  }, [showDropoffSuggestions])

  const routeOptionFeatures = routeOptions.map((option) => option.feature)
  const selectedRouteFeature =
    routeOptions[selectedRouteIndex]?.feature ??
    routeOptions[0]?.feature ??
    createLineFeature([
      [riderCoords.pickup.lng, riderCoords.pickup.lat],
      [riderCoords.dropoff.lng, riderCoords.dropoff.lat],
    ])

  useEffect(() => {
    if (activePage !== 'rider') return
    let cancelled = false

    const timeout = window.setTimeout(async () => {
      const nextRouteOptions = await fetchRouteOptions(riderCoords.pickup, riderCoords.dropoff)
      if (!cancelled) {
        setRouteOptions(nextRouteOptions)
      }
    }, 1200)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [activePage, riderCoords, fetchRouteOptions])

  useEffect(() => {
    if (routeOptions.length === 0) {
      if (selectedRouteIndex !== 0) setSelectedRouteIndex(0)
      return
    }
    if (selectedRouteIndex > routeOptions.length - 1) {
      setSelectedRouteIndex(0)
    }
  }, [routeOptions, selectedRouteIndex])

  useEffect(() => {
    if (activePage !== 'rider') {
      setMapWebGlError(null)
      hasAnnouncedDriverArrivalRef.current = false
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {
          /* ignore */
        }
        mapRef.current = null
        pickupMarkerRef.current = null
        dropoffMarkerRef.current = null
        riderDriverMarkerRef.current = null
      }
    }
  }, [activePage])

  useEffect(() => {
    if (activePage !== 'rider' || !mapboxAccessToken || !authUser) {
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
            'This browser cannot use the map (WebGL unavailable). Try another browser, update your GPU drivers, or enable hardware acceleration in settings.',
          )
          return undefined
        }
      } catch {
        /* continue and let Map constructor surface errors */
      }
    }

    let map
    try {
      mapboxgl.accessToken = mapboxAccessToken
      const rc = riderCoordsRef.current
      map = new mapboxgl.Map({
        container,
        style: getBasemapStyleUrl(riderBasemapModeRef.current, darkModeRef.current),
        center: [rc.pickup.lng, rc.pickup.lat],
        zoom: 12,
        attributionControl: false,
        failIfMajorPerformanceCaveat: false,
      })
    } catch (err) {
      console.error(err)
      setMapWebGlError(
        'The map failed to start (often WebGL). Try disabling battery-saver / low-power mode, use a standard window (not some embedded webviews), or another browser.',
      )
      return undefined
    }

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'top-left')
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')

    const pickupMarker = new mapboxgl.Marker({ color: '#9d3733', draggable: true })
      .setLngLat([riderCoordsRef.current.pickup.lng, riderCoordsRef.current.pickup.lat])
      .addTo(map)

    const dropoffMarker = new mapboxgl.Marker({ color: '#111111', draggable: true })
      .setLngLat([riderCoordsRef.current.dropoff.lng, riderCoordsRef.current.dropoff.lat])
      .addTo(map)

    map.on('load', () => {
      const ro = routeOptionsRef.current
      const idx = selectedRouteIndexRef.current
      const selected =
        ro[idx]?.feature ??
        ro[0]?.feature ??
        createLineFeature([
          [riderCoordsRef.current.pickup.lng, riderCoordsRef.current.pickup.lat],
          [riderCoordsRef.current.dropoff.lng, riderCoordsRef.current.dropoff.lat],
        ])
      ensureRouteLayer(map, createFeatureCollection(ro.map((option) => option.feature)), selected)
      if (riderTrafficOnRef.current) {
        addTrafficToMap(map)
      }
    })

    pickupMarker.on('drag', () => {
      pickupFollowsDeviceGpsRef.current = false
      const next = pickupMarker.getLngLat()
      setRiderCoords((prev) => ({
        ...prev,
        pickup: { lat: Number(next.lat.toFixed(6)), lng: Number(next.lng.toFixed(6)) },
      }))
      setSelectedRouteIndex(0)
      setShowPickupSuggestions(false)
    })
    pickupMarker.on('dragend', async () => {
      const next = pickupMarker.getLngLat()
      const rawPickup = { lat: Number(next.lat.toFixed(6)), lng: Number(next.lng.toFixed(6)) }
      const nextPickup = await snapToRoadRef.current(rawPickup)
      setRiderCoords((prev) => ({
        ...prev,
        pickup: nextPickup,
      }))
      setShowPickupSuggestions(false)
      const placeName = await reverseGeocodeRef.current(nextPickup)
      if (placeName) {
        setRiderForm((prev) => ({ ...prev, pickupAddress: placeName }))
      }

      const ride = activeRideRef.current
      const token = authTokenRef.current
      if (token && ride?.id && ['REQUESTED', 'ACCEPTED'].includes(ride.status)) {
        try {
          const dropLl = dropoffMarker.getLngLat()
          const dropRaw = {
            lat: Number(dropLl.lat.toFixed(6)),
            lng: Number(dropLl.lng.toFixed(6)),
          }
          const nextDrop = await snapToRoadRef.current(dropRaw)
          dropoffMarker.setLngLat([nextDrop.lng, nextDrop.lat])
          setRiderCoords((prev) => ({ ...prev, pickup: nextPickup, dropoff: nextDrop }))
          const pickupAddr = (placeName && placeName.trim()) || riderFormRef.current.pickupAddress.trim()
          const dropAddr = riderFormRef.current.dropoffAddress.trim()
          const updated = await updateRideLocations(token, ride.id, {
            pickupLat: nextPickup.lat,
            pickupLng: nextPickup.lng,
            pickupAddress: pickupAddr,
            dropoffLat: nextDrop.lat,
            dropoffLng: nextDrop.lng,
            dropoffAddress: dropAddr,
          })
          setActiveRide(updated)
        } catch (e) {
          setRiderMessage(e.message || 'Could not update ride location for drivers.')
        }
      }
    })
    dropoffMarker.on('drag', () => {
      const next = dropoffMarker.getLngLat()
      setRiderCoords((prev) => ({
        ...prev,
        dropoff: { lat: Number(next.lat.toFixed(6)), lng: Number(next.lng.toFixed(6)) },
      }))
      setSelectedRouteIndex(0)
      setShowDropoffSuggestions(false)
    })
    dropoffMarker.on('dragend', async () => {
      const next = dropoffMarker.getLngLat()
      const rawDropoff = { lat: Number(next.lat.toFixed(6)), lng: Number(next.lng.toFixed(6)) }
      const nextDropoff = await snapToRoadRef.current(rawDropoff)
      setRiderCoords((prev) => ({
        ...prev,
        dropoff: nextDropoff,
      }))
      setShowDropoffSuggestions(false)
      const placeName = await reverseGeocodeRef.current(nextDropoff)
      if (placeName) {
        setRiderForm((prev) => ({ ...prev, dropoffAddress: placeName }))
      }

      const ride = activeRideRef.current
      const token = authTokenRef.current
      if (token && ride?.id && ['REQUESTED', 'ACCEPTED'].includes(ride.status)) {
        try {
          const pickLl = pickupMarker.getLngLat()
          const pickRaw = {
            lat: Number(pickLl.lat.toFixed(6)),
            lng: Number(pickLl.lng.toFixed(6)),
          }
          const nextPick = await snapToRoadRef.current(pickRaw)
          pickupMarker.setLngLat([nextPick.lng, nextPick.lat])
          setRiderCoords((prev) => ({ ...prev, pickup: nextPick }))
          const pickupAddr = riderFormRef.current.pickupAddress.trim()
          const dropAddr = (placeName && placeName.trim()) || riderFormRef.current.dropoffAddress.trim()
          const updated = await updateRideLocations(token, ride.id, {
            pickupLat: nextPick.lat,
            pickupLng: nextPick.lng,
            pickupAddress: pickupAddr,
            dropoffLat: nextDropoff.lat,
            dropoffLng: nextDropoff.lng,
            dropoffAddress: dropAddr,
          })
          setActiveRide(updated)
        } catch (e) {
          setRiderMessage(e.message || 'Could not update ride location for drivers.')
        }
      }
    })

    mapRef.current = map
    pickupMarkerRef.current = pickupMarker
    dropoffMarkerRef.current = dropoffMarker

    return () => {
      try {
        map.remove()
      } catch {
        /* ignore */
      }
      mapRef.current = null
      pickupMarkerRef.current = null
      dropoffMarkerRef.current = null
      riderDriverMarkerRef.current = null
    }
  }, [activePage, mapboxAccessToken, authUser, ensureRouteLayer])

  useEffect(() => {
    if (!mapRef.current || activePage !== 'rider') return

    mapRef.current.setStyle(getBasemapStyleUrl(riderBasemapMode, darkMode))
    mapRef.current.once('style.load', () => {
      const map = mapRef.current
      if (!map) return
      const ro = routeOptionsRef.current
      const idx = selectedRouteIndexRef.current
      const rc = riderCoordsRef.current
      const selected =
        ro[idx]?.feature ??
        ro[0]?.feature ??
        createLineFeature([
          [rc.pickup.lng, rc.pickup.lat],
          [rc.dropoff.lng, rc.dropoff.lat],
        ])
      ensureRouteLayer(map, createFeatureCollection(ro.map((option) => option.feature)), selected)
      if (riderTrafficOnRef.current) {
        addTrafficToMap(map)
      }
    })
  }, [activePage, darkMode, riderBasemapMode, ensureRouteLayer])

  useEffect(() => {
    if (!mapRef.current || activePage !== 'rider') return
    const map = mapRef.current
    const applyTraffic = () => {
      if (riderTrafficOn) addTrafficToMap(map)
      else removeTrafficFromMap(map)
    }
    if (map.isStyleLoaded()) {
      applyTraffic()
    } else {
      map.once('style.load', applyTraffic)
    }
  }, [riderTrafficOn, activePage])

  useEffect(() => {
    if (!mapRef.current || !pickupMarkerRef.current || !dropoffMarkerRef.current) return
    pickupMarkerRef.current.setLngLat([riderCoords.pickup.lng, riderCoords.pickup.lat])
    dropoffMarkerRef.current.setLngLat([riderCoords.dropoff.lng, riderCoords.dropoff.lat])
  }, [riderCoords])

  useEffect(() => {
    if (!mapRef.current || activePage !== 'rider') return
    const optionsSource = mapRef.current.getSource(routeOptionsSourceIdRef.current)
    const selectedSource = mapRef.current.getSource(selectedRouteSourceIdRef.current)
    if (optionsSource && selectedSource) {
      optionsSource.setData(createFeatureCollection(routeOptionFeatures))
      selectedSource.setData(selectedRouteFeature)
    } else {
      const added = ensureRouteLayer(
        mapRef.current,
        createFeatureCollection(routeOptionFeatures),
        selectedRouteFeature,
      )
      if (!added) {
        mapRef.current.once('style.load', () => {
          ensureRouteLayer(
            mapRef.current,
            createFeatureCollection(routeOptionFeatures),
            selectedRouteFeature,
          )
        })
      }
    }
  }, [activePage, routeOptionFeatures, selectedRouteFeature, ensureRouteLayer])

  useEffect(() => {
    if (!mapRef.current || activePage !== 'rider') return
    const coordinates = selectedRouteFeature?.geometry?.coordinates
    if (!Array.isArray(coordinates) || coordinates.length < 2) return
    const bounds = new mapboxgl.LngLatBounds()
    coordinates.forEach((coord) => bounds.extend(coord))
    mapRef.current.fitBounds(bounds, { padding: 48, duration: 500, maxZoom: 14 })
  }, [activePage, selectedRouteFeature])

  useEffect(() => {
    if (!mapRef.current || activePage !== 'rider') return
    const map = mapRef.current

    const driverLat = riderLiveDriverCoords?.lat ?? activeRide?.driver?.driverProfile?.currentLat
    const driverLng = riderLiveDriverCoords?.lng ?? activeRide?.driver?.driverProfile?.currentLng
    const hasDriverCoords =
      typeof driverLat === 'number' &&
      Number.isFinite(driverLat) &&
      typeof driverLng === 'number' &&
      Number.isFinite(driverLng)

    const source = map.getSource(driverToPickupSourceIdRef.current)
    if (!hasDriverCoords) {
      hasAnnouncedDriverArrivalRef.current = false
      if (riderDriverMarkerRef.current) {
        riderDriverMarkerRef.current.remove()
        riderDriverMarkerRef.current = null
      }
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] })
      }
      return
    }

    if (!riderDriverMarkerRef.current) {
      const carIconEl = document.createElement('div')
      carIconEl.className = 'flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-[#22c55e] text-lg shadow-md'
      carIconEl.textContent = '🚗'
      riderDriverMarkerRef.current = new mapboxgl.Marker({ element: carIconEl })
        .setLngLat([driverLng, driverLat])
        .addTo(map)
    } else {
      riderDriverMarkerRef.current.setLngLat([driverLng, driverLat])
    }

    const shouldShowIncomingRoute =
      activeRide?.status === 'ACCEPTED' || activeRide?.status === 'STARTED'
    const emptyRoute = { type: 'FeatureCollection', features: [] }

    const now = Date.now()
    if (
      shouldShowIncomingRoute &&
      now - lastRiderVoiceUpdateRef.current >= 15000 &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      try {
        window.speechSynthesis.cancel()
        const utterance = new window.SpeechSynthesisUtterance(
          'Your driver is coming to pick you up.',
        )
        utterance.rate = 1
        utterance.pitch = 1
        window.speechSynthesis.speak(utterance)
        lastRiderVoiceUpdateRef.current = now
      } catch {
        /* ignore speech synthesis errors */
      }
    }

    const distanceToPickupKm = (() => {
      const toRadians = (value) => (value * Math.PI) / 180
      const earthRadiusKm = 6371
      const dLat = toRadians(activeRide.pickupLat - driverLat)
      const dLng = toRadians(activeRide.pickupLng - driverLng)
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(driverLat)) *
          Math.cos(toRadians(activeRide.pickupLat)) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      return earthRadiusKm * c
    })()

    if (distanceToPickupKm <= 0.1 && !hasAnnouncedDriverArrivalRef.current) {
      hasAnnouncedDriverArrivalRef.current = true
      setRiderMessage('Your driver has reached your pickup location.')
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel()
          const utterance = new window.SpeechSynthesisUtterance(
            'Your driver has arrived at your pickup location.',
          )
          utterance.rate = 1
          utterance.pitch = 1
          window.speechSynthesis.speak(utterance)
        } catch {
          /* ignore speech synthesis errors */
        }
      }
    } else if (distanceToPickupKm > 0.1) {
      hasAnnouncedDriverArrivalRef.current = false
    }

    const ensureLayer = (routeData) => {
      if (!map.getSource(driverToPickupSourceIdRef.current)) {
        map.addSource(driverToPickupSourceIdRef.current, {
          type: 'geojson',
          data: routeData,
        })
      } else {
        map.getSource(driverToPickupSourceIdRef.current).setData(routeData)
      }

      if (!map.getLayer(driverToPickupLayerIdRef.current)) {
        map.addLayer({
          id: driverToPickupLayerIdRef.current,
          type: 'line',
          source: driverToPickupSourceIdRef.current,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#22c55e',
            'line-width': 4,
            'line-opacity': 0.9,
          },
        })
      }
    }

    const drawDriverRoute = async () => {
      if (!shouldShowIncomingRoute) {
        if (map.isStyleLoaded()) {
          ensureLayer(emptyRoute)
        } else {
          map.once('style.load', () => ensureLayer(emptyRoute))
        }
        return
      }

      try {
        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${driverLng},${driverLat};${activeRide.pickupLng},${activeRide.pickupLat}?geometries=geojson&overview=full&steps=false&alternatives=false&access_token=${mapboxAccessToken}`,
        )
        if (!response.ok) {
          if (map.isStyleLoaded()) ensureLayer(emptyRoute)
          return
        }
        const data = await response.json()
        const coords = data?.routes?.[0]?.geometry?.coordinates
        if (!Array.isArray(coords) || coords.length < 2) {
          if (map.isStyleLoaded()) ensureLayer(emptyRoute)
          return
        }

        const routeData = {
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

        if (map.isStyleLoaded()) {
          ensureLayer(routeData)
        } else {
          map.once('style.load', () => ensureLayer(routeData))
        }
      } catch {
        if (map.isStyleLoaded()) ensureLayer(emptyRoute)
      }
    }

    void drawDriverRoute()
  }, [activePage, activeRide, mapboxAccessToken, riderLiveDriverCoords])

  useEffect(() => {
    if (activePage !== 'rider' || !mapRef.current) return
    const map = mapRef.current
    const onResize = () => map.resize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [activePage])

  const handleCancelRide = async () => {
    if (!authToken || !activeRide?.id) return
    try {
      setRiderBusy(true)
      setRiderMessage('')
      await cancelRide(authToken, activeRide.id)
      setRiderMessage('Active ride cancelled.')
      await fetchRiderData()
    } catch (error) {
      setRiderMessage(error.message || 'Unable to cancel ride.')
      setRiderBusy(false)
    }
  }

  const requestPreferredDriver = useCallback(
    async (preferredDriverId) => {
      if (!authToken) throw new Error('Sign in required')
      if (!preferredDriverId) throw new Error('Please select a driver')
      if (!riderForm.pickupAddress.trim() || !riderForm.dropoffAddress.trim()) {
        throw new Error('Please add pickup and dropoff locations.')
      }

      // Use the exact trip coordinates shown on the map (markers / route),
      // not a fresh search from the text inputs.
      let nextPickup = riderCoords.pickup
      let nextDropoff = riderCoords.dropoff
      ;[nextPickup, nextDropoff] = await Promise.all([
        snapToRoad(nextPickup),
        snapToRoad(nextDropoff),
      ])
      const [resolvedPickupAddress, resolvedDropoffAddress] = await Promise.all([
        reverseGeocode(nextPickup),
        reverseGeocode(nextDropoff),
      ])
      const finalPickupAddress =
        (typeof resolvedPickupAddress === 'string' && resolvedPickupAddress.trim()) ||
        riderForm.pickupAddress.trim()
      const finalDropoffAddress =
        (typeof resolvedDropoffAddress === 'string' && resolvedDropoffAddress.trim()) ||
        riderForm.dropoffAddress.trim()

      setRiderCoords({ pickup: nextPickup, dropoff: nextDropoff })
      setRiderForm((prev) => ({
        ...prev,
        pickupAddress: finalPickupAddress,
        dropoffAddress: finalDropoffAddress,
      }))
      const fareEstimate = routeOptions[selectedRouteIndex]?.priceUsd
      return createRide(authToken, {
        pickupAddress: finalPickupAddress,
        dropoffAddress: finalDropoffAddress,
        pickupLat: nextPickup.lat,
        pickupLng: nextPickup.lng,
        dropoffLat: nextDropoff.lat,
        dropoffLng: nextDropoff.lng,
        ...(fareEstimate != null ? { fareEstimate } : {}),
        preferredDriverId,
        paymentMethod: 'CASH',
        paymentStatus: 'PENDING',
      })
    },
    [
      authToken,
      riderForm.pickupAddress,
      riderForm.dropoffAddress,
      riderCoords.pickup,
      riderCoords.dropoff,
      routeOptions,
      selectedRouteIndex,
      snapToRoad,
      reverseGeocode,
    ],
  )

  const finalizeRidePayment = useCallback(
    async (rideId, paymentPayload) => {
      if (!authToken) throw new Error('Sign in required')
      return setRidePayment(authToken, rideId, paymentPayload)
    },
    [authToken],
  )

  return (
    <main
      className={`min-h-screen transition-colors duration-300 ${
        darkMode ? 'bg-black text-[#f2e3bb]' : 'bg-[#f2e3bb] text-[#2d100f]'
      }`}
    >
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md transition-colors duration-300 ${
          darkMode
            ? 'border-[#9d3733]/40 bg-black/85'
            : 'border-[#9d3733]/35 bg-white/95'
        }`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img src={icon} alt="JO icon" className="h-14 w-14 rounded-full sm:h-16 sm:w-16" />
            
          </div>
          <nav className="hidden items-center gap-3 text-sm font-medium md:flex">
            <button
              type="button"
              onClick={() => navigateToPage('home')}
              className={`rounded-full px-3 py-1.5 transition ${
                activePage === 'home'
                  ? 'bg-[#9d3733] text-[#f2e3bb]'
                  : 'hover:bg-[#9d3733]/10 hover:text-[#9d3733]'
              }`}
            >
              Home
            </button>
            {authUser?.role !== 'ADMIN' && (
              <button
                type="button"
                onClick={() => navigateToPage('rider')}
                className={`rounded-full px-3 py-1.5 transition ${
                  activePage === 'rider'
                    ? 'bg-[#9d3733] text-[#f2e3bb]'
                    : 'hover:bg-[#9d3733]/10 hover:text-[#9d3733]'
                }`}
              >
                Ride
              </button>
            )}
            {authUser?.role === 'DRIVER' && (
              <button
                type="button"
                onClick={() => navigateToPage('driver')}
                className={`rounded-full px-3 py-1.5 transition ${
                  activePage === 'driver'
                    ? 'bg-[#9d3733] text-[#f2e3bb]'
                    : 'hover:bg-[#9d3733]/10 hover:text-[#9d3733]'
                }`}
              >
                Drive
              </button>
            )}
            {authUser?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => navigateToPage('admin')}
                className={`rounded-full px-3 py-1.5 transition ${
                  activePage === 'admin'
                    ? 'bg-[#9d3733] text-[#f2e3bb]'
                    : 'hover:bg-[#9d3733]/10 hover:text-[#9d3733]'
                }`}
              >
                Admin
              </button>
            )}
            <button
              type="button"
              onClick={() => navigateToPage('about')}
              className={`rounded-full px-3 py-1.5 transition ${
                activePage === 'about'
                  ? 'bg-[#9d3733] text-[#f2e3bb]'
                  : 'hover:bg-[#9d3733]/10 hover:text-[#9d3733]'
              }`}
            >
              About
            </button>
            <button
              type="button"
              onClick={() => navigateToPage('contact')}
              className={`rounded-full px-3 py-1.5 transition ${
                activePage === 'contact'
                  ? 'bg-[#9d3733] text-[#f2e3bb]'
                  : 'hover:bg-[#9d3733]/10 hover:text-[#9d3733]'
              }`}
            >
              Contact
            </button>
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border transition md:hidden ${
                darkMode
                  ? 'border-[#9d3733]/50 bg-[#111] text-[#f2e3bb]'
                  : 'border-[#9d3733]/40 bg-[#fff8eb] text-[#9d3733]'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileNavOpen ? (
                  <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                )}
              </svg>
            </button>
            {authUser ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className={`flex items-center gap-1.5 rounded-full border px-1.5 py-1 pr-2 sm:gap-2 sm:px-2 sm:pr-3 transition ${
                    darkMode
                      ? 'border-[#9d3733]/50 bg-[#111]'
                      : 'border-[#9d3733]/40 bg-[#fff8eb]'
                  }`}
                >
                  <img
                    src={authUser.avatarUrl ?? icon}
                    alt={authUser.name}
                    className="h-7 w-7 rounded-full border border-[#9d3733]/50 object-cover sm:h-8 sm:w-8"
                    referrerPolicy="no-referrer"
                  />
                  <span className="hidden text-sm font-semibold md:inline">
                    {authUser.name}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 transition-transform ${
                      userMenuOpen ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {userMenuOpen && (
                  <div
                    className={`absolute right-0 mt-2 w-52 rounded-xl border p-2 shadow-lg ${
                      darkMode
                        ? 'border-[#9d3733]/50 bg-[#111] text-[#f2e3bb]'
                        : 'border-[#9d3733]/35 bg-[#fff8eb] text-[#2d100f]'
                    }`}
                  >
                    <div className="border-b border-[#9d3733]/30 px-3 py-2">
                      <p className="text-sm font-bold">{authUser.name}</p>
                      <p className="text-xs opacity-80">{authUser.email}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const dest =
                          authUser?.role === 'ADMIN'
                            ? 'admin'
                            : authUser?.role === 'DRIVER'
                              ? 'driver'
                              : 'rider'
                        navigateToPage(dest)
                        setUserMenuOpen(false)
                      }}
                      className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[#9d3733]/15"
                    >
                      {authUser?.role === 'ADMIN'
                        ? 'Admin dashboard'
                        : authUser?.role === 'DRIVER'
                          ? 'Driver dashboard'
                          : 'My rides'}
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="mt-1 w-full rounded-lg bg-[#9d3733] px-3 py-2 text-left text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthError('')
                  setAuthModalOpen(true)
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-bold transition sm:px-4 sm:py-2 ${
                  darkMode
                    ? 'border-[#9d3733]/50 bg-[#111] text-[#f2e3bb] hover:border-[#f2e3bb]/40'
                    : 'border-[#9d3733]/45 bg-[#fff8eb] text-[#842f2b] hover:border-[#9d3733]'
                }`}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
        {mobileNavOpen && (
          <div
            className={`mx-auto mb-3 w-[calc(100%-1.5rem)] max-w-6xl rounded-2xl border p-2 shadow-lg md:hidden ${
              darkMode
                ? 'border-[#9d3733]/45 bg-[#0f0f0f] text-[#f2e3bb]'
                : 'border-[#9d3733]/35 bg-white/95 text-[#2d100f]'
            }`}
          >
            <div className="grid grid-cols-2 gap-2 text-sm">
              <button
                type="button"
                onClick={() => navigateToPage('home')}
                className={`rounded-xl px-3 py-2 text-left font-semibold ${
                  activePage === 'home' ? 'bg-[#9d3733] text-[#f2e3bb]' : 'hover:bg-[#9d3733]/10'
                }`}
              >
                Home
              </button>
              {authUser?.role !== 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => navigateToPage('rider')}
                  className={`rounded-xl px-3 py-2 text-left font-semibold ${
                    activePage === 'rider' ? 'bg-[#9d3733] text-[#f2e3bb]' : 'hover:bg-[#9d3733]/10'
                  }`}
                >
                  Ride
                </button>
              )}
              {authUser?.role === 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => navigateToPage('admin')}
                  className={`rounded-xl px-3 py-2 text-left font-semibold ${
                    activePage === 'admin' ? 'bg-[#9d3733] text-[#f2e3bb]' : 'hover:bg-[#9d3733]/10'
                  }`}
                >
                  Admin
                </button>
              )}
              {authUser?.role === 'DRIVER' && (
                <button
                  type="button"
                  onClick={() => navigateToPage('driver')}
                  className={`rounded-xl px-3 py-2 text-left font-semibold ${
                    activePage === 'driver' ? 'bg-[#9d3733] text-[#f2e3bb]' : 'hover:bg-[#9d3733]/10'
                  }`}
                >
                  Drive
                </button>
              )}
              <button
                type="button"
                onClick={() => navigateToPage('about')}
                className={`rounded-xl px-3 py-2 text-left font-semibold ${
                  activePage === 'about' ? 'bg-[#9d3733] text-[#f2e3bb]' : 'hover:bg-[#9d3733]/10'
                }`}
              >
                About
              </button>
              <button
                type="button"
                onClick={() => navigateToPage('contact')}
                className={`rounded-xl px-3 py-2 text-left font-semibold ${
                  activePage === 'contact' ? 'bg-[#9d3733] text-[#f2e3bb]' : 'hover:bg-[#9d3733]/10'
                }`}
              >
                Contact
              </button>
            </div>
          </div>
        )}
      </header>

      {activePage === 'profile' ? (
        <section className="mx-auto w-full max-w-6xl px-6 pb-14 pt-28 md:pt-32">
          <div
            className={`rounded-2xl border p-6 sm:p-8 ${
              darkMode
                ? 'border-[#9d3733]/40 bg-[#0f0f0f]'
                : 'border-[#9d3733]/30 bg-[#fff8eb]'
            }`}
          >
            <div className="mb-6 flex items-center justify-between gap-3">
              <h1
                className={`font-brand text-3xl font-bold ${
                  darkMode ? 'text-white' : 'text-[#2d100f]'
                }`}
              >
                My Profile
              </h1>
              <button
                type="button"
                onClick={() => navigateToPage('home')}
                className="rounded-lg border border-[#9d3733]/50 px-4 py-2 text-sm font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10"
              >
                Back to home
              </button>
            </div>

            {!authUser ? (
              <p className="text-sm text-[#9d3733]">Please sign in to view your profile.</p>
            ) : (
              <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                <div className="flex flex-col items-center rounded-xl border border-[#9d3733]/35 p-5">
                  <img
                    src={authUser.avatarUrl ?? icon}
                    alt={authUser.name}
                    className="h-24 w-24 rounded-full border border-[#9d3733]/50 object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <p className="mt-3 text-lg font-bold">{authUser.name}</p>
                  <p className="text-sm opacity-80">{authUser.role}</p>
                </div>

                <form onSubmit={handleProfileSave} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Email</label>
                    <input
                      type="email"
                      value={authUser.email ?? ''}
                      disabled
                      className="w-full rounded-lg border border-[#9d3733]/30 bg-transparent px-4 py-3 text-sm opacity-80"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Full name</label>
                    <input
                      type="text"
                      value={profileForm.name}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      className={`w-full rounded-lg border px-4 py-3 text-sm outline-none ${
                        darkMode
                          ? 'border-[#9d3733]/50 bg-black'
                          : 'border-[#9d3733]/40 bg-white'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Phone</label>
                    <input
                      type="text"
                      value={profileForm.phone}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="Add phone number"
                      className={`w-full rounded-lg border px-4 py-3 text-sm outline-none ${
                        darkMode
                          ? 'border-[#9d3733]/50 bg-black'
                          : 'border-[#9d3733]/40 bg-white'
                      }`}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={profileBusy}
                    className="font-accent rounded-lg bg-[#9d3733] px-5 py-3 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {profileBusy ? 'Saving...' : 'Save changes'}
                  </button>
                  {profileMessage && (
                    <p className="text-sm text-[#9d3733]">{profileMessage}</p>
                  )}
                </form>
              </div>
            )}
          </div>
        </section>
      ) : activePage === 'admin' ? (
        <AdminPage
          darkMode={darkMode}
          authUser={authUser}
          authToken={authToken}
          navigateToPage={navigateToPage}
          setAuthUser={setAuthUser}
        />
      ) : activePage === 'driver' ? (
        <DriverPage
          darkMode={darkMode}
          authUser={authUser}
          authToken={authToken}
          mapboxAccessToken={mapboxAccessToken}
          dashboardBusy={riderBusy}
          dashboardMessage={riderMessage}
          activeRide={activeRide}
          rideHistory={rideHistory}
          fetchRideDashboard={fetchRiderData}
          setActiveRide={setActiveRide}
          navigateToPage={navigateToPage}
          setAuthUser={setAuthUser}
        />
      ) : activePage === 'rider' ? (
        <RiderPage
          darkMode={darkMode}
          authUser={authUser}
          authToken={authToken}
          riderBusy={riderBusy}
          riderMessage={riderMessage}
          riderForm={riderForm}
          setRiderForm={setRiderForm}
          riderCoords={riderCoords}
          pickupSuggestions={pickupSuggestions}
          dropoffSuggestions={dropoffSuggestions}
          pickupSearchBusy={pickupSearchBusy}
          dropoffSearchBusy={dropoffSearchBusy}
          showPickupSuggestions={showPickupSuggestions}
          showDropoffSuggestions={showDropoffSuggestions}
          handleRiderLocationInput={handleRiderLocationInput}
          handleSelectRiderLocation={handleSelectRiderLocation}
          setShowPickupSuggestions={setShowPickupSuggestions}
          setShowDropoffSuggestions={setShowDropoffSuggestions}
          routeOptions={routeOptions}
          selectedRouteIndex={selectedRouteIndex}
          setSelectedRouteIndex={setSelectedRouteIndex}
          mapboxAccessToken={mapboxAccessToken}
          mapWebGlError={mapWebGlError}
          mapContainerRef={mapContainerRef}
          fetchRiderData={fetchRiderData}
          setActiveRide={setActiveRide}
          activeRide={activeRide}
          rideHistory={rideHistory}
          requestPreferredDriver={requestPreferredDriver}
          finalizeRidePayment={finalizeRidePayment}
          setRiderMessage={setRiderMessage}
          handleCancelRide={handleCancelRide}
          navigateToPage={navigateToPage}
        />
      ) : activePage === 'about' ? (
        <AboutPage navigateToPage={navigateToPage} />
      ) : activePage === 'contact' ? (
        <ContactPage navigateToPage={navigateToPage} />
      ) : (
        <>
      <div className="text-[#2d100f]">
        <section
          className="overflow-x-hidden pb-10 pt-24 sm:pt-28"
          style={{ backgroundColor: WELCOME_CREAM }}
        >
            <div
              id="home-hero"
              className="relative scroll-mt-28 w-full overflow-hidden"
              style={{ backgroundColor: WELCOME_CREAM }}
            >
              <div className="relative z-[1] mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8 xl:max-w-[1180px]">
                <div className="grid grid-cols-1 gap-10 py-8 sm:py-10 lg:grid-cols-2 lg:items-center lg:gap-8 lg:py-10 xl:gap-10 lg:min-h-[min(88vh,820px)]">
                <div className="flex justify-center lg:justify-end lg:pr-1 xl:pr-3">
                  <div
                    className="w-full max-w-[28rem] rounded-[1.25rem] px-7 py-8 shadow-[0_4px_32px_-14px_rgba(45,16,16,0.14)] sm:rounded-3xl sm:px-8 sm:py-10"
                    style={{ backgroundColor: WELCOME_CONTENT_PANEL_BG }}
                  >
                  <h1 className="font-brand text-[2rem] font-bold leading-[1.1] tracking-tight text-[#3d1212] sm:text-[2.75rem] sm:leading-[1.08]">
                    <span className="text-[#4a1515]">Ride in Luxury.</span>
                    <br />
                    <span className="text-[#96724a]">Arrive in Style.</span>
                  </h1>
                  <p className="mt-6 max-w-md text-[0.98rem] font-medium leading-[1.65] text-[#3d2a28] sm:text-[1.0625rem]">
                    We use premium vehicles to ensure your journey is comfortable, safe, and always on
                    time.
                  </p>

                  <div className="mt-7 rounded-2xl bg-white p-5 shadow-[0_2px_20px_-6px_rgba(45,16,16,0.08)] sm:p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#4a1515] text-white shadow-sm">
                        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M12 3 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-4Z" strokeLinejoin="round" />
                          <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.95rem] font-semibold leading-snug text-[#4a1515]">Chevrolet Suburban</p>
                        <p className="mt-0.5 text-sm font-medium text-[#96724a]">High Country</p>
                        <p className="mt-1 text-xs font-medium text-[#5a4540]">Full-size luxury SUV</p>
                      </div>
                    </div>
                  </div>

                  {authUser?.role !== 'ADMIN' && (
                    <button
                      type="button"
                      onClick={() => navigateToPage('rider')}
                      className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4a1515] px-6 py-3.5 text-sm font-bold tracking-wide text-white shadow-[0_4px_24px_-10px_rgba(74,21,21,0.45)] transition hover:bg-[#3d1212] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a1515] focus-visible:ring-offset-2 sm:mt-9 sm:py-4"
                    >
                      Book ride
                      <span aria-hidden>→</span>
                    </button>
                  )}

                  {authBusy && !authModalOpen && (
                    <p className="mt-6 text-sm text-[#9d3733]">Signing in…</p>
                  )}
                  {authError && !authModalOpen && (
                    <p className="mt-6 text-sm text-[#9d3733]">{authError}</p>
                  )}
                  </div>
                </div>

                <div
                  className="relative flex min-h-[260px] w-full min-w-0 items-center justify-center lg:min-h-0 lg:justify-start lg:pl-1 xl:pl-3"
                  style={{ backgroundColor: WELCOME_CREAM }}
                >
                  <div
                    className="relative isolate h-[min(44vh,330px)] w-full min-h-[240px] max-w-[min(100%,26rem)] overflow-hidden rounded-3xl shadow-[0_12px_44px_-18px_rgba(45,16,16,0.16)] sm:max-w-[28rem] sm:rounded-[1.35rem] lg:h-[min(58vh,508px)] lg:max-w-[min(100%,36rem)] lg:min-h-[300px] xl:max-w-[38rem]"
                    role="region"
                    aria-roledescription="carousel"
                    aria-label="Service highlights"
                    onTouchStart={(e) => {
                      welcomeTouchStartXRef.current = e.targetTouches[0].clientX
                    }}
                    onTouchEnd={(e) => {
                      const start = welcomeTouchStartXRef.current
                      welcomeTouchStartXRef.current = null
                      if (start == null || WELCOME_HERO_SLIDES.length < 2) return
                      const dx = e.changedTouches[0].clientX - start
                      if (dx > 56) {
                        setWelcomeSlideIndex(
                          (i) =>
                            (i - 1 + WELCOME_HERO_SLIDES.length) % WELCOME_HERO_SLIDES.length,
                        )
                      } else if (dx < -56) {
                        setWelcomeSlideIndex((i) => (i + 1) % WELCOME_HERO_SLIDES.length)
                      }
                    }}
                  >
                    <div className="relative h-full w-full min-h-[inherit] overflow-hidden rounded-[inherit]">
                      <div
                        className="flex h-full w-full will-change-transform transition-transform duration-500 ease-out motion-reduce:transition-none [transition-timing-function:cubic-bezier(0.33,1,0.68,1)]"
                        style={{
                          transform: `translate3d(-${welcomeSlideIndex * 100}%,0,0)`,
                        }}
                      >
                        {WELCOME_HERO_SLIDES.map((slide, i) => (
                          <div
                            key={slide.src}
                            className="relative h-full w-full min-w-[100%] max-w-[100%] shrink-0 grow-0 overflow-hidden rounded-[inherit]"
                          >
                            <img
                              src={slide.src}
                              alt={slide.alt}
                              draggable={false}
                              className="absolute inset-0 z-0 h-full w-full object-cover"
                              style={{ objectPosition: slide.objectPosition }}
                            />
                            <div
                              className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/65 via-black/28 to-black/78"
                              aria-hidden
                            />
                            <div
                              key={
                                welcomeSlideIndex === i
                                  ? `hero-cap-${welcomeSlideIndex}`
                                  : `hero-cap-idle-${i}`
                              }
                              className="relative z-10 flex h-full min-h-[240px] w-full flex-col items-center justify-center px-5 py-9 text-center sm:min-h-[280px] sm:px-9 sm:py-11"
                            >
                              <p className="font-accent text-[11px] font-bold uppercase tracking-[0.28em] text-[#e8d5c4] sm:text-xs">
                                {slide.kicker}
                              </p>
                              <div
                                className="mx-auto mt-3 h-0.5 max-w-[10rem] bg-gradient-to-r from-transparent via-[#f5ebe0] to-transparent"
                                aria-hidden
                              />
                              <h3 className="font-brand mt-4 max-w-xl text-lg font-bold leading-snug text-white sm:text-2xl sm:leading-snug [text-shadow:0_2px_28px_rgba(0,0,0,0.9)]">
                                {slide.title}
                              </h3>
                              <p className="mt-4 max-w-md text-sm font-medium leading-relaxed text-[#f5f0ea] sm:text-[1.02rem] [text-shadow:0_1px_16px_rgba(0,0,0,0.95)]">
                                {slide.body}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {WELCOME_HERO_SLIDES.length > 1 ? (
                      <div
                        className="absolute bottom-3 left-0 right-0 z-40 flex justify-center gap-2"
                        role="tablist"
                        aria-label="Hero slides"
                      >
                        {WELCOME_HERO_SLIDES.map((slide, i) => (
                          <button
                            key={slide.src}
                            type="button"
                            role="tab"
                            aria-selected={i === welcomeSlideIndex}
                            aria-label={`Show slide ${i + 1}`}
                            className={`h-2 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5ebe0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1412] ${
                              i === welcomeSlideIndex
                                ? 'w-8 bg-[#f5ebe0] shadow-[0_0_0_1px_rgba(245,235,224,0.35)]'
                                : 'w-2 bg-white/35 hover:bg-white/55'
                            }`}
                            onClick={() => setWelcomeSlideIndex(i)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                </div>
              </div>
            </div>

            <div
              className="mx-auto w-full max-w-[1180px] px-4 pb-6 pt-2 sm:px-6 sm:pb-8 lg:px-8"
              style={{ backgroundColor: WELCOME_CREAM }}
            >
              <div
                id="home-fleet"
                className="scroll-mt-28 rounded-3xl border border-[#e8dfd6] bg-white p-6 shadow-[0_4px_40px_-14px_rgba(45,16,16,0.1)] sm:p-8"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                  <div>
                    <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
                      Vehicle highlights
                    </p>
                    <h2 className="font-brand mt-2 text-xl font-bold leading-tight text-[#3d1212] sm:text-2xl">
                      Everything included with your Suburban
                    </h2>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                  {[
                    {
                      label: 'Up to 7 Passengers',
                      icon: (
                        <path
                          d="M16 11a3 3 0 1 0-6 0M8 11a3 3 0 1 0-6 0M4 20v-1a3 3 0 0 1 3-3h1m10 4v-1a3 3 0 0 0-3-3h-1"
                          strokeLinecap="round"
                        />
                      ),
                    },
                    {
                      label: 'Large Luggage Capacity',
                      icon: (
                        <>
                          <path d="M6 8h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8Z" />
                          <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
                        </>
                      ),
                    },
                    {
                      label: 'Leather Seats & Climate Control',
                      icon: (
                        <>
                          <path d="M4 14h16v4H4z" />
                          <path d="M6 14V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v5" />
                        </>
                      ),
                    },
                    {
                      label: 'Free WiFi',
                      icon: (
                        <>
                          <path d="M5 12.55a11 11 0 0 1 14.08 0" strokeLinecap="round" />
                          <path d="M8.53 16.09a7 7 0 0 1 6.94 0" strokeLinecap="round" />
                          <path d="M12 20h.01" strokeLinecap="round" />
                        </>
                      ),
                    },
                    {
                      label: 'Entertainment TVs',
                      icon: (
                        <>
                          <rect x="3" y="5" width="18" height="12" rx="1.5" />
                          <path d="M8 21h8" strokeLinecap="round" />
                          <path d="M12 17v4" strokeLinecap="round" />
                        </>
                      ),
                    },
                    {
                      label: 'Snacks & Water',
                      icon: (
                        <>
                          <path d="M8 4h8l-1 14H9L8 4Z" />
                          <path d="M10 8h4" strokeLinecap="round" />
                          <path d="M6 20c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2" strokeLinecap="round" />
                        </>
                      ),
                    },
                    {
                      label: 'Charging Ports',
                      icon: (
                        <path
                          d="M13 2 8 14h5l-1 8 7-14h-5l1-6Z"
                          strokeLinejoin="round"
                        />
                      ),
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex flex-col items-center gap-3 rounded-2xl bg-[#FFFCF9] px-3 py-4 text-center ring-1 ring-[#e8dfd6]/80 sm:px-4 sm:py-5"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-[0_2px_12px_-4px_rgba(45,16,16,0.12)]">
                        <svg
                          className="h-5 w-5 text-[#4a1515]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          aria-hidden
                        >
                          {item.icon}
                        </svg>
                      </div>
                      <p className="text-[11px] font-semibold leading-snug text-[#4b2220] sm:text-xs">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
                {authUser?.role !== 'ADMIN' && (
                  <div className="mt-6 flex flex-col gap-3 border-t border-[#e8dfd6] pt-6 sm:flex-row sm:flex-wrap sm:justify-end">
                    <button
                      type="button"
                      onClick={() => navigateToPage('rider')}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4a1515] px-6 py-3.5 text-sm font-bold text-white shadow-[0_4px_20px_-8px_rgba(74,21,21,0.4)] transition hover:bg-[#3d1212] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a1515] focus-visible:ring-offset-2 sm:order-2 sm:w-auto sm:min-w-[200px]"
                    >
                      Book this vehicle
                      <span aria-hidden>→</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateToPage('rider')}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#4a1515] bg-transparent px-6 py-3.5 text-sm font-bold text-[#4a1515] transition hover:bg-[#4a1515]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a1515] focus-visible:ring-offset-2 sm:order-1 sm:w-auto sm:min-w-[200px]"
                    >
                      Book ride
                    </button>
                  </div>
                )}
              </div>
            </div>
        </section>

        <section
          id="home-services"
          className="scroll-mt-28 pb-14 pt-4 sm:pt-6"
          style={{ backgroundColor: WELCOME_CREAM }}
        >
          <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
                The JO standard
              </p>
              <h2 className="font-brand mt-2 text-2xl font-bold text-[#3d1212] sm:text-3xl">
                Service you can count on
              </h2>
              <p className="mt-3 text-sm font-medium leading-relaxed text-[#5a4540] sm:text-base">
                From booking to drop-off, we focus on safety, comfort, and clear communication.
              </p>
            </div>
            <div className="mt-10 flex flex-wrap justify-center gap-5 sm:gap-6">
              {[
                {
                  title: 'Safe & reliable',
                  body: 'Your safety is our priority.',
                  icon: (
                    <path d="M12 3 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-4Z" strokeLinejoin="round" />
                  ),
                },
                {
                  title: 'Professional drivers',
                  body: 'Experienced, courteous, and background-checked.',
                  icon: (
                    <>
                      <circle cx="12" cy="8" r="3" />
                      <path d="M5 20v-1a7 7 0 0 1 14 0v1" strokeLinecap="round" />
                    </>
                  ),
                },
                {
                  title: 'Always on time',
                  body: 'Punctual service, every time.',
                  icon: (
                    <>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v6l4 2" strokeLinecap="round" />
                    </>
                  ),
                },
                {
                  title: 'Premium comfort',
                  body: 'Luxury vehicles for a first-class experience.',
                  icon: <path d="M5 16 3 8l2-2 2 10h12l2-10 2 2-2 8H5Z" strokeLinejoin="round" />,
                },
                {
                  title: '24/7 support',
                  body: "We're here for you anytime.",
                  icon: (
                    <>
                      <path d="M22 16.92v2a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h2a2 2 0 0 1 2 1.72c.12.81.3 1.59.54 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.11a2 2 0 0 1 2.11-.45c.75.24 1.53.42 2.34.54A2 2 0 0 1 22 16.92Z" />
                      <circle cx="18" cy="6" r="3.25" />
                      <path d="M18 4.25V6l1.25 1.25" strokeLinecap="round" />
                    </>
                  ),
                },
              ].map((item) => (
                <article
                  key={item.title}
                  className="flex w-full max-w-[20.5rem] flex-1 flex-col rounded-2xl border border-[#e8dfd6] bg-white p-6 text-center shadow-[0_2px_24px_-12px_rgba(45,16,16,0.08)] sm:min-h-[200px] sm:max-w-[22rem] sm:p-7"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFFCF9] ring-1 ring-[#e8dfd6]/80">
                    <svg
                      className="h-7 w-7 text-[#a68966]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden
                    >
                      {item.icon}
                    </svg>
                  </div>
                  <h3 className="font-brand mt-4 text-base font-bold text-[#4a1515] sm:text-lg">{item.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[#4b2220]">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

      </div>

      <section
        id="home-how-it-works"
        className="scroll-mt-28 pb-16 pt-2 sm:pb-20"
        style={{ backgroundColor: darkMode ? '#0c0b0a' : WELCOME_CREAM }}
      >
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div
            className={`rounded-3xl border p-6 shadow-[0_4px_40px_-14px_rgba(45,16,16,0.1)] transition-colors sm:p-9 lg:p-10 ${
              darkMode
                ? 'border-[#9d3733]/35 bg-[#0f0f0f]'
                : 'border-[#e8dfd6] bg-white'
            }`}
          >
            <div className="mx-auto max-w-3xl text-center lg:mx-0 lg:max-w-2xl lg:text-left">
              <p
                className={`font-accent text-[11px] font-bold uppercase tracking-[0.22em] ${
                  darkMode ? 'text-[#f2e3bb]/70' : 'text-[#96724a]'
                }`}
              >
                How it works
              </p>
              <h2
                className={`font-brand mt-2 text-2xl font-bold leading-tight sm:text-3xl lg:text-[2rem] ${
                  darkMode ? 'text-white' : 'text-[#3d1212]'
                }`}
              >
                Book your trip on your phone or computer
              </h2>
              <p
                className={`mt-3 text-sm font-medium leading-relaxed sm:text-base ${
                  darkMode ? 'text-[#f2e3bb]/75' : 'text-[#5a4540]'
                }`}
              >
                Three quick steps from trip details to your driver—same flow on web and mobile.
              </p>
            </div>

            <div className="mt-10 space-y-12 sm:mt-12 sm:space-y-14 lg:space-y-16">
              {bookingSteps.map((step, index) => (
                <article
                  key={step.title}
                  className={`grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12 xl:gap-14 ${
                    index !== bookingSteps.length - 1
                      ? darkMode
                        ? 'border-b border-[#9d3733]/25 pb-12 sm:pb-14 lg:pb-16'
                        : 'border-b border-[#e8dfd6] pb-12 sm:pb-14 lg:pb-16'
                      : ''
                  }`}
                >
                  <div
                    className={`relative order-2 overflow-hidden rounded-2xl ring-1 ring-inset lg:order-1 ${
                      darkMode
                        ? 'bg-[#161616] ring-[#9d3733]/30'
                        : 'bg-[#FFFCF9] ring-[#e8dfd6]/90'
                    }`}
                  >
                    <div className="relative aspect-[4/3] w-full max-h-[280px] sm:max-h-[300px] lg:max-h-none lg:min-h-[240px]">
                      <img
                        src={step.image}
                        alt={step.title}
                        className="h-full w-full object-cover object-center"
                      />
                    </div>
                  </div>

                  <div className="order-1 lg:order-2">
                    <div className="flex items-start gap-4">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                          darkMode
                            ? 'bg-[#9d3733] text-[#f2e3bb]'
                            : 'bg-[#4a1515] text-white shadow-sm'
                        }`}
                        aria-hidden
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <h3
                          className={`font-brand text-xl font-bold leading-snug sm:text-2xl ${
                            darkMode ? 'text-white' : 'text-[#3d1212]'
                          }`}
                        >
                          {step.title}
                        </h3>
                        <p
                          className={`mt-3 max-w-xl text-sm leading-relaxed sm:text-base ${
                            darkMode ? 'text-[#f2e3bb]/80' : 'text-[#4b2220]'
                          }`}
                        >
                          {step.description}
                        </p>
                        {authUser?.role !== 'ADMIN' ? (
                          <button
                            type="button"
                            onClick={() => navigateToPage('rider')}
                            className={`group mt-5 inline-flex items-center gap-2 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                              darkMode
                                ? 'text-[#f2e3bb] underline decoration-[#9d3733] decoration-2 underline-offset-[5px] hover:text-white focus-visible:ring-[#9d3733] focus-visible:ring-offset-[#0f0f0f]'
                                : 'text-[#4a1515] underline decoration-[#4a1515]/35 decoration-2 underline-offset-[5px] hover:decoration-[#4a1515] focus-visible:ring-[#4a1515] focus-visible:ring-offset-white'
                            }`}
                          >
                            {step.cta}
                            <span
                              className="transition group-hover:translate-x-0.5"
                              aria-hidden
                            >
                              →
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {authUser?.role !== 'ADMIN' ? (
              <div
                className={`mt-10 flex flex-col gap-3 border-t pt-8 sm:mt-12 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4 sm:pt-10 ${
                  darkMode ? 'border-[#9d3733]/25' : 'border-[#e8dfd6]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => navigateToPage('rider')}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:w-auto sm:min-w-[220px] ${
                    darkMode
                      ? 'bg-[#9d3733] text-[#f2e3bb] hover:bg-[#842f2b] focus-visible:ring-[#f2e3bb] focus-visible:ring-offset-[#0f0f0f]'
                      : 'bg-[#4a1515] text-white shadow-[0_4px_20px_-8px_rgba(74,21,21,0.4)] hover:bg-[#3d1212] focus-visible:ring-[#4a1515] focus-visible:ring-offset-white'
                  }`}
                >
                  Book ride
                  <span aria-hidden>→</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateToPage('rider')}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 px-6 py-3.5 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:w-auto sm:min-w-[220px] ${
                    darkMode
                      ? 'border-[#f2e3bb]/40 text-[#f2e3bb] hover:bg-[#f2e3bb]/10 focus-visible:ring-[#f2e3bb] focus-visible:ring-offset-[#0f0f0f]'
                      : 'border-[#4a1515] bg-transparent text-[#4a1515] hover:bg-[#4a1515]/5 focus-visible:ring-[#4a1515] focus-visible:ring-offset-white'
                  }`}
                >
                  Start a ride
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
        </>
      )}

      {(activePage === 'home' || activePage === 'about' || activePage === 'contact') && (
      <footer
        id="site-footer"
        className={`scroll-mt-28 border-t transition-colors duration-300 ${
          darkMode ? 'border-[#9d3733]/35 bg-[#060606]' : 'border-[#9d3733]/30 bg-[#f7ecd0]'
        }`}
      >
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <p
                className={`font-brand text-2xl font-bold ${
                  darkMode ? 'text-white' : 'text-[#2d100f]'
                }`}
              >
                JO Transportation
              </p>
              <p
                className={`mt-3 max-w-sm text-sm ${
                  darkMode ? 'text-[#f2e3bb]/80' : 'text-[#4b2220]'
                }`}
              >
                Ride confidently with verified drivers, predictable pricing, and real-time trip
                support in your city.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <a
                  href="#"
                  aria-label="Follow JO on X"
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                    darkMode
                      ? 'border-[#f2e3bb]/25 text-[#f2e3bb]/80 hover:border-[#9d3733] hover:text-[#9d3733]'
                      : 'border-[#9d3733]/35 text-[#4b2220] hover:border-[#9d3733] hover:text-[#9d3733]'
                  }`}
                >
                  <svg className="h-4 w-4" aria-hidden="true" focusable="false">
                    <use href="/icons.svg#x-icon" />
                  </svg>
                </a>
                <a
                  href="#"
                  aria-label="Follow JO on Instagram"
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                    darkMode
                      ? 'border-[#f2e3bb]/25 text-[#f2e3bb]/80 hover:border-[#9d3733] hover:text-[#9d3733]'
                      : 'border-[#9d3733]/35 text-[#4b2220] hover:border-[#9d3733] hover:text-[#9d3733]'
                  }`}
                >
                  <svg className="h-4 w-4" aria-hidden="true" focusable="false">
                    <use href="/icons.svg#instagram-icon" />
                  </svg>
                </a>
                <a
                  href="#"
                  aria-label="Follow JO on Facebook"
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                    darkMode
                      ? 'border-[#f2e3bb]/25 text-[#f2e3bb]/80 hover:border-[#9d3733] hover:text-[#9d3733]'
                      : 'border-[#9d3733]/35 text-[#4b2220] hover:border-[#9d3733] hover:text-[#9d3733]'
                  }`}
                >
                  <svg className="h-4 w-4" aria-hidden="true" focusable="false">
                    <use href="/icons.svg#facebook-icon" />
                  </svg>
                </a>
                <a
                  href="#"
                  aria-label="Follow JO on LinkedIn"
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                    darkMode
                      ? 'border-[#f2e3bb]/25 text-[#f2e3bb]/80 hover:border-[#9d3733] hover:text-[#9d3733]'
                      : 'border-[#9d3733]/35 text-[#4b2220] hover:border-[#9d3733] hover:text-[#9d3733]'
                  }`}
                >
                  <svg className="h-4 w-4" aria-hidden="true" focusable="false">
                    <use href="/icons.svg#linkedin-icon" />
                  </svg>
                </a>
              </div>
            </div>

            <div>
              <h3
                className={`text-sm font-bold uppercase tracking-wide ${
                  darkMode ? 'text-white' : 'text-[#2d100f]'
                }`}
              >
                Company
              </h3>
              <div className="mt-4 flex flex-col gap-3 text-sm">
                <a href="#" className="transition hover:text-[#9d3733]">
                  About us
                </a>
                <a href="#" className="transition hover:text-[#9d3733]">
                  Careers
                </a>
                <a href="#" className="transition hover:text-[#9d3733]">
                  Newsroom
                </a>
              </div>
            </div>

            <div>
              <h3
                className={`text-sm font-bold uppercase tracking-wide ${
                  darkMode ? 'text-white' : 'text-[#2d100f]'
                }`}
              >
                Products
              </h3>
              <div className="mt-4 flex flex-col gap-3 text-sm">
                <a href="#" className="transition hover:text-[#9d3733]">
                  Ride
                </a>
                <a href="#" className="transition hover:text-[#9d3733]">
                  Drive
                </a>
                <a href="#" className="transition hover:text-[#9d3733]">
                  JO Business
                </a>
              </div>
            </div>

            <div>
              <h3
                className={`text-sm font-bold uppercase tracking-wide ${
                  darkMode ? 'text-white' : 'text-[#2d100f]'
                }`}
              >
                Support
              </h3>
              <div className="mt-4 flex flex-col gap-3 text-sm">
                <a href="#" className="transition hover:text-[#9d3733]">
                  Help Center
                </a>
                <a href="#" className="transition hover:text-[#9d3733]">
                  Safety
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    navigateToPage('contact')
                  }}
                  className="transition hover:text-[#9d3733]"
                >
                  Contact
                </a>
              </div>
            </div>
          </div>

          <div
            className={`mt-10 flex flex-col gap-3 border-t pt-5 text-xs sm:flex-row sm:items-center sm:justify-between ${
              darkMode ? 'border-[#9d3733]/30 text-[#f2e3bb]/70' : 'border-[#9d3733]/25 text-[#4b2220]'
            }`}
          >
            <p>2026 JO Transportation. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="#" className="transition hover:text-[#9d3733]">
                Privacy
              </a>
              <a href="#" className="transition hover:text-[#9d3733]">
                Terms
              </a>
              <a href="#" className="transition hover:text-[#9d3733]">
                Accessibility
              </a>
            </div>
          </div>
        </div>
      </footer>
      )}

      <AuthModal
        open={authModalOpen && !authUser}
        onClose={() => {
          setAuthModalOpen(false)
          setAuthError('')
        }}
        darkMode={darkMode}
        googleButtonRef={googleButtonRef}
        googleClientId={googleClientId}
        authBusy={authBusy}
        authError={authError}
        onLogin={handleEmailLogin}
        onRegister={handleRegister}
      />
    </main>
  )
}

export default App
