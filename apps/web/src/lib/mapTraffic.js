const TRAFFIC_SOURCE_ID = 'jot-mapbox-traffic'
const TRAFFIC_LAYER_ID = 'jot-mapbox-traffic-line'

function trafficInsertBeforeId(map) {
  const layers = map.getStyle()?.layers
  if (!Array.isArray(layers)) return undefined
  const symbol = [...layers].reverse().find((l) => l.type === 'symbol')
  return symbol?.id
}

export function addTrafficToMap(map) {
  if (!map || typeof map.isStyleLoaded !== 'function' || !map.isStyleLoaded()) return
  if (map.getSource(TRAFFIC_SOURCE_ID)) {
    if (!map.getLayer(TRAFFIC_LAYER_ID)) {
      map.addLayer(
        {
          id: TRAFFIC_LAYER_ID,
          type: 'line',
          source: TRAFFIC_SOURCE_ID,
          'source-layer': 'traffic',
          minzoom: 6,
          paint: {
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              6,
              0,
              10,
              1.2,
              14,
              2,
              18,
              3,
            ],
            'line-color': [
              'match',
              ['get', 'congestion'],
              'low',
              '#39c66d',
              'moderate',
              '#ff8c1a',
              'heavy',
              '#ff0015',
              'severe',
              '#981b20',
              '#6b7280',
            ],
            'line-opacity': 0.88,
          },
        },
        trafficInsertBeforeId(map),
      )
    }
    return
  }

  map.addSource(TRAFFIC_SOURCE_ID, {
    type: 'vector',
    url: 'mapbox://mapbox.mapbox-traffic-v1',
  })

  map.addLayer(
    {
      id: TRAFFIC_LAYER_ID,
      type: 'line',
      source: TRAFFIC_SOURCE_ID,
      'source-layer': 'traffic',
      minzoom: 6,
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          6,
          0,
          10,
          1.2,
          14,
          2,
          18,
          3,
        ],
        'line-color': [
          'match',
          ['get', 'congestion'],
          'low',
          '#39c66d',
          'moderate',
          '#ff8c1a',
          'heavy',
          '#ff0015',
          'severe',
          '#981b20',
          '#6b7280',
        ],
        'line-opacity': 0.88,
      },
    },
    trafficInsertBeforeId(map),
  )
}

export function removeTrafficFromMap(map) {
  if (!map) return
  try {
    if (map.getLayer(TRAFFIC_LAYER_ID)) map.removeLayer(TRAFFIC_LAYER_ID)
    if (map.getSource(TRAFFIC_SOURCE_ID)) map.removeSource(TRAFFIC_SOURCE_ID)
  } catch {
    /* style may be reloading */
  }
}
