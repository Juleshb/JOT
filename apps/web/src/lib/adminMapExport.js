import mapboxgl from 'mapbox-gl'
import { RIDE_MAP_COLORS } from './adminMapRides'

function resolveDriverPoint(ride, driversByUserId) {
  const id = ride.driver?.id
  if (!id) return null
  const live = driversByUserId[id]
  if (live) return live
  if (ride.driver?.lat != null && ride.driver?.lng != null) {
    return { lat: ride.driver.lat, lng: ride.driver.lng }
  }
  return null
}

/** Fit map viewport to a single ride (pickup, dropoff, driver if any). */
export function fitMapToRide(map, ride, driversByUserId = {}, { animate = true } = {}) {
  if (!map || !ride?.pickupLat) return

  const bounds = new mapboxgl.LngLatBounds()
  bounds.extend([ride.pickupLng, ride.pickupLat])
  bounds.extend([ride.dropoffLng, ride.dropoffLat])

  const driver = resolveDriverPoint(ride, driversByUserId)
  if (driver) {
    bounds.extend([driver.lng, driver.lat])
  }

  map.fitBounds(bounds, {
    padding: { top: 100, bottom: 100, left: 80, right: 80 },
    maxZoom: 15,
    duration: animate ? 1400 : 0,
  })
}

function waitForMapReady(map, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!map) {
      resolve()
      return
    }

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    const timeout = window.setTimeout(finish, timeoutMs)

    const onReady = () => {
      map.triggerRepaint()
      window.setTimeout(() => {
        window.clearTimeout(timeout)
        finish()
      }, 600)
    }

    if (map.loaded()) {
      map.once('idle', onReady)
      map.triggerRepaint()
    } else {
      map.once('load', () => {
        map.once('idle', onReady)
        map.triggerRepaint()
      })
    }
  })
}

function canvasScale(map) {
  const mapCanvas = map.getCanvas()
  const container = map.getContainer()
  const cssW = container.clientWidth || 1
  const cssH = container.clientHeight || 1
  return {
    mapCanvas,
    scaleX: mapCanvas.width / cssW,
    scaleY: mapCanvas.height / cssH,
    mapW: mapCanvas.width,
    mapH: mapCanvas.height,
  }
}

/** Project lng/lat to pixel coords on the export canvas (map section). */
function projectToExport(map, lng, lat, headerH, scaleX, scaleY) {
  const p = map.project([lng, lat])
  return {
    x: p.x * scaleX,
    y: p.y * scaleY + headerH,
  }
}

function drawCircleMarker(ctx, x, y, radius, fill, label, stroke = '#ffffff') {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = Math.max(2, radius * 0.2)
  ctx.stroke()
  if (label) {
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.round(radius * 1.1)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
}

function drawExportMarkers(ctx, map, ride, driversByUserId, headerH, scaleX, scaleY) {
  const status = ride.status ?? 'REQUESTED'
  const colors = RIDE_MAP_COLORS[status] ?? RIDE_MAP_COLORS.REQUESTED

  const pickup = projectToExport(map, ride.pickupLng, ride.pickupLat, headerH, scaleX, scaleY)
  drawCircleMarker(ctx, pickup.x, pickup.y, 14 * scaleX, colors.pickup, 'P')

  const dropoff = projectToExport(map, ride.dropoffLng, ride.dropoffLat, headerH, scaleX, scaleY)
  drawCircleMarker(ctx, dropoff.x, dropoff.y, 14 * scaleX, colors.dropoff, 'D')

  const riderPt = projectToExport(map, ride.pickupLng, ride.pickupLat, headerH, scaleX, scaleY)
  drawCircleMarker(
    ctx,
    riderPt.x + 22 * scaleX,
    riderPt.y - 18 * scaleY,
    16 * scaleX,
    '#0ea5e9',
    ride.rider?.name?.[0]?.toUpperCase() ?? 'R',
  )

  const driver = resolveDriverPoint(ride, driversByUserId)
  if (driver) {
    const dPt = projectToExport(map, driver.lng, driver.lat, headerH, scaleX, scaleY)
    drawCircleMarker(ctx, dPt.x, dPt.y, 16 * scaleX, '#9d3733', 'D')
  }
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function captureMapImage(map) {
  const { mapCanvas, mapW, mapH } = canvasScale(map)
  if (!mapW || !mapH) {
    throw new Error('Map is not ready for export yet.')
  }

  map.triggerRepaint()

  let dataUrl
  try {
    dataUrl = mapCanvas.toDataURL('image/png')
  } catch {
    dataUrl = null
  }

  if (!dataUrl || dataUrl === 'data:,') {
    throw new Error('Could not read map image. Reload the page and try again.')
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ img, mapW, mapH })
    img.onerror = () => reject(new Error('Failed to encode map image.'))
    img.src = dataUrl
  })
}

