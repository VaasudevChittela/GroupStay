import { createElement } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../lib/theme';

export type MapPin = { label: string; latitude: number; longitude: number; color?: string };

// A small OpenStreetMap (Leaflet) map with one pin per person. No API key needed.
function mapHtml(pins: MapPin[], hotel?: { label: string; latitude: number; longitude: number } | null) {
  const data = JSON.stringify({ pins, hotel: hotel ?? null });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0}.pin{display:inline-block;transform:translate(-50%,-50%);background:#2F5BEA;color:#fff;border-radius:999px;padding:2px 8px;font:600 12px -apple-system,Helvetica,Arial;white-space:nowrap;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const { pins, hotel } = ${data};
  const map = L.map('map');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const points = [];
  pins.forEach((p) => {
    const icon = L.divIcon({ className: '', iconSize: null, html: '<div class="pin">' + p.label.replace(/</g, '&lt;') + '</div>' });
    L.marker([p.latitude, p.longitude], { icon }).addTo(map);
    points.push([p.latitude, p.longitude]);
  });
  if (hotel) {
    L.marker([hotel.latitude, hotel.longitude]).addTo(map).bindTooltip(hotel.label);
    points.push([hotel.latitude, hotel.longitude]);
  }
  if (points.length === 1) map.setView(points[0], 15);
  else if (points.length) map.fitBounds(points, { padding: [40, 40] });
  else map.setView([39.5, -98.35], 3);
</script></body></html>`;
}

export default function LocationsMap({ pins, hotel, height = 320 }: { pins: MapPin[]; hotel?: MapPin | null; height?: number }) {
  const html = mapHtml(pins, hotel);
  return (
    <View style={{ height, width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: 16, backgroundColor: colors.cardAlt }}>
      {Platform.OS === 'web'
        ? createElement('iframe', { srcDoc: html, style: { border: 0, width: '100%', height: '100%' }, title: 'Locations map' })
        : <WebView originWhitelist={['*']} source={{ html }} style={{ flex: 1 }} />}
    </View>
  );
}
