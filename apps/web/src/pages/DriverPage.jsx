import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
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
  const [liveLocation, setLiveLocation] = useState(null)
  const [mapWebGlError, setMapWebGlError] = useState(null)

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const driverMarkerRef = useRef(null)
  const liveLocationRef = useRef(null)
  const darkModeRef = useRef(darkMode)

  const profile = authUser?.driverProfile
  const isApproved = profile?.verificationStatus === 'APPROVED'
  const isOnline = Boolean(profile?.isOnline)

  darkModeRef.current = darkMode
  liveLocationRef.current = liveLocation

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
        style: darkModeRef.current
          ? 'mapbox://styles/mapbox/dark-v11'
          : 'mapbox://styles/mapbox/light-v11',
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
    map.on('load', onResize)

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
  }, [isOnline, isApproved, mapboxAccessToken, darkMode])

  useEffect(() => {
    const map = mapRef.current
    const marker = driverMarkerRef.current
    if (!map || !marker || !liveLocation) return
    marker.setLngLat([liveLocation.lng, liveLocation.lat])
    map.easeTo({
      center: [liveLocation.lng, liveLocation.lat],
      duration: 600,
    })
  }, [liveLocation])

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
        setLiveLocation({ lat, lng })
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
    if (!authToken || !id) return
    setActionBusy(true)
    setStatusNote('')
    try {
      await acceptRide(authToken, id)
      setOfferId('')
      await fetchRideDashboard()
    } catch (e) {
      setStatusNote(e.message || 'Could not accept ride.')
    } finally {
      setActionBusy(false)
    }
  }

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

  return (
    <div className={shellClass}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start lg:gap-8">
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9d3733]">
                Driver
              </p>
              <h1 className="font-brand text-3xl font-bold">Welcome back, {authUser.name}</h1>
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
                    className="shrink-0 text-xs font-bold text-[#9d3733] underline decoration-[#9d3733]/50 hover:decoration-[#9d3733]"
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
              Live offer notifications work in the mobile app. If you have a ride ID (for example from a
              test or dispatch), paste it here while online and verified.
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
              When you are online, the map shows your live GPS position and updates the server so riders
              can find you nearby.
            </p>
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
                <p className="font-medium">Go online to see your position on the map.</p>
                <p className="mt-2 text-xs opacity-75">Allow location when your browser asks.</p>
              </div>
            ) : mapWebGlError ? (
              <div className={`${mapPlaceholderClass} mt-4 text-[#9d3733]`}>{mapWebGlError}</div>
            ) : (
              <div
                ref={mapContainerRef}
                className={`mt-4 h-[min(52vh,440px)] w-full overflow-hidden rounded-2xl border ${
                  darkMode ? 'border-[#9d3733]/40' : 'border-[#9d3733]/30'
                }`}
              />
            )}
            {isOnline && isApproved && liveLocation && (
              <p className="mt-3 font-mono text-xs opacity-80">
                {liveLocation.lat.toFixed(5)}, {liveLocation.lng.toFixed(5)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
