import type { CountryCode } from 'libphonenumber-js';
import { getAllCountryOptions } from './phoneCountries';

/**
 * Chantier 3 (checkout, étape Adresse) — suggestions de villes filtrées par
 * pays + pré-remplissage du code postal. Liste curée, pas exhaustive : villes
 * principales des marchés réels de BARDEC (Afrique de l'Ouest + quelques
 * pays internationaux fréquents, cf. PRIORITY_COUNTRIES dans
 * phoneCountries.ts) plutôt qu'une base mondiale complète — beaucoup de ces
 * pays n'ont d'ailleurs pas de système de code postal généralisé, d'où le
 * `zipCode` optionnel. Le champ Ville reste 100% éditable au clavier :
 * ces suggestions sont juste un raccourci, jamais une contrainte.
 */
export interface CityOption {
  name: string;
  zipCode?: string;
}

export const CITIES_BY_COUNTRY: Partial<Record<CountryCode, CityOption[]>> = {
  SN: [
    { name: 'Dakar', zipCode: '10000' },
    { name: 'Pikine', zipCode: '10200' },
    { name: 'Guédiawaye', zipCode: '10300' },
    { name: 'Rufisque', zipCode: '11000' },
    { name: 'Thiès', zipCode: '21000' },
    { name: 'Saint-Louis', zipCode: '32000' },
    { name: 'Ziguinchor', zipCode: '27000' },
    { name: 'Kaolack', zipCode: '25000' },
    { name: 'Touba', zipCode: '23000' },
    { name: 'Mbour', zipCode: '22000' },
  ],
  CI: [
    { name: 'Abidjan' }, { name: 'Bouaké' }, { name: 'Yamoussoukro' },
    { name: 'San-Pédro' }, { name: 'Korhogo' }, { name: 'Daloa' },
  ],
  ML: [{ name: 'Bamako' }, { name: 'Sikasso' }, { name: 'Mopti' }, { name: 'Kayes' }],
  MR: [{ name: 'Nouakchott' }, { name: 'Nouadhibou' }],
  GN: [{ name: 'Conakry' }, { name: 'Kankan' }, { name: 'Labé' }],
  GM: [{ name: 'Banjul' }, { name: 'Serekunda' }],
  GW: [{ name: 'Bissau' }],
  CV: [{ name: 'Praia' }, { name: 'Mindelo' }],
  BJ: [{ name: 'Cotonou' }, { name: 'Porto-Novo' }, { name: 'Parakou' }],
  TG: [{ name: 'Lomé' }, { name: 'Sokodé' }],
  BF: [{ name: 'Ouagadougou' }, { name: 'Bobo-Dioulasso' }],
  NE: [{ name: 'Niamey' }, { name: 'Zinder' }],
  NG: [
    { name: 'Lagos' }, { name: 'Abuja', zipCode: '900001' },
    { name: 'Kano' }, { name: 'Ibadan' }, { name: 'Port Harcourt' },
  ],
  GH: [{ name: 'Accra' }, { name: 'Kumasi' }, { name: 'Tamale' }],
  MA: [
    { name: 'Casablanca', zipCode: '20000' }, { name: 'Rabat', zipCode: '10000' },
    { name: 'Marrakech', zipCode: '40000' }, { name: 'Fès', zipCode: '30000' },
    { name: 'Tanger', zipCode: '90000' },
  ],
  DZ: [
    { name: 'Alger', zipCode: '16000' }, { name: 'Oran', zipCode: '31000' },
    { name: 'Constantine', zipCode: '25000' },
  ],
  TN: [
    { name: 'Tunis', zipCode: '1000' }, { name: 'Sfax', zipCode: '3000' },
    { name: 'Sousse', zipCode: '4000' },
  ],
  FR: [
    { name: 'Paris', zipCode: '75001' }, { name: 'Marseille', zipCode: '13001' },
    { name: 'Lyon', zipCode: '69001' }, { name: 'Toulouse', zipCode: '31000' },
    { name: 'Nice', zipCode: '06000' }, { name: 'Nantes', zipCode: '44000' },
    { name: 'Strasbourg', zipCode: '67000' }, { name: 'Bordeaux', zipCode: '33000' },
    { name: 'Lille', zipCode: '59000' }, { name: 'Rennes', zipCode: '35000' },
  ],
  BE: [{ name: 'Bruxelles', zipCode: '1000' }, { name: 'Anvers', zipCode: '2000' }, { name: 'Liège', zipCode: '4000' }],
  DE: [{ name: 'Berlin', zipCode: '10115' }, { name: 'Munich', zipCode: '80331' }, { name: 'Hambourg', zipCode: '20095' }],
  ES: [{ name: 'Madrid', zipCode: '28001' }, { name: 'Barcelone', zipCode: '08001' }],
  IT: [{ name: 'Rome', zipCode: '00100' }, { name: 'Milan', zipCode: '20100' }],
  GB: [{ name: 'Londres', zipCode: 'EC1A' }, { name: 'Manchester', zipCode: 'M1' }],
  US: [{ name: 'New York', zipCode: '10001' }, { name: 'Los Angeles', zipCode: '90001' }],
  CA: [{ name: 'Montréal', zipCode: 'H1A' }, { name: 'Toronto', zipCode: 'M1A' }],
  CN: [{ name: 'Pékin' }, { name: 'Shanghai' }],
  IN: [{ name: 'Mumbai' }, { name: 'Delhi' }],
};

export function normalizeText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Résout un texte de pays libre (ce que l'utilisateur a tapé) vers son code ISO connu, ou null. */
export function resolveCountryCode(countryText: string): CountryCode | null {
  const q = normalizeText(countryText);
  if (!q) return null;
  const match = getAllCountryOptions().find(
    c => normalizeText(c.name) === q || normalizeText(c.code) === q
  );
  return match?.code ?? null;
}

/** Villes suggérées pour un pays (texte libre), éventuellement filtrées par un préfixe déjà tapé. */
export function citiesForCountryText(countryText: string, cityQuery = '', limit = 8): CityOption[] {
  const code = resolveCountryCode(countryText);
  if (!code) return [];
  const all = CITIES_BY_COUNTRY[code] ?? [];
  const q = normalizeText(cityQuery);
  const filtered = q ? all.filter(c => normalizeText(c.name).includes(q)) : all;
  return filtered.slice(0, limit);
}
