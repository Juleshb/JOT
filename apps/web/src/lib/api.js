const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

async function request(path, options = {}) {
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: mergedHeaders,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.message ?? data?.error ?? 'Request failed')
  }

  return data
}

export async function loginWithGoogle(idToken) {
  return request('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  })
}

export async function loginWithPassword(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  })
}

/** @param {{ email: string, password: string, name: string, phone?: string | null, role: 'RIDER' | 'DRIVER', vehicle?: { make: string, model: string, color: string, licensePlate: string } }} body */
export async function registerAccount(body) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: body.email.trim().toLowerCase(),
      password: body.password,
      name: body.name.trim(),
      phone: body.phone?.trim() || undefined,
      role: body.role,
      vehicle: body.vehicle,
    }),
  })
}

export async function getMe(token) {
  return request('/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function updateMe(token, payload) {
  return request('/auth/me', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
}

export async function getActiveRide(token) {
  return request('/rides/active', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function getRideHistory(token, limit = 10) {
  return request(`/rides/history?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function cancelRide(token, rideId) {
  return request(`/rides/${rideId}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function createRide(token, payload) {
  return request('/rides', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
}

/** Rider: update pickup/dropoff while status is REQUESTED. */
export async function updateRideLocations(token, rideId, payload) {
  return request(`/rides/${rideId}/locations`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
}

export async function setRidePayment(token, rideId, payload) {
  return request(`/rides/${rideId}/payment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
}

export async function getNearbyDrivers(token, { lat, lng }) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  })
  return request(`/rides/nearby-drivers?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function createRidePaymentIntent(token, { amountUsd }) {
  return request('/payments/ride-intent', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amountUsd }),
  })
}

export async function updateDriverStatus(token, payload) {
  return request('/drivers/me/status', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
}

export async function acceptRide(token, rideId) {
  return request(`/rides/${rideId}/accept`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function startRide(token, rideId) {
  return request(`/rides/${rideId}/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function completeRide(token, rideId, body = {}) {
  return request(`/rides/${rideId}/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

/** Rider: 1–5 stars after trip (ride must be COMPLETED and unrated). */
export async function rateRide(token, rideId, stars) {
  return request(`/rides/${rideId}/rate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ stars }),
  })
}

export async function adminOverview(token) {
  return request('/admin/overview', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function adminUsers(token, { role, q, take } = {}) {
  const params = new URLSearchParams()
  if (role) params.set('role', role)
  if (q) params.set('q', q)
  if (take) params.set('take', String(take))
  const qs = params.toString()
  return request(`/admin/users${qs ? `?${qs}` : ''}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function adminUpdateUser(token, userId, payload) {
  return request(`/admin/users/${userId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
}

export async function adminDriverVerification(token, driverUserId, payload) {
  return request(`/admin/drivers/${driverUserId}/verification`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
}

export async function adminRides(token, { status, take } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (take) params.set('take', String(take))
  const qs = params.toString()
  return request(`/admin/rides${qs ? `?${qs}` : ''}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export { API_BASE_URL }
