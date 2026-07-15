/**
 * mapConfig.ts — Couche d'abstraction fournisseur de carte
 *
 * Pour remplacer OSM par Mapbox ou Google Maps :
 *   1. Changer `provider` + `tileUrlTemplate` ici
 *   2. Ajouter la clé API dans les secrets Expo (EXPO_PUBLIC_MAP_TOKEN)
 *   3. ProximityMap.tsx lit cette config — aucune autre modification requise
 */

export type MapProvider = 'osm' | 'mapbox' | 'googlemaps';

export interface MapConfig {
  provider: MapProvider;
  /** Template tuiles XYZ — {z}/{x}/{y}/{s} remplacés par Leaflet */
  tileUrlTemplate: string;
  attribution: string;
  defaultZoom: number;
  minZoom: number;
  maxZoom: number;
  subdomains?: string;
}

const OSM_CONFIG: MapConfig = {
  provider: 'osm',
  tileUrlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
  defaultZoom: 14,
  minZoom: 10,
  maxZoom: 19,
  subdomains: 'abc',
};

// Pour migrer vers Mapbox, remplacer OSM_CONFIG par :
// const MAPBOX_CONFIG: MapConfig = {
//   provider: 'mapbox',
//   tileUrlTemplate: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${process.env.EXPO_PUBLIC_MAP_TOKEN}`,
//   attribution: '&copy; <a href="https://mapbox.com">Mapbox</a>',
//   defaultZoom: 14, minZoom: 10, maxZoom: 20,
// };

export const mapConfig: MapConfig = OSM_CONFIG;
