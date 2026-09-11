import { getCountries, getCountryCallingCode, CountryCode } from 'libphonenumber-js';

/**
 * Pays mis en avant en haut du sélecteur — marché principal de BARDEC
 * (Afrique de l'Ouest) + quelques pays internationaux fréquents. Le reste
 * des ~240 pays de libphonenumber-js reste sélectionnable (recherche),
 * juste pas épinglé en tête de liste.
 */
export const PRIORITY_COUNTRIES: CountryCode[] = [
  'SN', 'CI', 'ML', 'MR', 'GN', 'GM', 'GW', 'CV', 'BJ', 'TG', 'BF', 'NE',
  'NG', 'GH', 'MA', 'DZ', 'TN',
  'FR', 'US', 'GB', 'BE', 'DE', 'ES', 'IT', 'CA', 'CN', 'IN',
];

// Noms français pour les pays les plus utilisés — évite de dépendre
// uniquement d'Intl.DisplayNames (support variable selon moteur JS/web).
// Tout pays absent de cette liste retombe sur Intl.DisplayNames puis,
// en dernier recours, sur son code ISO — jamais un plantage.
const FR_NAMES: Partial<Record<CountryCode, string>> = {
  SN: 'Sénégal', CI: "Côte d'Ivoire", ML: 'Mali', MR: 'Mauritanie',
  GN: 'Guinée', GM: 'Gambie', GW: 'Guinée-Bissau', CV: 'Cap-Vert',
  BJ: 'Bénin', TG: 'Togo', BF: 'Burkina Faso', NE: 'Niger',
  NG: 'Nigeria', GH: 'Ghana', MA: 'Maroc', DZ: 'Algérie', TN: 'Tunisie',
  CM: 'Cameroun', GA: 'Gabon', CD: 'Congo (RDC)', CG: 'Congo',
  FR: 'France', US: 'États-Unis', GB: 'Royaume-Uni', BE: 'Belgique',
  DE: 'Allemagne', ES: 'Espagne', IT: 'Italie', CA: 'Canada',
  CN: 'Chine', IN: 'Inde', PT: 'Portugal', CH: 'Suisse', NL: 'Pays-Bas',
  BR: 'Brésil', JP: 'Japon', KR: 'Corée du Sud', AE: 'Émirats arabes unis',
  SA: 'Arabie saoudite', TR: 'Turquie', RU: 'Russie', ZA: 'Afrique du Sud',
};

let regionNames: Intl.DisplayNames | null | undefined;
function getRegionNames(): Intl.DisplayNames | null {
  if (regionNames !== undefined) return regionNames;
  try {
    regionNames = new Intl.DisplayNames(['fr'], { type: 'region' });
  } catch {
    regionNames = null;
  }
  return regionNames;
}

export function countryDisplayName(code: CountryCode): string {
  if (FR_NAMES[code]) return FR_NAMES[code]!;
  try {
    const name = getRegionNames()?.of(code);
    if (name && name !== code) return name;
  } catch {
    // ignore — fall through to code
  }
  return code;
}

// A→Z regional indicator flag emoji, calculé depuis le code ISO —
// couvre les ~240 pays sans avoir à maintenir un emoji par pays.
export function countryFlagEmoji(code: CountryCode): string {
  return code
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

export interface CountryOption {
  code: CountryCode;
  name: string;
  flag: string;
  callingCode: string;
}

let cachedOptions: CountryOption[] | null = null;

export function getAllCountryOptions(): CountryOption[] {
  if (cachedOptions) return cachedOptions;
  const all = getCountries();
  const options = all.map((code) => ({
    code,
    name: countryDisplayName(code),
    flag: countryFlagEmoji(code),
    callingCode: getCountryCallingCode(code),
  }));

  const priorityIndex = new Map(PRIORITY_COUNTRIES.map((c, i) => [c, i]));
  options.sort((a, b) => {
    const pa = priorityIndex.has(a.code) ? priorityIndex.get(a.code)! : Infinity;
    const pb = priorityIndex.has(b.code) ? priorityIndex.get(b.code)! : Infinity;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name, 'fr');
  });

  cachedOptions = options;
  return options;
}
