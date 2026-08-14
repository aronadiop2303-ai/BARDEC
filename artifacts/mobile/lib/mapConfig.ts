/**
 * mapConfig.ts — Couche d'abstraction fournisseur de carte
 *
 * Pour remplacer le fournisseur de tuiles : changer `provider` +
 * `tileUrlTemplate` ici. ProximityMap.tsx / .web.tsx lisent cette config —
 * aucune autre modification requise.
 *
 * 2026-08-14 — migré de OSM (tile.openstreetmap.org) vers MapTiler : les
 * tuiles OSM brutes bloquaient systématiquement les requêtes de l'app
 * (en-tête `x-blocked`, confirmé par test HTTP direct) — leur politique
 * d'usage interdit explicitement l'usage in-app/production sur ce domaine.
 * MapTiler nécessite une clé API (gratuite) dans EXPO_PUBLIC_MAP_TOKEN.
 */

export type MapProvider = 'osm' | 'maptiler' | 'mapbox' | 'googlemaps';

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

const MAP_TOKEN = process.env.EXPO_PUBLIC_MAP_TOKEN ?? '';

const MAPTILER_CONFIG: MapConfig = {
  provider: 'maptiler',
  tileUrlTemplate: `https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${MAP_TOKEN}`,
  attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  defaultZoom: 14,
  minZoom: 10,
  maxZoom: 20,
};

// Tuiles OSM brutes — gardé pour référence seulement, ne pas réutiliser
// telles quelles (bloquées en usage in-app, voir note ci-dessus).
// const OSM_CONFIG: MapConfig = {
//   provider: 'osm',
//   tileUrlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
//   attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
//   defaultZoom: 14, minZoom: 10, maxZoom: 19, subdomains: 'abc',
// };

// Pour migrer vers Mapbox, remplacer par :
// const MAPBOX_CONFIG: MapConfig = {
//   provider: 'mapbox',
//   tileUrlTemplate: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${process.env.EXPO_PUBLIC_MAP_TOKEN}`,
//   attribution: '&copy; <a href="https://mapbox.com">Mapbox</a>',
//   defaultZoom: 14, minZoom: 10, maxZoom: 20,
// };

export const mapConfig: MapConfig = MAPTILER_CONFIG;
