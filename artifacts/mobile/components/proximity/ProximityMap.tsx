/**
 * ProximityMap.tsx — Carte Leaflet/OSM dans une WebView
 *
 * Couche d'abstraction : le fournisseur de tuiles est lu depuis lib/mapConfig.ts.
 * Pour migrer vers Mapbox ou Google Maps, modifier uniquement mapConfig.ts.
 *
 * Props :
 *   center          — {lat, lng} centre de la carte
 *   markers         — liste de ProximityShop à afficher
 *   userLocation    — point bleu de position actuelle
 *   onMarkerPress   — callback quand un marqueur est cliqué
 *   draggable       — mode sélection de position (marker déplaçable)
 *   onLocationSelected — callback (lat, lng) en mode draggable
 *   height          — hauteur du composant (défaut 300)
 *   zoom            — niveau de zoom initial (défaut depuis mapConfig)
 */

import React, { useCallback } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { mapConfig } from '@/lib/mapConfig';
import { ProximityShop } from '@/constants/proximityData';

export interface ProximityMapProps {
  center: { lat: number; lng: number };
  markers?: ProximityShop[];
  userLocation?: { lat: number; lng: number };
  onMarkerPress?: (shopId: string) => void;
  draggable?: boolean;
  onLocationSelected?: (lat: number, lng: number) => void;
  height?: number | string;
  zoom?: number;
}

function buildHTML(
  center: { lat: number; lng: number },
  zoom: number,
  markers: ProximityShop[],
  userLocation: { lat: number; lng: number } | undefined,
  tileUrl: string,
  attribution: string,
  subdomains: string,
  draggable: boolean,
): string {
  const markersJson = JSON.stringify(
    markers.map(s => ({
      id: s.id,
      name: s.name.replace(/'/g, "\\'"),
      lat: s.lat,
      lng: s.lng,
      category: s.category,
      subcategory: (s.subcategory ?? '').replace(/'/g, "\\'"),
      distance: s.distance_km ?? null,
    }))
  );

  const userDot = userLocation
    ? `L.circleMarker([${userLocation.lat},${userLocation.lng}],{radius:8,fillColor:'#1A56DB',color:'white',weight:3,opacity:1,fillOpacity:1}).addTo(map);`
    : '';

  const dragScript = draggable ? `
var dm=L.marker([${center.lat},${center.lng}],{draggable:true}).addTo(map);
function rpt(ll){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'locationSelected',lat:ll.lat,lng:ll.lng}));}
dm.on('dragend',function(){rpt(dm.getLatLng());});
map.on('click',function(e){dm.setLatLng(e.latlng);rpt(e.latlng);});
` : '';

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#EEF3FB}
#map{width:100%;height:100vh}
.lf-popup .leaflet-popup-content-wrapper{border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.15);padding:0;border:none}
.lf-popup .leaflet-popup-content{margin:0}
.pi{padding:10px 14px;min-width:150px}
.pn{font-size:13px;font-weight:700;color:#0D1B3E;margin-bottom:2px}
.ps{font-size:11px;color:#6B7DB3}
.pd{font-size:11px;color:#22C55E;margin-top:3px;font-weight:600}
</style></head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map',{zoomControl:true,tap:false}).setView([${center.lat},${center.lng}],${zoom});
L.tileLayer('${tileUrl}',{attribution:'${attribution}',maxZoom:19,subdomains:'${subdomains}'}).addTo(map);
var shops=${markersJson};
var C={'Alimentation & Table':'#F59E0B','Restauration & Loisirs':'#EF4444','Bricolage & Maison':'#6366F1','Beauté & Mode':'#EC4899','Santé & Hygiène':'#22C55E','Culture & Tech':'#0EA5E9','Services & Entretien':'#8B5CF6'};
shops.forEach(function(s){
  var c=C[s.category]||'#1A56DB';
  var ic=L.divIcon({className:'',html:'<div style="width:32px;height:32px;background:'+c+';border:3px solid white;border-radius:50%;box-shadow:0 3px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><div style="width:8px;height:8px;background:white;border-radius:50%"></div></div>',iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-18]});
  var dist=s.distance!=null?'<div class="pd">📍 '+s.distance.toFixed(1)+' km</div>':'';
  var popup='<div class="pi"><div class="pn">'+s.name+'</div><div class="ps">'+(s.subcategory||s.category)+'</div>'+dist+'</div>';
  var m=L.marker([s.lat,s.lng],{icon:ic});
  m.bindPopup(popup,{className:'lf-popup',closeButton:false,maxWidth:220});
  m.on('click',function(){m.openPopup();if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'markerPress',shopId:s.id}));});
  m.addTo(map);
});
${userDot}
${dragScript}
</script></body></html>`;
}

export default function ProximityMap({
  center,
  markers = [],
  userLocation,
  onMarkerPress,
  draggable = false,
  onLocationSelected,
  height = 300,
  zoom,
}: ProximityMapProps) {
  const cfg = mapConfig;
  const zLevel = zoom ?? cfg.defaultZoom;

  const html = buildHTML(
    center, zLevel, markers, userLocation,
    cfg.tileUrlTemplate, cfg.attribution,
    cfg.subdomains ?? 'abc', draggable,
  );

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'markerPress' && onMarkerPress) onMarkerPress(data.shopId);
      if (data.type === 'locationSelected' && onLocationSelected) onLocationSelected(data.lat, data.lng);
    } catch { /* ignore */ }
  }, [onMarkerPress, onLocationSelected]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webFallback, { height: height as number }]}>
        <Text style={styles.webFallbackText}>🗺️ Carte disponible sur iOS et Android</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html, baseUrl: '' }}
        style={styles.webView}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowUniversalAccessFromFileURLs
        originWhitelist={['*']}
        onMessage={handleMessage}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden', backgroundColor: '#EEF3FB' },
  webView: { flex: 1, backgroundColor: 'transparent' },
  webFallback: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EEF3FB',
    borderRadius: 12,
  },
  webFallbackText: { color: '#6B7DB3', fontSize: 14 },
});
