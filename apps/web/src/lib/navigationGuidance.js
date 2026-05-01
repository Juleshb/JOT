/** Earth radius in meters */
const R = 6371000

function toRad(d) {
  return (d * Math.PI) / 180
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Mapbox Directions v5 step → display + maneuver icon bucket.
 * @param {Record<string, unknown>} step
 */
export function normalizeRouteStep(step) {
  const m = step?.maneuver && typeof step.maneuver === 'object' ? step.maneuver : {}
  const loc = Array.isArray(m.location) ? m.location : null
  const lng = loc != null ? Number(loc[0]) : null
  const lat = loc != null ? Number(loc[1]) : null
  const type = typeof m.type === 'string' ? m.type : ''
  const modifier = typeof m.modifier === 'string' ? m.modifier : ''
  const instruction = humanizeStep(step, type, modifier)
  const stepDistanceM = typeof step.distance === 'number' ? step.distance : 0
  const voiceList = Array.isArray(step.voiceInstructions)
    ? step.voiceInstructions
    : Array.isArray(step.voice_instructions)
      ? step.voice_instructions
      : []
  const firstVoice = voiceList[0]
  const voicePrimary =
    firstVoice && typeof firstVoice.announcement === 'string' ? firstVoice.announcement : null

  return {
    instruction: voicePrimary || instruction,
    speakText: voicePrimary || instruction,
    type,
    modifier,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    stepDistanceM,
    maneuverKind: maneuverToKind(type, modifier),
  }
}

/**
 * @param {unknown} data — Mapbox Directions JSON
 * @returns {ReturnType<typeof normalizeRouteStep>[]}
 */
export function parseRouteStepsFromDirections(data) {
  const route = data?.routes?.[0]
  const leg = route?.legs?.[0]
  const rawSteps = Array.isArray(leg?.steps) ? leg.steps : []
  return rawSteps.map((s) => normalizeRouteStep(s)).filter((s) => s.instruction)
}

function humanizeStep(step, type, modifier) {
  const m = step?.maneuver && typeof step.maneuver === 'object' ? step.maneuver : {}
  if (typeof m.instruction === 'string' && m.instruction.trim()) {
    return m.instruction.trim()
  }
  const name = typeof step?.name === 'string' && step.name.trim() ? step.name : ''

  if (type === 'arrive') {
    return 'You have arrived'
  }
  if (type === 'depart') {
    return name ? `Head toward ${name}` : 'Start driving'
  }
  if (type === 'roundabout' || type === 'rotary') {
    const mod = modifier ? `${modifier.replace(/_/g, ' ')} ` : ''
    return `Enter the roundabout, take the ${mod}exit${name ? ` toward ${name}` : ''}`.trim()
  }
  if (type === 'merge') {
    return modifier ? `Merge ${modifier.replace(/_/g, ' ')}` : 'Merge'
  }
  if (type === 'fork') {
    return modifier ? `Keep ${modifier.replace(/_/g, ' ')} at the fork` : 'Keep direction at the fork'
  }
  if (type === 'end of road') {
    return modifier ? `Turn ${modifier.replace(/_/g, ' ')} at end of road` : 'Turn at end of road'
  }
  if (type === 'continue' || type === 'new name') {
    return name ? `Continue on ${name}` : 'Continue straight'
  }
  if (type === 'turn' || type === 'ramp' || type === 'on ramp' || type === 'off ramp') {
    const mod = modifier ? modifier.replace(/_/g, ' ') : ''
    const turnBit = mod ? `Turn ${mod}` : 'Turn'
    return name ? `${turnBit} onto ${name}` : turnBit
  }
  if (type === 'notification') {
    return name || 'Continue'
  }

  return name || 'Continue on route'
}

function maneuverToKind(type, modifier) {
  if (type === 'arrive') return 'arrive'
  if (type === 'roundabout' || type === 'rotary' || type === 'exit roundabout' || type === 'exit rotary') {
    return 'roundabout'
  }
  if (modifier === 'uturn' || (type === 'continue' && modifier === 'uturn')) return 'uturn'

  const m = modifier || ''
  if (m === 'left' || m === 'sharp left') return 'left'
  if (m === 'slight left') return 'slight-left'
  if (m === 'right' || m === 'sharp right') return 'right'
  if (m === 'slight right') return 'slight-right'
  if (type === 'fork' && m === 'left') return 'fork-left'
  if (type === 'fork' && m === 'right') return 'fork-right'
  if (type === 'merge' && m === 'left') return 'merge-left'
  if (type === 'merge' && m === 'right') return 'merge-right'

  if (type === 'depart' || type === 'continue' || type === 'new name') return 'straight'

  return 'straight'
}

/**
 * Round for voice: e.g. 847 → "about 850"
 * @param {number} m
 */
export function formatDistanceSpoken(m) {
  if (m >= 1000) {
    const km = m / 1000
    const rounded = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10
    return `${rounded} kilometer${rounded === 1 ? '' : 's'}`
  }
  if (m >= 100) {
    const r = Math.round(m / 50) * 50
    return `${r} meters`
  }
  if (m >= 30) {
    return `${Math.round(m / 10) * 10} meters`
  }
  return 'a short distance'
}

let speechEnabled = true

export function setNavigationSpeechEnabled(on) {
  speechEnabled = Boolean(on)
}

export function isNavigationSpeechEnabled() {
  return speechEnabled
}

/**
 * @param {string} text
 * @param {{ priority?: 'high' | 'normal' }=} opts
 */
export function speakNavigation(text) {
  if (!speechEnabled || typeof window === 'undefined') return
  const t = (text || '').trim()
  if (!t) return
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(t)
    u.rate = 1
    u.pitch = 1
    u.lang = navigator.language || 'en-US'
    synth.speak(u)
  } catch {
    /* ignore TTS errors */
  }
}

export function cancelNavigationSpeech() {
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
}

/** Short attention tone when the active step changes (not a full navigation SDK). */
export function playNavigationCue() {
  if (!speechEnabled || typeof window === 'undefined') return
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.0001
    osc.connect(gain)
    gain.connect(ctx.destination)
    const now = ctx.currentTime
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    osc.start(now)
    osc.stop(now + 0.13)
    window.setTimeout(() => {
      void ctx.close()
    }, 200)
  } catch {
    /* ignore */
  }
}