/**
 * Download a structured PNG: header (rider, status), map canvas, footer (route summary).
 */
export async function downloadRideMapSnapshot(map, ride, driversByUserId = {}) {
  if (!map || !ride) return

  fitMapToRide(map, ride, driversByUserId, { animate: false })
  map.resize()
  await waitForMapReady(map)

  const { img, mapW, mapH } = await captureMapImage(map)
  const { scaleX, scaleY } = canvasScale(map)

  const headerH = Math.round(140 * (mapW / Math.max(map.getContainer().clientWidth, 400)))
  const footerH = Math.round(120 * (mapW / Math.max(map.getContainer().clientWidth, 400)))
  const pad = Math.round(32 * (mapW / Math.max(map.getContainer().clientWidth, 400)))

  const out = document.createElement('canvas')
  out.width = mapW
  out.height = mapH + headerH + footerH
  const ctx = out.getContext('2d')
  if (!ctx) return

  const status = ride.status ?? 'REQUESTED'
  const colors = RIDE_MAP_COLORS[status] ?? RIDE_MAP_COLORS.REQUESTED
  const riderName = ride.rider?.name ?? 'Rider'

  ctx.fillStyle = '#fffbf5'
  ctx.fillRect(0, 0, out.width, out.height)

  ctx.fillStyle = '#9d3733'
  ctx.font = `bold ${Math.round(28 * scaleX)}px system-ui, sans-serif`
  ctx.fillText('JOT Transportation', pad, Math.round(48 * scaleY))

  ctx.fillStyle = colors.trip
  ctx.font = `bold ${Math.round(22 * scaleX)}px system-ui, sans-serif`
  ctx.fillText(`${ride.status} · Trip snapshot`, pad, Math.round(82 * scaleY))

  ctx.fillStyle = '#2d100f'
  ctx.font = `${Math.round(18 * scaleX)}px system-ui, sans-serif`
  ctx.fillText(riderName, pad, Math.round(112 * scaleY))

  if (ride.driver?.name) {
    ctx.fillStyle = '#4b5563'
    ctx.font = `${Math.round(15 * scaleX)}px system-ui, sans-serif`
    ctx.fillText(`Driver: ${ride.driver.name}`, pad, Math.round(132 * scaleY))
  }

  ctx.drawImage(img, 0, headerH, mapW, mapH)
  drawExportMarkers(ctx, map, ride, driversByUserId, headerH, scaleX, scaleY)

  const footerY = headerH + mapH + pad
  ctx.strokeStyle = '#9d3733'
  ctx.lineWidth = 3 * scaleX
  ctx.beginPath()
  ctx.moveTo(pad, footerY - 12 * scaleY)
  ctx.lineTo(out.width - pad, footerY - 12 * scaleY)
  ctx.stroke()

  ctx.fillStyle = '#2d100f'
  ctx.font = `bold ${Math.round(14 * scaleX)}px system-ui, sans-serif`
  ctx.fillText('Pickup', pad, footerY + 8 * scaleY)
  ctx.font = `${Math.round(13 * scaleX)}px system-ui, sans-serif`
  const pickupLines = wrapText(ctx, ride.pickupAddress ?? '', out.width - pad * 2)
  pickupLines.slice(0, 2).forEach((ln, i) => {
    ctx.fillText(ln, pad, footerY + 28 * scaleY + i * 18 * scaleY)
  })

  const mid = out.width / 2
  ctx.fillStyle = colors.trip
  ctx.font = `bold ${Math.round(20 * scaleX)}px system-ui, sans-serif`
  ctx.fillText('→', mid - 8 * scaleX, footerY + 36 * scaleY)

  ctx.fillStyle = '#2d100f'
  ctx.font = `bold ${Math.round(14 * scaleX)}px system-ui, sans-serif`
  ctx.fillText('Dropoff', mid + 8 * scaleX, footerY + 8 * scaleY)
  ctx.font = `${Math.round(13 * scaleX)}px system-ui, sans-serif`
  const dropLines = wrapText(ctx, ride.dropoffAddress ?? '', out.width / 2 - pad)
  dropLines.slice(0, 2).forEach((ln, i) => {
    ctx.fillText(ln, mid + 8 * scaleX, footerY + 28 * scaleY + i * 18 * scaleY)
  })

  ctx.fillStyle = '#6b7280'
  ctx.font = `${Math.round(12 * scaleX)}px system-ui, sans-serif`
  const meta = [
    ride.fareEstimate != null ? `Est. $${Number(ride.fareEstimate).toFixed(2)}` : null,
    new Date().toLocaleString(),
  ]
    .filter(Boolean)
    .join(' · ')
  ctx.fillText(meta, pad, out.height - pad)

  const slug = riderName.replace(/\s+/g, '-').toLowerCase().slice(0, 24)
  const filename = `jot-trip-${slug}-${status.toLowerCase()}.png`

  const url = out.toDataURL('image/png')
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}
