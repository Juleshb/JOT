/** Opens Google Street View (pano) near a point in a new tab. Requires network. */
export function openGoogleStreetView(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return
  }
  const url = `https://www.google.com/maps?layer=c&cbll=${lat},${lng}&cbp=11,0,0,0,0`
  window.open(url, '_blank', 'noopener,noreferrer')
}
