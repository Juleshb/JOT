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
  updateMe,
} from './lib/api'
import AuthModal from './components/AuthModal'
import { formatDurationHoursMinutes } from './lib/formatDuration'
import { estimateRideFareUsd } from './lib/estimateFare'
import mapboxgl from 'mapbox-gl'
import RiderPage from './pages/RiderPage'
import DriverPage from './pages/DriverPage'
import AdminPage from './pages/AdminPage'
import AboutPage from './pages/AboutPage'

const pageToPath = {
  home: '/',
  rider: '/ride',
  driver: '/driver',
  admin: '/admin',
  profile: '/profile',
  about: '/about',
}

const getPageFromPath = (pathname) => {
  if (pathname === '/rider') return 'rider'
  if (pathname === '/ride') return 'rider'
  if (pathname === '/driver') return 'driver'
  if (pathname === '/admin') return 'admin'
  if (pathname === '/profile') return 'profile'
  if (pathname === '/about') return 'about'
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

function App() {
  const [darkMode, setDarkMode] = useState(false)
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
  const [activePage, setActivePage] = useState(() => getPageFromPath(window.location.pathname))
  const [profileForm, setProfileForm] = useState({ name: '', phone: '' })
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [riderBusy, setRiderBusy] = useState(false)
  const [riderMessage, setRiderMessage] = useState('')
  const [activeRide, setActiveRide] = useState(null)
  const [rideHistory, setRideHistory] = useState([])
  const [riderForm, setRiderForm] = useState({
    pickupAddress: '',
    dropoffAddress: '',
    when: 'Pickup now',
    riderFor: 'For me',
  })
  const [homeEstimateForm, setHomeEstimateForm] = useState({
    pickupAddress: '',
    dropoffAddress: '',
    scheduleAt: '',
  })
  const [homeEstimateError, setHomeEstimateError] = useState('')
  const [homePickupSuggestions, setHomePickupSuggestions] = useState([])
  const [homeDropoffSuggestions, setHomeDropoffSuggestions] = useState([])
  const [homePickupSearchBusy, setHomePickupSearchBusy] = useState(false)
  const [homeDropoffSearchBusy, setHomeDropoffSearchBusy] = useState(false)
  const [showHomePickupSuggestions, setShowHomePickupSuggestions] = useState(false)
  const [showHomeDropoffSuggestions, setShowHomeDropoffSuggestions] = useState(false)
  const [riderCoords, setRiderCoords] = useState({
    pickup: { lat: -1.9441, lng: 30.0619 },
    dropoff: { lat: -1.9536, lng: 30.0925 },
  })
  const [pickupSuggestions, setPickupSuggestions] = useState([])
  const [dropoffSuggestions, setDropoffSuggestions] = useState([])
  const [pickupSearchBusy, setPickupSearchBusy] = useState(false)
  const [dropoffSearchBusy, setDropoffSearchBusy] = useState(false)
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false)
  const [showDropoffSuggestions, setShowDropoffSuggestions] = useState(false)
  const [routeOptions, setRouteOptions] = useState([])
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0)
  const [mapWebGlError, setMapWebGlError] = useState(null)
  const darkModeRef = useRef(darkMode)
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
  const routeOptionsSourceIdRef = useRef('ride-route-options-source')
  const routeOptionsLayerIdRef = useRef('ride-route-options-layer')
  const selectedRouteSourceIdRef = useRef('ride-selected-route-source')
  const selectedRouteLayerIdRef = useRef('ride-selected-route-layer')
  const hasPromptedGoogleRef = useRef(false)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
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
    async (query) => {
      if (!mapboxAccessToken || !query?.trim()) return []
      const encoded = encodeURIComponent(query.trim())
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?autocomplete=true&limit=5&access_token=${mapboxAccessToken}`,
      )
      if (!response.ok) return []
      const data = await response.json()
      const features = Array.isArray(data?.features) ? data.features : []
      return features
        .map((feature) => {
          const [lng, lat] = feature?.center ?? []
          if (typeof lat !== 'number' || typeof lng !== 'number') return null
          return {
            id: feature.id,
            name: feature.text ?? feature.place_name ?? 'Selected location',
            placeName: feature.place_name ?? feature.text ?? 'Selected location',
            coords: { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) },
          }
        })
        .filter(Boolean)
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
    const snappedCoords = await snapToRoad(suggestion.coords)
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
      return
    }

    setDropoffSuggestions([])
    setShowDropoffSuggestions(false)
  }, [snapToRoad])

  const resolveLocationFromQuery = useCallback(
    async (query) => {
      const results = await searchLocationSuggestions(query)
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
        name: 'Straight line',
        summaryLine: '',
        durationMinutes: null,
        distanceKm: null,
        priceUsd: null,
      }

      if (!mapboxAccessToken) {
        return [fallbackOption]
      }

      const coordinates = `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}`
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?alternatives=true&geometries=geojson&overview=full&steps=false&access_token=${mapboxAccessToken}`,
      )

      if (!response.ok) {
        return [fallbackOption]
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
            const summaryLine = legs
              .map((leg) => leg?.summary)
              .filter(Boolean)
              .join(' — ')
              .split(';')
              .map((part) => part.trim())
              .filter(Boolean)
              .slice(0, 5)
              .join(' · ')
            return {
              id: `route-${index}`,
              feature: createLineFeature(routeCoordinates),
              durationMinutes:
                durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : null,
              distanceKm: distanceMeters > 0 ? Number((distanceMeters / 1000).toFixed(1)) : null,
              summaryLine,
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
            if (parsed.length === 1) name = 'Suggested route'
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

      const data = await response.json()
      let normalized = parseRoutes(data)
      if (normalized.length > 0) return normalized

      const walkingResponse = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?alternatives=true&geometries=geojson&overview=full&steps=false&access_token=${mapboxAccessToken}`,
      )
      if (!walkingResponse.ok) return [fallbackOption]

      const walkingData = await walkingResponse.json()
      normalized = parseRoutes(walkingData)
      return normalized.length > 0 ? normalized : [fallbackOption]
    },
    [mapboxAccessToken],
  )

  const reverseGeocode = useCallback(
    async (coords) => {
      if (!mapboxAccessToken) return null
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.lng},${coords.lat}.json?limit=1&access_token=${mapboxAccessToken}`,
      )
      if (!response.ok) return null
      const data = await response.json()
      const placeName = data?.features?.[0]?.place_name
      return typeof placeName === 'string' ? placeName : null
    },
    [mapboxAccessToken],
  )

  snapToRoadRef.current = snapToRoad
  reverseGeocodeRef.current = reverseGeocode
  darkModeRef.current = darkMode
  riderCoordsRef.current = riderCoords
  routeOptionsRef.current = routeOptions
  selectedRouteIndexRef.current = selectedRouteIndex

  useEffect(() => {
    const savedMode = localStorage.getItem('jo-theme')
    if (savedMode) {
      setDarkMode(savedMode === 'dark')
      return
    }
    setDarkMode(false)
  }, [])

  useEffect(() => {
    localStorage.setItem('jo-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

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
        auto_select: true,
        cancel_on_tap_outside: false,
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
        getRideHistory(authToken, 8),
      ])
      setActiveRide(active)
      setRideHistory(Array.isArray(history) ? history : [])
    } catch (error) {
      setRiderMessage(error.message || 'Unable to load rider data.')
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
    if (activePage === 'driver' && authToken && authUser?.role === 'DRIVER') {
      fetchRiderData()
    }
  }, [activePage, authToken, authUser?.role, fetchRiderData])

  useEffect(() => {
    if (activePage !== 'rider' || !showPickupSuggestions) return
    const query = riderForm.pickupAddress.trim()
    if (query.length < 3) {
      setPickupSuggestions([])
      return
    }
    let cancelled = false

    const timeout = window.setTimeout(async () => {
      try {
        setPickupSearchBusy(true)
        const suggestions = await searchLocationSuggestions(query)
        if (!cancelled) {
          setPickupSuggestions(suggestions)
        }
      } finally {
        if (!cancelled) {
          setPickupSearchBusy(false)
        }
      }
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [activePage, riderForm.pickupAddress, searchLocationSuggestions, showPickupSuggestions])

  useEffect(() => {
    if (activePage !== 'rider' || !showDropoffSuggestions) return
    const query = riderForm.dropoffAddress.trim()
    if (query.length < 3) {
      setDropoffSuggestions([])
      return
    }
    let cancelled = false

    const timeout = window.setTimeout(async () => {
      try {
        setDropoffSearchBusy(true)
        const suggestions = await searchLocationSuggestions(query)
        if (!cancelled) {
          setDropoffSuggestions(suggestions)
        }
      } finally {
        if (!cancelled) {
          setDropoffSearchBusy(false)
        }
      }
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [activePage, riderForm.dropoffAddress, searchLocationSuggestions, showDropoffSuggestions])

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

  useEffect(() => {
    if (activePage !== 'home' || !showHomePickupSuggestions) return
    const query = homeEstimateForm.pickupAddress.trim()
    if (query.length < 3) {
      setHomePickupSuggestions([])
      return
    }
    let cancelled = false

    const timeout = window.setTimeout(async () => {
      try {
        setHomePickupSearchBusy(true)
        const suggestions = await searchLocationSuggestions(query)
        if (!cancelled) {
          setHomePickupSuggestions(suggestions)
        }
      } finally {
        if (!cancelled) {
          setHomePickupSearchBusy(false)
        }
      }
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [
    activePage,
    homeEstimateForm.pickupAddress,
    searchLocationSuggestions,
    showHomePickupSuggestions,
  ])

  useEffect(() => {
    if (activePage !== 'home' || !showHomeDropoffSuggestions) return
    const query = homeEstimateForm.dropoffAddress.trim()
    if (query.length < 3) {
      setHomeDropoffSuggestions([])
      return
    }
    let cancelled = false

    const timeout = window.setTimeout(async () => {
      try {
        setHomeDropoffSearchBusy(true)
        const suggestions = await searchLocationSuggestions(query)
        if (!cancelled) {
          setHomeDropoffSuggestions(suggestions)
        }
      } finally {
        if (!cancelled) {
          setHomeDropoffSearchBusy(false)
        }
      }
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [
    activePage,
    homeEstimateForm.dropoffAddress,
    searchLocationSuggestions,
    showHomeDropoffSuggestions,
  ])

  useEffect(() => {
    if (!showHomePickupSuggestions) {
      setHomePickupSearchBusy(false)
    }
  }, [showHomePickupSuggestions])

  useEffect(() => {
    if (!showHomeDropoffSuggestions) {
      setHomeDropoffSearchBusy(false)
    }
  }, [showHomeDropoffSuggestions])

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
    }, 250)

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
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {
          /* ignore */
        }
        mapRef.current = null
        pickupMarkerRef.current = null
        dropoffMarkerRef.current = null
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
        style: darkModeRef.current
          ? 'mapbox://styles/mapbox/dark-v11'
          : 'mapbox://styles/mapbox/light-v11',
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
    })

    pickupMarker.on('drag', () => {
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
    }
  }, [activePage, mapboxAccessToken, authUser, ensureRouteLayer])

  useEffect(() => {
    if (!mapRef.current || activePage !== 'rider') return

    mapRef.current.setStyle(
      darkMode ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
    )
    mapRef.current.once('style.load', () => {
      ensureRouteLayer(
        mapRef.current,
        createFeatureCollection(routeOptionFeatures),
        selectedRouteFeature,
      )
    })
  }, [activePage, darkMode, ensureRouteLayer])

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

  const handleHomeEstimateSubmit = useCallback(
    (event) => {
      event.preventDefault()
      const pickupAddress = homeEstimateForm.pickupAddress.trim()
      const dropoffAddress = homeEstimateForm.dropoffAddress.trim()

      if (!pickupAddress || !dropoffAddress) {
        setHomeEstimateError('Please add pickup and dropoff locations.')
        return
      }

      const whenLabel = homeEstimateForm.scheduleAt
        ? `Scheduled: ${new Date(homeEstimateForm.scheduleAt).toLocaleString()}`
        : 'Pickup now'

      setRiderForm((prev) => ({
        ...prev,
        pickupAddress,
        dropoffAddress,
        when: whenLabel,
      }))
      setHomeEstimateError('')
      navigateToPage('rider')
    },
    [homeEstimateForm, navigateToPage],
  )

  const handleHomeLocationInput = useCallback((field, value) => {
    if (field === 'pickup') {
      setHomeEstimateForm((prev) => ({ ...prev, pickupAddress: value }))
      setShowHomePickupSuggestions(true)
      if (!value.trim()) setHomePickupSuggestions([])
      return
    }

    setHomeEstimateForm((prev) => ({ ...prev, dropoffAddress: value }))
    setShowHomeDropoffSuggestions(true)
    if (!value.trim()) setHomeDropoffSuggestions([])
  }, [])

  const handleSelectHomeLocation = useCallback((field, suggestion) => {
    if (field === 'pickup') {
      setHomeEstimateForm((prev) => ({ ...prev, pickupAddress: suggestion.placeName }))
      setHomePickupSuggestions([])
      setShowHomePickupSuggestions(false)
      return
    }

    setHomeEstimateForm((prev) => ({ ...prev, dropoffAddress: suggestion.placeName }))
    setHomeDropoffSuggestions([])
    setShowHomeDropoffSuggestions(false)
  }, [])

  const confirmRideRequest = useCallback(
    async (paymentMethod, options = {}) => {
      if (!authToken) return
      if (!riderForm.pickupAddress.trim() || !riderForm.dropoffAddress.trim()) {
        setRiderMessage('Please add pickup and dropoff locations.')
        return
      }

      const fareEstimate =
        typeof options.fareEstimateUsd === 'number' && !Number.isNaN(options.fareEstimateUsd)
          ? options.fareEstimateUsd
          : routeOptions[selectedRouteIndex]?.priceUsd

      if (paymentMethod === 'CARD' && (fareEstimate == null || Number.isNaN(fareEstimate))) {
        setRiderMessage('Fare estimate is required for card payment. Select a route first.')
        return
      }

      try {
        setRiderBusy(true)
        setRiderMessage('')
        let nextPickup = riderCoords.pickup
        let nextDropoff = riderCoords.dropoff

        const [pickupMatch, dropoffMatch] = await Promise.all([
          resolveLocationFromQuery(riderForm.pickupAddress),
          resolveLocationFromQuery(riderForm.dropoffAddress),
        ])

        if (pickupMatch?.coords) {
          nextPickup = pickupMatch.coords
        }
        if (dropoffMatch?.coords) {
          nextDropoff = dropoffMatch.coords
        }
        ;[nextPickup, nextDropoff] = await Promise.all([
          snapToRoad(nextPickup),
          snapToRoad(nextDropoff),
        ])

        setRiderCoords({
          pickup: nextPickup,
          dropoff: nextDropoff,
        })

        if (!pickupMatch || !dropoffMatch) {
          setRiderMessage('Choose locations from suggestions to get the best drivable routes.')
        }

        const payload = {
          pickupAddress: riderForm.pickupAddress.trim(),
          dropoffAddress: riderForm.dropoffAddress.trim(),
          pickupLat: nextPickup.lat,
          pickupLng: nextPickup.lng,
          dropoffLat: nextDropoff.lat,
          dropoffLng: nextDropoff.lng,
          ...(fareEstimate != null ? { fareEstimate } : {}),
          paymentMethod,
          paymentStatus: 'COMPLETED',
          ...(options.stripePaymentIntentId
            ? { stripePaymentIntentId: options.stripePaymentIntentId }
            : {}),
        }

        await createRide(authToken, payload)
        setRiderMessage('Ride request submitted successfully.')
        await fetchRiderData()
      } catch (error) {
        const msg = error.message || 'Unable to request ride.'
        setRiderMessage(msg)
        throw error
      } finally {
        setRiderBusy(false)
      }
    },
    [
      authToken,
      riderForm.pickupAddress,
      riderForm.dropoffAddress,
      riderCoords.pickup,
      riderCoords.dropoff,
      routeOptions,
      selectedRouteIndex,
      fetchRiderData,
      resolveLocationFromQuery,
      snapToRoad,
    ],
  )

  return (
    <main
      className={`min-h-screen transition-colors duration-300 ${
        darkMode ? 'bg-black text-[#f2e3bb]' : 'bg-[#f2e3bb] text-[#2d100f]'
      }`}
    >
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md transition-colors duration-300 ${
          darkMode ? 'border-[#9d3733]/40' : 'border-[#9d3733]/35'
        }`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img src={icon} alt="JO icon" className="h-8 w-8 rounded-full sm:h-10 sm:w-10" />
            <span className="font-brand truncate text-base font-semibold tracking-wide sm:text-lg">
              JO Transportation
            </span>
          </div>
          <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
            {authUser?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => navigateToPage('admin')}
                className="transition hover:text-[#9d3733]"
              >
                Admin
              </button>
            )}
            {authUser?.role === 'DRIVER' && (
              <button
                type="button"
                onClick={() => navigateToPage('driver')}
                className="transition hover:text-[#9d3733]"
              >
                Drive
              </button>
            )}
            {authUser?.role !== 'ADMIN' && (
              <button
                type="button"
                onClick={() => navigateToPage('rider')}
                className="transition hover:text-[#9d3733]"
              >
                Ride
              </button>
            )}
            <a href="#" className="transition hover:text-[#9d3733]">
              Reserve
            </a>
            <a href="#" className="transition hover:text-[#9d3733]">
              Business
            </a>
            <button
              type="button"
              onClick={() => navigateToPage('about')}
              className="transition hover:text-[#9d3733]"
            >
              About
            </button>
            <a href="#" className="transition hover:text-[#9d3733]">
              Help
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
              className={`relative flex h-8 w-14 items-center rounded-full border px-1 transition-all duration-300 sm:h-10 sm:w-18 ${
                darkMode
                  ? 'border-[#f2e3bb]/35 bg-[#111] hover:border-white'
                  : 'border-[#9d3733]/40 bg-[#fff8eb] hover:border-[#9d3733]'
              }`}
            >
              <span
                className={`absolute inline-flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 sm:h-8 sm:w-8 ${
                  darkMode
                    ? 'translate-x-0 bg-[#f2e3bb] text-[#9d3733]'
                    : 'translate-x-6 bg-[#9d3733] text-[#f2e3bb] sm:translate-x-8'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`h-3.5 w-3.5 transition-transform duration-500 sm:h-4 sm:w-4 ${
                    darkMode ? 'rotate-0' : 'rotate-180'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {darkMode ? (
                    <>
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </>
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2" />
                      <path d="M12 20v2" />
                      <path d="m4.93 4.93 1.41 1.41" />
                      <path d="m17.66 17.66 1.41 1.41" />
                      <path d="M2 12h2" />
                      <path d="M20 12h2" />
                      <path d="m6.34 17.66-1.41 1.41" />
                      <path d="m19.07 4.93-1.41 1.41" />
                    </>
                  )}
                </svg>
              </span>
              <span className="sr-only">
                {darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              </span>
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
                        navigateToPage('profile')
                        setUserMenuOpen(false)
                      }}
                      className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[#9d3733]/15"
                    >
                      Profile
                    </button>
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
                      className="w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[#9d3733]/15"
                    >
                      {authUser?.role === 'ADMIN'
                        ? 'Admin dashboard'
                        : authUser?.role === 'DRIVER'
                          ? 'Driver dashboard'
                          : 'My rides'}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[#9d3733]/15"
                    >
                      Settings
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
          activeRide={activeRide}
          rideHistory={rideHistory}
          confirmRideRequest={confirmRideRequest}
          setRiderMessage={setRiderMessage}
          handleCancelRide={handleCancelRide}
          navigateToPage={navigateToPage}
        />
      ) : activePage === 'about' ? (
        <AboutPage darkMode={darkMode} navigateToPage={navigateToPage} />
      ) : (
        <>
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-12 pt-28 md:grid-cols-2 md:pb-16 md:pt-32">
        <div>
          <p className="mb-4 inline-block rounded-full border border-[#9d3733] px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#9d3733]">
            Premium Local Rides
          </p>
          <h1
            className={`font-brand mb-6 text-4xl font-bold leading-tight sm:text-5xl ${
              darkMode ? 'text-white' : 'text-[#2d100f]'
            }`}
          >
            Go anywhere with
            <span className="text-[#9d3733]"> JO Transportation</span>
          </h1>
          <p
            className={`mb-8 max-w-xl text-base sm:text-lg ${
              darkMode ? 'text-[#f2e3bb]/90' : 'text-[#4b2220]'
            }`}
          >
            Request fast pickups, schedule airport rides, and track your trip in
            real time. Reliable drivers, transparent pricing, and comfort-first
            rides every day.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigateToPage('rider')}
              className="font-accent rounded-lg bg-[#9d3733] px-6 py-3 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
            >
              Book a ride
            </button>
            <button
              className={`font-accent rounded-lg border px-6 py-3 text-sm font-bold transition ${
                darkMode
                  ? 'border-[#f2e3bb]/40 text-[#f2e3bb] hover:border-white hover:text-white'
                  : 'border-[#9d3733]/50 text-[#842f2b] hover:border-[#9d3733] hover:text-[#9d3733]'
              }`}
            >
              Become a driver
            </button>
          </div>
          {authBusy && !authModalOpen && (
            <p className="mt-4 text-sm text-[#9d3733]">Signing in…</p>
          )}
          {authError && !authModalOpen && (
            <p className="mt-4 text-sm text-[#9d3733]">{authError}</p>
          )}
        </div>

        <div
          className={`rounded-2xl border p-6 shadow-xl transition-colors duration-300 ${
            darkMode
              ? 'border-[#9d3733]/50 bg-[#111] shadow-[#9d3733]/20'
              : 'border-[#9d3733]/35 bg-[#fff8eb] shadow-[#9d3733]/15'
          }`}
        >
          <h2
            className={`font-accent mb-5 text-xl font-bold ${
              darkMode ? 'text-white' : 'text-[#2d100f]'
            }`}
          >
            Get a price estimate
          </h2>
          <form className="space-y-3" onSubmit={handleHomeEstimateSubmit}>
            <div className="relative">
              <input
                type="text"
                placeholder="Pickup location"
                value={homeEstimateForm.pickupAddress}
                onChange={(e) => {
                  handleHomeLocationInput('pickup', e.target.value)
                  if (homeEstimateError) setHomeEstimateError('')
                }}
                onFocus={() => setShowHomePickupSuggestions(true)}
                onBlur={() => {
                  window.setTimeout(() => setShowHomePickupSuggestions(false), 120)
                }}
                className={`w-full rounded-lg border px-4 py-3 text-sm outline-none transition ${
                  darkMode
                    ? 'border-[#9d3733]/60 bg-black text-[#f2e3bb] placeholder:text-[#f2e3bb]/50 focus:border-[#9d3733]'
                    : 'border-[#9d3733]/40 bg-white text-[#2d100f] placeholder:text-[#9d3733]/60 focus:border-[#9d3733]'
                }`}
              />
              {showHomePickupSuggestions && (
                <div
                  className={`absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-xl border shadow-lg ${
                    darkMode
                      ? 'border-[#9d3733]/40 bg-[#121212] text-[#f2e3bb]'
                      : 'border-[#9d3733]/25 bg-white text-[#2d100f]'
                  }`}
                >
                  {homePickupSearchBusy ? (
                    <p className="px-3 py-2 text-[#9d3733]">Searching pickup...</p>
                  ) : homePickupSuggestions.length > 0 ? (
                    homePickupSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSelectHomeLocation('pickup', suggestion)}
                        className={`block w-full border-b px-3 py-2 text-left transition last:border-b-0 ${
                          darkMode
                            ? 'border-[#9d3733]/20 hover:bg-[#9d3733]/20'
                            : 'border-[#9d3733]/15 hover:bg-[#9d3733]/10'
                        }`}
                      >
                        {suggestion.placeName}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 opacity-70">Type 3+ letters to see locations.</p>
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Dropoff location"
                value={homeEstimateForm.dropoffAddress}
                onChange={(e) => {
                  handleHomeLocationInput('dropoff', e.target.value)
                  if (homeEstimateError) setHomeEstimateError('')
                }}
                onFocus={() => setShowHomeDropoffSuggestions(true)}
                onBlur={() => {
                  window.setTimeout(() => setShowHomeDropoffSuggestions(false), 120)
                }}
                className={`w-full rounded-lg border px-4 py-3 text-sm outline-none transition ${
                  darkMode
                    ? 'border-[#9d3733]/60 bg-black text-[#f2e3bb] placeholder:text-[#f2e3bb]/50 focus:border-[#9d3733]'
                    : 'border-[#9d3733]/40 bg-white text-[#2d100f] placeholder:text-[#9d3733]/60 focus:border-[#9d3733]'
                }`}
              />
              {showHomeDropoffSuggestions && (
                <div
                  className={`absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-xl border shadow-lg ${
                    darkMode
                      ? 'border-[#9d3733]/40 bg-[#121212] text-[#f2e3bb]'
                      : 'border-[#9d3733]/25 bg-white text-[#2d100f]'
                  }`}
                >
                  {homeDropoffSearchBusy ? (
                    <p className="px-3 py-2 text-[#9d3733]">Searching dropoff...</p>
                  ) : homeDropoffSuggestions.length > 0 ? (
                    homeDropoffSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSelectHomeLocation('dropoff', suggestion)}
                        className={`block w-full border-b px-3 py-2 text-left transition last:border-b-0 ${
                          darkMode
                            ? 'border-[#9d3733]/20 hover:bg-[#9d3733]/20'
                            : 'border-[#9d3733]/15 hover:bg-[#9d3733]/10'
                        }`}
                      >
                        {suggestion.placeName}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 opacity-70">Type 3+ letters to see locations.</p>
                  )}
                </div>
              )}
            </div>
            <input
              type="datetime-local"
              value={homeEstimateForm.scheduleAt}
              onChange={(e) => {
                setHomeEstimateForm((prev) => ({ ...prev, scheduleAt: e.target.value }))
              }}
              className={`w-full rounded-lg border px-4 py-3 text-sm outline-none transition ${
                darkMode
                  ? 'border-[#9d3733]/60 bg-black text-[#f2e3bb] focus:border-[#9d3733]'
                  : 'border-[#9d3733]/40 bg-white text-[#2d100f] focus:border-[#9d3733]'
              }`}
            />
            <button
              type="submit"
              className="font-accent w-full rounded-lg bg-[#9d3733] px-4 py-3 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
            >
              Check fare
            </button>
            {homeEstimateError && <p className="text-sm text-[#9d3733]">{homeEstimateError}</p>}
          </form>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-14">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              title: 'Fast pickup',
              heading: 'Car arrives in minutes',
              body: 'Smart dispatch routes the nearest trusted driver to your pickup point.',
            },
            {
              title: 'Safe travel',
              heading: 'Verified drivers',
              body: 'Driver profiles, trip sharing, and support keep every journey secure and easy.',
            },
            {
              title: 'Fair pricing',
              heading: 'Know the fare before ride',
              body: 'Upfront estimates with clear charges so you always stay in control.',
            },
          ].map((item) => (
            <article
              key={item.title}
              className={`rounded-2xl border p-5 transition-colors duration-300 ${
                darkMode
                  ? 'border-[#9d3733]/50 bg-[#121212]'
                  : 'border-[#9d3733]/35 bg-[#fff8eb]'
              }`}
            >
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#9d3733]">
                {item.title}
              </p>
              <h3
                className={`font-accent mb-2 text-lg font-bold ${
                  darkMode ? 'text-white' : 'text-[#2d100f]'
                }`}
              >
                {item.heading}
              </h3>
              <p
                className={`text-sm ${
                  darkMode ? 'text-[#f2e3bb]/85' : 'text-[#4b2220]'
                }`}
              >
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-14">
        <div
          className={`rounded-2xl border p-6 transition-colors duration-300 sm:p-8 ${
            darkMode
              ? 'border-[#9d3733]/40 bg-[#0f0f0f]'
              : 'border-[#9d3733]/30 bg-[#fff8eb]'
          }`}
        >
          <h2
            className={`font-brand mb-8 text-3xl font-bold ${
              darkMode ? 'text-white' : 'text-[#2d100f]'
            }`}
          >
            Book your trip on your phone or computer
          </h2>

          <div className="space-y-8">
            {bookingSteps.map((step, index) => (
              <article key={step.title} className="grid gap-5 md:grid-cols-[300px_1fr]">
                <div
                  className={`relative overflow-hidden rounded-xl border ${
                    darkMode
                      ? 'border-[#9d3733]/40 bg-[#161616]'
                      : 'border-[#9d3733]/30 bg-[#f7ecd0]'
                  }`}
                >
                  <div
                    className={`absolute inset-0 ${
                      darkMode
                        ? 'bg-gradient-to-br from-[#9d3733]/35 via-transparent to-black'
                        : 'bg-gradient-to-br from-[#9d3733]/20 via-transparent to-white'
                    }`}
                  />
                  <div className="relative flex h-48 items-center justify-center">
                    <img
                      src={step.image}
                      alt={step.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[24px_1fr] gap-4">
                  <div className="flex justify-center">
                    <div className="flex w-6 flex-col items-center">
                      <span className="mt-1 h-2.5 w-2.5 rounded-sm bg-[#9d3733]" />
                      {index !== bookingSteps.length - 1 && (
                        <span
                          className={`mt-2 h-full w-px ${
                            darkMode ? 'bg-[#f2e3bb]/35' : 'bg-[#9d3733]/35'
                          }`}
                        />
                      )}
                    </div>
                  </div>

                  <div className="pb-2">
                    <h3
                      className={`font-accent text-xl font-bold ${
                        darkMode ? 'text-white' : 'text-[#2d100f]'
                      }`}
                    >
                      {index + 1}. {step.title}
                    </h3>
                    <p
                      className={`mt-2 max-w-2xl text-base ${
                        darkMode ? 'text-[#f2e3bb]/85' : 'text-[#4b2220]'
                      }`}
                    >
                      {step.description}
                    </p>
                    <button className="font-accent mt-4 border-b border-[#9d3733] text-sm font-bold text-[#9d3733] transition hover:border-[#842f2b] hover:text-[#842f2b]">
                      {step.cta}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer
        className={`border-t transition-colors duration-300 ${
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
                  className={`rounded-full border p-2 transition ${
                    darkMode
                      ? 'border-[#f2e3bb]/25 text-[#f2e3bb]/80 hover:border-[#9d3733] hover:text-[#9d3733]'
                      : 'border-[#9d3733]/35 text-[#4b2220] hover:border-[#9d3733] hover:text-[#9d3733]'
                  }`}
                >
                  <span className="text-xs font-bold">X</span>
                </a>
                <a
                  href="#"
                  aria-label="Follow JO on Instagram"
                  className={`rounded-full border p-2 transition ${
                    darkMode
                      ? 'border-[#f2e3bb]/25 text-[#f2e3bb]/80 hover:border-[#9d3733] hover:text-[#9d3733]'
                      : 'border-[#9d3733]/35 text-[#4b2220] hover:border-[#9d3733] hover:text-[#9d3733]'
                  }`}
                >
                  <span className="text-xs font-bold">IG</span>
                </a>
                <a
                  href="#"
                  aria-label="Follow JO on Facebook"
                  className={`rounded-full border p-2 transition ${
                    darkMode
                      ? 'border-[#f2e3bb]/25 text-[#f2e3bb]/80 hover:border-[#9d3733] hover:text-[#9d3733]'
                      : 'border-[#9d3733]/35 text-[#4b2220] hover:border-[#9d3733] hover:text-[#9d3733]'
                  }`}
                >
                  <span className="text-xs font-bold">FB</span>
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
                <a href="#" className="transition hover:text-[#9d3733]">
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
        </>
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
