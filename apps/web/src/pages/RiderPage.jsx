import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { formatDurationHoursMinutes } from '../lib/formatDuration'
import { formatUsd } from '../lib/estimateFare'
import { createRidePaymentIntent, getNearbyDrivers, rateRide } from '../lib/api'
import MapViewControls from '../components/MapViewControls'
import { StripeRidePayment, stripePublishableConfigured } from '../components/StripeRidePayment'

export default function RiderPage({
  darkMode,
  authUser,
  authToken,
  riderBusy,
  riderMessage,
  riderForm,
  setRiderForm,
  riderCoords,
  pickupSuggestions,
  dropoffSuggestions,
  pickupSearchBusy,
  dropoffSearchBusy,
  showPickupSuggestions,
  showDropoffSuggestions,
  handleRiderLocationInput,
  handleSelectRiderLocation,
  setShowPickupSuggestions,
  setShowDropoffSuggestions,
  routeOptions,
  selectedRouteIndex,
  setSelectedRouteIndex,
  mapboxAccessToken,
  mapWebGlError,
  mapContainerRef,
  fetchRiderData,
  activeRide,
  rideHistory,
  requestPreferredDriver,
  finalizeRidePayment,
  setRiderMessage,
  handleCancelRide,
  navigateToPage,
  riderBasemapMode,
  setRiderBasemapMode,
  riderTrafficOn,
  setRiderTrafficOn,
  onOpenStreetView,
}) {
  const MAP_VIEW_STORAGE_KEY = 'jo-ride-map-view'
  /** Drivers at or beyond this distance (km) get a non-blocking “far” warning. */
  const FAR_DRIVER_KM_THRESHOLD = 8

  const [bookModalOpen, setBookModalOpen] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [payView, setPayView] = useState('choose')
  const [paymentFareUsd, setPaymentFareUsd] = useState(null)
  const [stripeClientSecret, setStripeClientSecret] = useState(null)
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState('')
  const [nearbyDrivers, setNearbyDrivers] = useState([])
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [pendingRideId, setPendingRideId] = useState('')
  const [waitSecondsLeft, setWaitSecondsLeft] = useState(120)
  const [realtimeStatusLine, setRealtimeStatusLine] = useState('Waiting for driver response…')
  const [toastNotification, setToastNotification] = useState('')
  const waitingVoiceAtRef = useRef(0)
  const [mapViewMode, setMapViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'driver'
    return window.localStorage.getItem(MAP_VIEW_STORAGE_KEY) === 'classic' ? 'classic' : 'driver'
  })
  const [ratingStarsDraft, setRatingStarsDraft] = useState(0)
  const [ratingBusy, setRatingBusy] = useState(false)
  /** After submit: show congratulations until dismissed (`rating` = saved `RideRating` row). */
  const [ratingThanks, setRatingThanks] = useState(null)

  const isDriverMapView = mapViewMode === 'driver'

  const needsRiderRating =
    activeRide?.status === 'COMPLETED' &&
    !activeRide?.rating &&
    Boolean(activeRide.driverId)

  const selectedFareUsd = routeOptions[selectedRouteIndex]?.priceUsd ?? null

  const speakMessage = (text) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new window.SpeechSynthesisUtterance(text)
      utterance.rate = 1
      utterance.pitch = 1
      window.speechSynthesis.speak(utterance)
    } catch {
      /* ignore browser speech synthesis errors */
    }
  }

  const resetPaymentModal = () => {
    setPayView('driver')
    setStripeClientSecret(null)
    setPaymentFareUsd(null)
    setPayError('')
    setNearbyDrivers([])
    setSelectedDriverId('')
  }

  const selectedDriver =
    nearbyDrivers.find((driver) => driver.userId === selectedDriverId) ?? null

  useEffect(() => {
    if (payView !== 'waiting' || !pendingRideId) return

    setWaitSecondsLeft(120)
    setRealtimeStatusLine('Waiting for driver response…')
    let alive = true
    const deadline = Date.now() + 120_000

    const secondTicker = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setWaitSecondsLeft(left)
    }, 1000)

    const poll = async () => {
      const data = await fetchRiderData()
      if (!alive) return
      if (data?.active?.id === pendingRideId && data.active.status === 'ACCEPTED') {
        setRealtimeStatusLine('Driver en route to pickup')
        setPayView('choose')
        setPayError('')
        return
      }
      if (Date.now() >= deadline) {
        try {
          await handleCancelRide()
        } catch {
          /* ignore */
        }
        setPayError('Driver did not accept within 2 minutes. Please choose another driver.')
        setPayView('driver')
      }
    }

    const pollId = window.setInterval(poll, 5000)
    poll()

    return () => {
      alive = false
      window.clearInterval(secondTicker)
      window.clearInterval(pollId)
    }
  }, [payView, pendingRideId, fetchRiderData, handleCancelRide])

  useEffect(() => {
    if (payView !== 'waiting' || !pendingRideId) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const speakWaitingMessage = () => {
      try {
        window.speechSynthesis.cancel()
        const utterance = new window.SpeechSynthesisUtterance(
          'Please wait. Looking for driver acceptance.',
        )
        utterance.rate = 1
        utterance.pitch = 1
        window.speechSynthesis.speak(utterance)
        waitingVoiceAtRef.current = Date.now()
      } catch {
        /* ignore browser speech synthesis errors */
      }
    }

    speakWaitingMessage()
    const voiceTicker = window.setInterval(() => {
      speakWaitingMessage()
    }, 15000)

    return () => {
      window.clearInterval(voiceTicker)
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* ignore */
      }
    }
  }, [payView, pendingRideId])

  useEffect(() => {
    if (!toastNotification) return undefined
    const timer = window.setTimeout(() => {
      setToastNotification('')
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [toastNotification])

  useEffect(() => {
    if (payView !== 'waiting' || !pendingRideId || !authToken) return

    const socket = io(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000', {
      auth: { token: authToken },
      transports: ['websocket'],
    })

    socket.on('connect', () => {
      socket.emit('ride:subscribe', { rideId: pendingRideId })
    })

    socket.on('ride:progress', (payload) => {
      if (payload?.rideId !== pendingRideId) return
      if (payload?.message) {
        setRealtimeStatusLine(payload.message)
      }
    })

    socket.on('ride:status', (payload) => {
      if (payload?.rideId !== pendingRideId) return
      if (payload?.ride) {
        void fetchRiderData()
      }
      if (payload?.status === 'ACCEPTED') {
        setRealtimeStatusLine('Driver en route to pickup')
      } else if (payload?.status === 'REQUESTED') {
        setRealtimeStatusLine('Driver viewed request')
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [payView, pendingRideId, authToken, fetchRiderData])

  useEffect(() => {
    setRatingStarsDraft(0)
  }, [activeRide?.id])

  const isFarDriver = (driver) =>
    typeof driver.km === 'number' && driver.km >= FAR_DRIVER_KM_THRESHOLD

  const getDriverVisuals = (driver) => {
    const fallbackDistance = typeof driver.km === 'number' ? driver.km : 2.5
    const etaMinutes = Math.max(2, Math.round(fallbackDistance * 3.2))
    const hashBase = `${driver.userId}:${driver.name}`
    const score = [...hashBase].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    const synthetic = (4.5 + (score % 5) * 0.1).toFixed(1)
    const rating =
      typeof driver.averageRiderRating === 'number' && Number.isFinite(driver.averageRiderRating)
        ? driver.averageRiderRating.toFixed(1)
        : synthetic
    const initials = driver.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()

    return { etaMinutes, rating, initials }
  }

  const handleBookingFormSubmit = (e) => {
    e.preventDefault()
    if (!authToken) return
    if (!riderForm.pickupAddress.trim() || !riderForm.dropoffAddress.trim()) {
      setRiderMessage('Please add pickup and dropoff locations.')
      return
    }
    setPayBusy(true)
    setPayError('')
    getNearbyDrivers(authToken, {
      lat: riderCoords.pickup.lat,
      lng: riderCoords.pickup.lng,
    })
      .then((drivers) => {
        const list = Array.isArray(drivers) ? drivers : []
        if (list.length === 0) {
          throw new Error('No nearby online drivers found for this pickup location.')
        }
        setNearbyDrivers(list)
        setSelectedDriverId(list[0].userId)
        setPaymentFareUsd(Math.max(6.5, selectedFareUsd ?? 6.5))
        setPayView('driver')
        setStripeClientSecret(null)
        setPayError('')
        setPaymentModalOpen(true)
      })
      .catch((err) => {
        const message = err?.message || 'Could not load nearby drivers.'
        setPayError(message)
        setRiderMessage(message)
        if (message.toLowerCase().includes('no nearby online drivers')) {
          setToastNotification('No nearby drivers found. Please try again in a moment.')
          speakMessage(
            'No driver is currently available near your location. Please wait and try again.',
          )
        }
      })
      .finally(() => {
        setPayBusy(false)
      })
  }

  const handlePayCash = async () => {
    setPayBusy(true)
    setPayError('')
    try {
      await finalizeRidePayment(pendingRideId, {
        paymentMethod: 'CASH',
        fareEstimate: Math.max(6.5, paymentFareUsd ?? 6.5),
      })
      await fetchRiderData()
      setPaymentModalOpen(false)
      setBookModalOpen(false)
      resetPaymentModal()
      setPendingRideId('')
    } catch (err) {
      setPayError(err?.message || 'Could not complete booking.')
    } finally {
      setPayBusy(false)
    }
  }

  const handleStartStripeCheckout = async () => {
    if (!stripePublishableConfigured) {
      setPayError(
        'Add VITE_STRIPE_PUBLISHABLE_KEY to your web .env and STRIPE_SECRET_KEY on the API.',
      )
      return
    }
    setPayBusy(true)
    setPayError('')
    const locked = Math.max(6.5, paymentFareUsd ?? 6.5)
    try {
      const data = await createRidePaymentIntent(authToken, { amountUsd: locked })
      setStripeClientSecret(data.clientSecret)
      setPayView('stripe')
    } catch (err) {
      setPayError(err?.message || 'Could not start card payment. Is the API configured with Stripe?')
    } finally {
      setPayBusy(false)
    }
  }

  const handleStripePaymentSucceeded = async (paymentIntentId) => {
    const locked = Math.max(6.5, paymentFareUsd ?? 6.5)
    setPayBusy(true)
    setPayError('')
    try {
      await finalizeRidePayment(pendingRideId, {
        paymentMethod: 'CARD',
        stripePaymentIntentId: paymentIntentId,
        fareEstimate: locked,
      })
      await fetchRiderData()
      setPaymentModalOpen(false)
      setBookModalOpen(false)
      resetPaymentModal()
      setPendingRideId('')
    } catch (err) {
      setPayError(
        err?.message ||
          'Payment succeeded but the ride could not be created. Contact support with your receipt.',
      )
    } finally {
      setPayBusy(false)
    }
  }

  useEffect(() => {
    window.localStorage.setItem(MAP_VIEW_STORAGE_KEY, mapViewMode)
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(id)
  }, [mapViewMode])

  const suggestionPanelClass = (darkMode) =>
    `absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-lg border text-xs shadow-lg sm:max-h-72 ${
      darkMode ? 'border-[#9d3733]/40 bg-black' : 'border-[#9d3733]/25 bg-white'
    }`

  const fieldClass = `w-full rounded-xl border px-4 py-3 text-base outline-none transition xl:py-2.5 xl:text-sm ${
    darkMode ? 'border-[#9d3733]/45 bg-black' : 'border-[#9d3733]/30 bg-white'
  }`

  useEffect(() => {
    if (!bookModalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [bookModalOpen])

  const bookRideFields = (
    <div className="space-y-4">
      <div className="relative">
        <label
          className={`mb-1.5 block text-xs font-semibold uppercase tracking-wide ${
            darkMode ? 'text-[#f2e3bb]/70' : 'text-[#4b2220]'
          }`}
        >
          Pickup
        </label>
        <input
          type="text"
          placeholder="Search any address — nearby results shown first"
          value={riderForm.pickupAddress}
          onChange={(e) => handleRiderLocationInput('pickup', e.target.value)}
          onFocus={() => setShowPickupSuggestions(true)}
          onBlur={() => {
            window.setTimeout(() => setShowPickupSuggestions(false), 120)
          }}
          className={fieldClass}
        />
        {showPickupSuggestions && (
          <div className={suggestionPanelClass(darkMode)}>
            {pickupSearchBusy ? (
              <p className="px-3 py-2 text-[#9d3733]">Searching pickup...</p>
            ) : pickupSuggestions.length > 0 ? (
              pickupSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelectRiderLocation('pickup', suggestion)}
                  className={`block w-full border-b px-3 py-2 text-left transition last:border-b-0 ${
                    darkMode
                      ? 'border-[#9d3733]/20 hover:bg-[#9d3733]/20'
                      : 'border-[#9d3733]/15 hover:bg-[#9d3733]/10'
                  }`}
                >
                  {suggestion.badge ? (
                    <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-[#15803d]">
                      {suggestion.badge}
                    </span>
                  ) : null}
                  <span className="text-[13px] leading-snug sm:text-sm">{suggestion.placeName}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 opacity-70">
                Nearby places appear here, or type at least 3 letters to search worldwide.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <label
          className={`mb-1.5 block text-xs font-semibold uppercase tracking-wide ${
            darkMode ? 'text-[#f2e3bb]/70' : 'text-[#4b2220]'
          }`}
        >
          Dropoff
        </label>
        <input
          type="text"
          placeholder="Destination — biased from your pickup"
          value={riderForm.dropoffAddress}
          onChange={(e) => handleRiderLocationInput('dropoff', e.target.value)}
          onFocus={() => setShowDropoffSuggestions(true)}
          onBlur={() => {
            window.setTimeout(() => setShowDropoffSuggestions(false), 120)
          }}
          className={fieldClass}
        />
        {showDropoffSuggestions && (
          <div className={suggestionPanelClass(darkMode)}>
            {dropoffSearchBusy ? (
              <p className="px-3 py-2 text-[#9d3733]">Searching dropoff...</p>
            ) : dropoffSuggestions.length > 0 ? (
              dropoffSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelectRiderLocation('dropoff', suggestion)}
                  className={`block w-full border-b px-3 py-2 text-left transition last:border-b-0 ${
                    darkMode
                      ? 'border-[#9d3733]/20 hover:bg-[#9d3733]/20'
                      : 'border-[#9d3733]/15 hover:bg-[#9d3733]/10'
                  }`}
                >
                  {suggestion.badge ? (
                    <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-[#15803d]">
                      {suggestion.badge}
                    </span>
                  ) : null}
                  <span className="text-[13px] leading-snug sm:text-sm">{suggestion.placeName}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 opacity-70">
                Places near your pickup appear here, or type 3+ letters to search anywhere.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className={`mb-1.5 block text-[10px] font-semibold uppercase tracking-wide ${
              darkMode ? 'text-[#f2e3bb]/70' : 'text-[#4b2220]'
            }`}
          >
            When
          </label>
          <select
            value={riderForm.when}
            onChange={(e) => setRiderForm((prev) => ({ ...prev, when: e.target.value }))}
            className={fieldClass}
          >
            <option>Pickup now</option>
            <option>Schedule for later</option>
          </select>
        </div>
        <div>
          <label
            className={`mb-1.5 block text-[10px] font-semibold uppercase tracking-wide ${
              darkMode ? 'text-[#f2e3bb]/70' : 'text-[#4b2220]'
            }`}
          >
            Rider
          </label>
          <select
            value={riderForm.riderFor}
            onChange={(e) => setRiderForm((prev) => ({ ...prev, riderFor: e.target.value }))}
            className={fieldClass}
          >
            <option>For me</option>
            <option>For someone else</option>
          </select>
        </div>
      </div>

      <div
        className={`rounded-xl border px-3 py-3 text-xs ${
          darkMode
            ? 'border-[#9d3733]/40 bg-black text-[#f2e3bb]/90'
            : 'border-[#9d3733]/25 bg-white text-[#4b2220]'
        }`}
      >
        <p className="font-semibold text-[#9d3733]">Trip coordinates</p>
        <p className="mt-1 font-mono text-[11px]">
          Pickup: {riderCoords.pickup.lat}, {riderCoords.pickup.lng}
        </p>
        <p className="font-mono text-[11px]">
          Dropoff: {riderCoords.dropoff.lat}, {riderCoords.dropoff.lng}
        </p>
      </div>

      {routeOptions.length > 0 && (
        <div
          className={`rounded-xl border px-2 py-2 ${
            darkMode ? 'border-[#9d3733]/35 bg-black/60' : 'border-[#9d3733]/20 bg-white'
          }`}
        >
          <p className="px-1 pb-0.5 text-xs font-semibold text-[#9d3733]">
            Driving routes (cars) · pick one · est. fare (USD)
          </p>
          <p className="px-1 pb-2 text-[10px] leading-snug opacity-80">
            Roads follow Mapbox driving data. Tap a route to use it. Addresses below list main streets
            along that path.
          </p>
          <div className="space-y-1">
            {routeOptions.map((option, index) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedRouteIndex(index)}
                title={option.roadsLine || option.summaryLine || option.name}
                className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left text-xs transition ${
                  selectedRouteIndex === index
                    ? 'bg-[#9d3733] text-[#f2e3bb]'
                    : darkMode
                      ? 'hover:bg-[#9d3733]/20'
                      : 'hover:bg-[#9d3733]/10'
                }`}
              >
                <div className="flex w-full items-start gap-2">
                  <span className="min-w-0 flex-1 font-semibold leading-snug">
                    {option.name || `Option ${index + 1}`}
                  </span>
                  <span className="shrink-0 text-right leading-snug">
                    {formatUsd(option.priceUsd) ? (
                      <span
                        className={`mb-1 block text-sm font-bold ${
                          selectedRouteIndex === index
                            ? 'text-[#f2e3bb]'
                            : 'text-[#9d3733]'
                        }`}
                      >
                        {formatUsd(option.priceUsd)}
                      </span>
                    ) : null}
                    <span className="block text-[11px] opacity-90">
                      {formatDurationHoursMinutes(option.durationMinutes) ?? 'ETA N/A'}
                    </span>
                    <span className="block text-[11px] opacity-90">
                      {option.distanceKm ? `${option.distanceKm} km` : '—'}
                    </span>
                  </span>
                </div>
                {option.roadsLine ? (
                  <p
                    className={`w-full pl-0 text-[10px] leading-relaxed opacity-90 ${
                      selectedRouteIndex === index ? 'text-[#f2e3bb]/95' : ''
                    }`}
                  >
                    <span className="font-bold opacity-100">Streets: </span>
                    {option.roadsLine}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={riderBusy || !authToken}
        className="font-accent w-full rounded-xl bg-[#9d3733] px-4 py-3.5 text-base font-bold text-[#f2e3bb] shadow-lg shadow-[#9d3733]/25 transition hover:bg-[#842f2b] disabled:opacity-60 xl:py-2.5 xl:text-sm"
      >
        {riderBusy ? 'Working…' : 'Request ride'}
      </button>
    </div>
  )

  const handleSubmitDriverRating = async () => {
    if (!authToken || !activeRide?.id || ratingStarsDraft < 1 || ratingStarsDraft > 5) return
    setRatingBusy(true)
    setRiderMessage('')
    const submittedStars = ratingStarsDraft
    const driverName = activeRide.driver?.name ?? null
    try {
      const ratedRide = await rateRide(authToken, activeRide.id, submittedStars)
      const r = ratedRide?.rating
      setRatingThanks({
        stars: submittedStars,
        driverName,
        ratedAt: r?.createdAt ?? null,
      })
      await fetchRiderData()
    } catch (e) {
      setRiderMessage(e?.message || 'Could not save your rating.')
    } finally {
      setRatingBusy(false)
    }
  }

  const driverStatusLabel = needsRiderRating
    ? 'Trip complete · rate your driver'
    : activeRide
      ? `On trip · ${activeRide.status}`
      : isDriverMapView
        ? 'Driver view · full map, then book'
        : 'Classic view · map + form side by side (desktop)'

  const renderRatingCard = () => (
    <div
      className={`w-full max-w-[min(100%,22rem)] rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md ${
        darkMode
          ? 'border-[#9d3733]/50 bg-black/80 text-[#f2e3bb]'
          : 'border-[#9d3733]/35 bg-white/95 text-[#2d100f]'
      }`}
      role="region"
      aria-label="Rate your driver"
    >
      <p className="text-center text-sm font-bold leading-snug">
        How was your trip{activeRide.driver?.name ? ` with ${activeRide.driver.name}` : ''}?
      </p>
      <div className="mt-2 flex justify-center gap-1.5" role="group" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={ratingBusy}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={ratingStarsDraft === n}
            onClick={() => setRatingStarsDraft(n)}
            className={`rounded-lg px-1.5 py-1 text-2xl leading-none transition disabled:opacity-50 ${
              ratingStarsDraft >= n ? 'text-amber-400' : darkMode ? 'text-[#f2e3bb]/25' : 'text-[#2d100f]/20'
            }`}
          >
            ★
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={ratingBusy || ratingStarsDraft < 1}
        onClick={handleSubmitDriverRating}
        className="font-accent mt-3 w-full rounded-xl bg-[#9d3733] py-2.5 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:opacity-50"
      >
        {ratingBusy ? 'Saving…' : 'Submit rating'}
      </button>
    </div>
  )

  return (
    <section className="mx-auto w-full max-w-[1700px] px-4 pb-14 pt-24 sm:px-6 md:pt-28">
      {toastNotification && (
        <div className="pointer-events-none fixed right-4 top-24 z-[140] max-w-sm">
          <div
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl ${
              darkMode
                ? 'border-[#9d3733]/55 bg-black/85 text-[#f2e3bb]'
                : 'border-[#9d3733]/35 bg-white text-[#2d100f]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p>{toastNotification}</p>
              <button
                type="button"
                onClick={() => setToastNotification('')}
                className="rounded p-1 text-xs opacity-80 transition hover:bg-[#9d3733]/15 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
      {ratingThanks && (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRatingThanks(null)
          }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rating-thanks-title"
            className={`relative z-10 w-full max-w-md rounded-2xl border px-6 py-8 text-center shadow-2xl ${
              darkMode
                ? 'border-[#9d3733]/50 bg-[#111] text-[#f2e3bb]'
                : 'border-[#9d3733]/35 bg-[#fff8eb] text-[#2d100f]'
            }`}
          >
            <p className="font-accent text-2xl font-bold text-[#9d3733]" id="rating-thanks-title">
              Congratulations!
            </p>
            <p className="mt-4 text-base leading-relaxed">
              Thank you for working with us — we are glad you chose JOT for your trip.
            </p>
            <p className="mt-3 text-sm opacity-90">
              You rated{' '}
              <span className="font-semibold">{ratingThanks.driverName ?? 'your driver'}</span> with{' '}
              <span className="font-semibold text-amber-400">{ratingThanks.stars}★</span>.
            </p>
            {ratingThanks.ratedAt && (
              <p className="mt-4 text-xs opacity-75">
                Trip rating saved · {new Date(ratingThanks.ratedAt).toLocaleString()}
              </p>
            )}
            <button
              type="button"
              className="font-accent mt-6 w-full rounded-xl bg-[#9d3733] py-3 text-base font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
              onClick={() => setRatingThanks(null)}
            >
              Continue
            </button>
          </div>
        </div>
      )}
      <div
        className={`px-0 pt-0 pb-0 xl:rounded-2xl xl:border xl:p-8 ${
          darkMode
            ? 'xl:border-[#9d3733]/40 xl:bg-[#0f0f0f]'
            : 'xl:border-[#9d3733]/30 xl:bg-[#fff8eb]'
        }`}
      >
        <div className="mb-4 flex flex-col gap-3 px-0 xl:mb-6 xl:px-0">
          <div className="flex items-center justify-between gap-3">
            <h1
              className={`font-brand text-2xl font-bold xl:text-3xl ${
                darkMode ? 'text-white' : 'text-[#2d100f]'
              }`}
            >
              Book your rider
            </h1>
            <button
              type="button"
              onClick={() => navigateToPage('home')}
              className="shrink-0 rounded-lg border border-[#9d3733]/50 px-3 py-2 text-xs font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10 xl:px-4 xl:text-sm"
            >
              Home
            </button>
          </div>
          {authUser && (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-[11px] font-semibold uppercase tracking-wide ${
                  darkMode ? 'text-[#f2e3bb]/55' : 'text-[#4b2220]/65'
                }`}
              >
                Map layout
              </span>
              <div
                className={`inline-flex rounded-xl border p-0.5 ${
                  darkMode ? 'border-[#9d3733]/40 bg-[#111]' : 'border-[#9d3733]/30 bg-[#fffdf6]'
                }`}
                role="group"
                aria-label="Map layout"
              >
                <button
                  type="button"
                  onClick={() => setMapViewMode('driver')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition sm:px-4 sm:text-sm ${
                    isDriverMapView
                      ? 'bg-[#9d3733] text-[#f2e3bb] shadow-sm'
                      : darkMode
                        ? 'text-[#f2e3bb]/80 hover:bg-[#9d3733]/15'
                        : 'text-[#2d100f] hover:bg-[#9d3733]/10'
                  }`}
                >
                  Driver
                </button>
                <button
                  type="button"
                  onClick={() => setMapViewMode('classic')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition sm:px-4 sm:text-sm ${
                    !isDriverMapView
                      ? 'bg-[#9d3733] text-[#f2e3bb] shadow-sm'
                      : darkMode
                        ? 'text-[#f2e3bb]/80 hover:bg-[#9d3733]/15'
                        : 'text-[#2d100f] hover:bg-[#9d3733]/10'
                  }`}
                >
                  Classic
                </button>
              </div>
            </div>
          )}
        </div>

        {!authUser ? (
          <p className="text-sm text-[#9d3733] xl:px-0">Please sign in to view your rides.</p>
        ) : (
          <div className="space-y-6 pb-24 xl:pb-0">
            <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
              <form
                onSubmit={handleBookingFormSubmit}
                className={`hidden rounded-2xl border p-5 shadow-sm xl:block ${
                  darkMode ? 'border-[#9d3733]/40 bg-[#111]' : 'border-[#9d3733]/30 bg-[#fffdf6]'
                }`}
              >
                <h2 className="font-accent mb-4 text-xl font-bold">Book your ride</h2>
                {bookRideFields}
              </form>

              <div
                className={`relative overflow-hidden shadow-sm ${
                  isDriverMapView
                    ? `xl:rounded-2xl xl:border ${
                        darkMode
                          ? 'xl:border-[#9d3733]/40 xl:bg-[#111]'
                          : 'xl:border-[#9d3733]/30 xl:bg-[#fffdf6]'
                      } -mx-4 w-[calc(100%+2rem)] sm:-mx-6 sm:w-[calc(100%+3rem)] xl:mx-0 xl:w-full`
                    : `rounded-2xl border ${
                        darkMode ? 'border-[#9d3733]/40 bg-[#111]' : 'border-[#9d3733]/30 bg-[#fffdf6]'
                      } w-full`
                }`}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 px-3 pt-3 xl:pt-4">
                  <div
                    className={`pointer-events-auto max-w-[min(100%,28rem)] truncate rounded-2xl border px-4 py-2.5 text-center text-xs font-semibold shadow-lg backdrop-blur-md sm:text-sm ${
                      darkMode
                        ? 'border-[#9d3733]/45 bg-black/75 text-[#f2e3bb]'
                        : 'border-[#9d3733]/30 bg-white/90 text-[#2d100f]'
                    }`}
                  >
                    {driverStatusLabel}
                  </div>
                  {mapboxAccessToken && !mapWebGlError ? (
                    <MapViewControls
                      darkMode={darkMode}
                      basemapMode={riderBasemapMode}
                      onBasemapModeChange={setRiderBasemapMode}
                      trafficOn={riderTrafficOn}
                      onTrafficToggle={setRiderTrafficOn}
                      onStreetView={onOpenStreetView}
                      disabled={!authUser}
                      className="pointer-events-auto w-full max-w-[min(100%,36rem)] px-0"
                    />
                  ) : null}
                  {needsRiderRating ? (
                    <div className="pointer-events-auto flex w-full max-w-[min(100%,22rem)] justify-center xl:hidden">
                      {renderRatingCard()}
                    </div>
                  ) : null}
                </div>
                {mapWebGlError ? (
                  <div
                    className={`flex items-center justify-center px-6 pb-6 pt-14 text-center text-sm leading-relaxed text-[#9d3733] xl:pb-0 xl:pt-0 ${
                      isDriverMapView
                        ? 'h-[calc(100dvh-7.5rem)] min-h-[280px] xl:h-[min(760px,calc(100vh-8rem))] xl:min-h-[560px]'
                        : 'h-[min(68dvh,520px)] min-h-[260px] xl:h-[760px] xl:min-h-[560px]'
                    }`}
                  >
                    {mapWebGlError}
                  </div>
                ) : !mapboxAccessToken ? (
                  <div
                    className={`flex items-center justify-center px-6 pb-6 pt-14 text-center text-sm text-[#9d3733] xl:pb-0 xl:pt-0 ${
                      isDriverMapView
                        ? 'h-[calc(100dvh-7.5rem)] min-h-[280px] xl:h-[min(760px,calc(100vh-8rem))] xl:min-h-[560px]'
                        : 'h-[min(68dvh,520px)] min-h-[260px] xl:h-[760px] xl:min-h-[560px]'
                    }`}
                  >
                    Set `VITE_MAPBOX_ACCESS_TOKEN` in your web `.env` file to load the map.
                  </div>
                ) : (
                  <div
                    ref={mapContainerRef}
                    className={`w-full ${
                      isDriverMapView
                        ? 'h-[calc(100dvh-7.5rem)] min-h-[280px] xl:h-[min(760px,calc(100vh-8rem))] xl:min-h-[560px]'
                        : 'h-[min(68dvh,520px)] min-h-[260px] xl:h-[760px] xl:min-h-[560px]'
                    }`}
                  />
                )}
              </div>
            </div>

            {!needsRiderRating && (
              <button
                type="button"
                onClick={() => setBookModalOpen(true)}
                className={`fixed bottom-5 left-4 right-4 z-40 flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold shadow-xl transition active:scale-[0.98] xl:hidden ${
                  darkMode
                    ? 'bg-[#9d3733] text-[#f2e3bb] shadow-black/40'
                    : 'bg-[#9d3733] text-[#f2e3bb] shadow-[#9d3733]/30'
                }`}
              >
                <span>Book your ride</span>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            {bookModalOpen && (
              <div
                className="fixed inset-0 z-[100] flex flex-col justify-end xl:hidden"
                role="dialog"
                aria-modal="true"
                aria-labelledby="book-ride-sheet-title"
              >
                <button
                  type="button"
                  aria-label="Close booking"
                  className="min-h-0 flex-1 bg-black/55 backdrop-blur-[2px]"
                  onClick={() => setBookModalOpen(false)}
                />
                <div
                  className={`max-h-[min(92dvh,900px)] overflow-y-auto rounded-t-3xl shadow-2xl ${
                    darkMode
                      ? 'border-t border-[#9d3733]/40 bg-[#0a0a0a]'
                      : 'border-t border-[#9d3733]/25 bg-[#fff8eb]'
                  }`}
                  style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
                >
                  <div className="flex justify-center pt-3">
                    <span className="h-1 w-12 rounded-full bg-[#9d3733]/35" aria-hidden />
                  </div>
                  <div className="flex items-start justify-between gap-3 border-b border-[#9d3733]/15 px-5 pb-4 pt-3">
                    <h2
                      id="book-ride-sheet-title"
                      className={`font-accent text-xl font-bold leading-tight ${darkMode ? 'text-white' : 'text-[#2d100f]'}`}
                    >
                      Book your ride
                    </h2>
                    <button
                      type="button"
                      onClick={() => setBookModalOpen(false)}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl leading-none transition ${
                        darkMode
                          ? 'bg-[#1a1a1a] text-[#f2e3bb] hover:bg-[#252525]'
                          : 'bg-white text-[#2d100f] shadow-sm hover:bg-[#fffdf6]'
                      }`}
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>
                  <form onSubmit={handleBookingFormSubmit} className="px-5 pb-6 pt-4">
                    {bookRideFields}
                  </form>
                </div>
              </div>
            )}

            <div
              className={`rounded-xl border p-5 ${
                darkMode ? 'border-[#9d3733]/40 bg-[#111]' : 'border-[#9d3733]/30 bg-[#fffdf6]'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-accent text-xl font-bold">Active Ride</h2>
                <button
                  type="button"
                  onClick={fetchRiderData}
                  disabled={riderBusy}
                  className="rounded-lg border border-[#9d3733]/50 px-3 py-1 text-xs font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10 disabled:opacity-60"
                >
                  Refresh
                </button>
              </div>

              {riderBusy ? (
                <p className="text-sm opacity-80">Loading rider details...</p>
              ) : activeRide ? (
                needsRiderRating ? (
                  <div className="space-y-3 text-sm">
                    <p className="font-semibold leading-snug">
                      Trip finished. Please rate your driver before booking your next ride.
                    </p>
                    <p>
                      <span className="font-bold">Driver:</span> {activeRide.driver?.name ?? '—'}
                    </p>
                    <p>
                      <span className="font-bold">Route:</span> {activeRide.pickupAddress} →{' '}
                      {activeRide.dropoffAddress}
                    </p>
                    {typeof activeRide.fareFinal === 'number' && (
                      <p>
                        <span className="font-bold">Fare:</span> {formatUsd(activeRide.fareFinal)}
                      </p>
                    )}
                    <div className="hidden xl:block">{renderRatingCard()}</div>
                    <p className="text-xs opacity-80 xl:hidden">
                      Use the star rating on the map above to rate your driver.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="font-bold">Status:</span> {activeRide.status}
                    </p>
                    <p>
                      <span className="font-bold">From:</span> {activeRide.pickupAddress}
                    </p>
                    <p>
                      <span className="font-bold">To:</span> {activeRide.dropoffAddress}
                    </p>
                    <p>
                      <span className="font-bold">Fare estimate:</span>{' '}
                      {typeof activeRide.fareEstimate === 'number'
                        ? formatUsd(activeRide.fareEstimate)
                        : (activeRide.fareEstimate ?? 'N/A')}
                    </p>
                    {activeRide.paymentMethod != null && (
                      <p>
                        <span className="font-bold">Payment:</span>{' '}
                        {activeRide.paymentMethod === 'CARD' ? 'Card / digital wallet' : 'Cash on pickup'}{' '}
                        <span className="opacity-75">({activeRide.paymentStatus})</span>
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleCancelRide}
                      disabled={riderBusy}
                      className="mt-2 rounded-lg bg-[#9d3733] px-4 py-2 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:opacity-60"
                    >
                      Cancel active ride
                    </button>
                  </div>
                )
              ) : (
                <p className="text-sm opacity-80">No active ride right now.</p>
              )}
            </div>

            <div
              className={`rounded-xl border p-5 ${
                darkMode ? 'border-[#9d3733]/40 bg-[#111]' : 'border-[#9d3733]/30 bg-[#fffdf6]'
              }`}
            >
              <h2 className="font-accent mb-3 text-xl font-bold">Recent Ride History</h2>
              {rideHistory.length === 0 ? (
                <p className="text-sm opacity-80">No rides found yet.</p>
              ) : (
                <div className="space-y-3">
                  {rideHistory.slice(0, 6).map((ride) => (
                    <article
                      key={ride.id}
                      className={`rounded-lg border p-3 text-sm ${
                        darkMode ? 'border-[#9d3733]/35 bg-black/40' : 'border-[#9d3733]/25 bg-white'
                      }`}
                    >
                      <p>
                        <span className="font-bold">Status:</span> {ride.status}
                      </p>
                      <p>
                        <span className="font-bold">From:</span> {ride.pickupAddress}
                      </p>
                      <p>
                        <span className="font-bold">To:</span> {ride.dropoffAddress}
                      </p>
                      {ride.rating && typeof ride.rating.stars === 'number' && (
                        <p>
                          <span className="font-bold">Your rating:</span> {ride.rating.stars}★
                          {ride.rating.createdAt && (
                            <span className="ml-1 text-[11px] font-normal opacity-75">
                              · {new Date(ride.rating.createdAt).toLocaleString()}
                            </span>
                          )}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>

            {riderMessage && <p className="text-sm text-[#9d3733]">{riderMessage}</p>}
          </div>
        )}
      </div>

      {paymentModalOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !payBusy) {
              setPaymentModalOpen(false)
              resetPaymentModal()
            }
          }}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-ride-title"
            className={`relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl ${
              darkMode
                ? 'border-[#9d3733]/45 bg-[#111] text-[#f2e3bb]'
                : 'border-[#9d3733]/35 bg-[#fff8eb] text-[#2d100f]'
            }`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#9d3733]/20 px-5 py-4">
              <div>
                <h2 id="pay-ride-title" className="font-brand text-xl font-bold">
                  {payView === 'stripe' ? 'Card details' : 'Payment'}
                </h2>
                <p className="mt-1 text-xs opacity-80">
                  {payView === 'stripe'
                    ? 'Enter your credit or debit card. Charges are processed securely by Stripe.'
                    : 'Choose how you pay before we request a driver.'}
                </p>
              </div>
              <button
                type="button"
                disabled={payBusy}
                onClick={() => {
                  setPaymentModalOpen(false)
                  resetPaymentModal()
                }}
                className="rounded-lg p-1.5 text-lg leading-none opacity-70 transition hover:bg-[#9d3733]/15 hover:opacity-100 disabled:opacity-40"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              {payView === 'driver' ? (
                <>
                  <p className="text-xs opacity-80">
                    Select a nearby online driver before payment.
                  </p>
                  <div className="max-h-64 space-y-2 overflow-auto pr-1">
                    {nearbyDrivers.map((driver) => {
                      const selected = selectedDriverId === driver.userId
                      const { etaMinutes, rating, initials } = getDriverVisuals(driver)
                      const far = isFarDriver(driver)
                      return (
                        <button
                          key={driver.userId}
                          type="button"
                          onClick={() => setSelectedDriverId(driver.userId)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                            selected
                              ? 'border-[#9d3733] bg-[#9d3733]/15'
                              : darkMode
                                ? 'border-[#9d3733]/30 hover:bg-[#9d3733]/10'
                                : 'border-[#9d3733]/20 hover:bg-[#9d3733]/10'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                                selected
                                  ? 'border-[#9d3733] bg-[#9d3733]/20 text-[#9d3733]'
                                  : darkMode
                                    ? 'border-[#9d3733]/35 bg-black text-[#f2e3bb]'
                                    : 'border-[#9d3733]/25 bg-white text-[#842f2b]'
                              }`}
                            >
                              {initials}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate font-semibold">{driver.name}</p>
                                <span
                                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                                    darkMode
                                      ? 'border-[#f2e3bb]/25 bg-[#1a1a1a] text-[#f2e3bb]'
                                      : 'border-[#9d3733]/25 bg-white text-[#2d100f]'
                                  }`}
                                >
                                  ★ {rating}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-xs opacity-80">
                                {driver.vehicleColor} {driver.vehicleMake} {driver.vehicleModel} ·{' '}
                                {driver.licensePlate}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="rounded-full bg-[#9d3733]/15 px-2 py-0.5 text-[11px] font-semibold text-[#9d3733]">
                                  ETA {etaMinutes} min
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    darkMode
                                      ? 'bg-[#f2e3bb]/10 text-[#f2e3bb]'
                                      : 'bg-black/5 text-[#4b2220]'
                                  }`}
                                >
                                  {typeof driver.km === 'number'
                                    ? `${driver.km.toFixed(1)} km away`
                                    : 'Nearby'}
                                </span>
                                {far ? (
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight ${
                                      darkMode
                                        ? 'border-amber-400/45 bg-amber-500/15 text-amber-200'
                                        : 'border-amber-600/35 bg-amber-50 text-amber-900'
                                    }`}
                                    title="This driver is far, ETA may be longer."
                                  >
                                    Far · longer ETA
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {selectedDriver && isFarDriver(selectedDriver) ? (
                    <div
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                        darkMode
                          ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
                          : 'border-amber-600/35 bg-amber-50 text-amber-950'
                      }`}
                      role="status"
                    >
                      This driver is far, ETA may be longer.
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={!selectedDriverId}
                    onClick={async () => {
                      try {
                        setPayBusy(true)
                        setPayError('')
                        const ride = await requestPreferredDriver(selectedDriverId)
                        setPendingRideId(ride.id)
                        setPayView('waiting')
                      } catch (error) {
                        setPayError(error?.message || 'Could not request this driver.')
                      } finally {
                        setPayBusy(false)
                      }
                    }}
                    className="w-full rounded-xl bg-[#9d3733] py-3 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:opacity-60"
                  >
                    Request this driver
                  </button>
                </>
              ) : payView === 'waiting' ? (
                <>
                  <div
                    className={`rounded-xl border px-3 py-3 text-xs ${
                      darkMode ? 'border-[#9d3733]/35 bg-black/40' : 'border-[#9d3733]/25 bg-white'
                    }`}
                  >
                    <p className="font-semibold text-[#9d3733]">Waiting for driver acceptance</p>
                    <p className="mt-1 text-sm">{realtimeStatusLine}</p>
                    <p className="mt-1 text-sm">
                      Driver has up to 2 minutes to accept your ride.
                    </p>
                    <p className="mt-2 font-bold">
                      Time left: {Math.floor(waitSecondsLeft / 60)}:
                      {String(waitSecondsLeft % 60).padStart(2, '0')}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={payBusy}
                    onClick={async () => {
                      try {
                        setPayBusy(true)
                        await handleCancelRide()
                        setPayView('driver')
                        setPayError('Ride request cancelled. Choose another driver.')
                      } finally {
                        setPayBusy(false)
                      }
                    }}
                    className={`w-full rounded-xl border-2 py-3 text-sm font-bold transition ${
                      darkMode
                        ? 'border-[#9d3733]/60 text-[#f2e3bb] hover:bg-[#9d3733]/15'
                        : 'border-[#9d3733]/50 text-[#842f2b] hover:bg-[#9d3733]/10'
                    }`}
                  >
                    Cancel and choose another driver
                  </button>
                </>
              ) : payView === 'choose' ? (
                <>
                  <div
                    className={`rounded-xl border px-3 py-2 text-xs ${
                      darkMode ? 'border-[#9d3733]/35 bg-black/40' : 'border-[#9d3733]/25 bg-white'
                    }`}
                  >
                    <p className="opacity-80">Estimated total</p>
                    <p className="font-brand text-lg font-bold text-[#9d3733]">
                      {formatUsd(paymentFareUsd) ?? '—'}
                    </p>
                    <p className="mt-1 text-[11px] opacity-70">
                      Card payments use Stripe (test mode until you go live). Cash is paid to the driver
                      at pickup.
                    </p>
                    {selectedDriver ? (
                      <p className="mt-2 text-[11px] font-semibold text-[#9d3733]">
                        Driver: {selectedDriver.name} ({selectedDriver.vehicleMake}{' '}
                        {selectedDriver.vehicleModel})
                      </p>
                    ) : null}
                  </div>
                  {payError && (
                    <p className="rounded-lg border border-[#9d3733]/40 bg-[#9d3733]/10 px-3 py-2 text-sm text-[#9d3733]">
                      {payError}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={payBusy || riderBusy}
                    onClick={handleStartStripeCheckout}
                    className="w-full rounded-xl bg-[#9d3733] py-3 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:opacity-60"
                  >
                    {payBusy ? 'Starting checkout…' : 'Pay with credit or debit card'}
                  </button>
                  <button
                    type="button"
                    disabled={payBusy || riderBusy}
                    onClick={handlePayCash}
                    className={`w-full rounded-xl border-2 py-3 text-sm font-bold transition disabled:opacity-60 ${
                      darkMode
                        ? 'border-[#9d3733]/60 text-[#f2e3bb] hover:bg-[#9d3733]/15'
                        : 'border-[#9d3733]/50 text-[#842f2b] hover:bg-[#9d3733]/10'
                    }`}
                  >
                    Cash on pickup
                  </button>
                </>
              ) : (
                <>
                  {payError && (
                    <p className="rounded-lg border border-[#9d3733]/40 bg-[#9d3733]/10 px-3 py-2 text-sm text-[#9d3733]">
                      {payError}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={payBusy}
                    onClick={() => {
                      setPayView('driver')
                      setStripeClientSecret(null)
                      setPayError('')
                    }}
                    className="text-xs font-bold text-[#9d3733] underline decoration-[#9d3733]/40"
                  >
                    ← Back to payment options
                  </button>
                  {stripeClientSecret ? (
                    <StripeRidePayment
                      clientSecret={stripeClientSecret}
                      darkMode={darkMode}
                      onSucceeded={handleStripePaymentSucceeded}
                      onError={setPayError}
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
