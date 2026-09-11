export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  rtl?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true },
  { code: 'wo', name: 'Wolof', nativeName: 'Wolof', flag: '🇸🇳' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', flag: '🇳🇬' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flag: '🇰🇪' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', flag: '🇪🇹' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', flag: '🇳🇬' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo', flag: '🇳🇬' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', flag: '🇿🇦' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
];

export const DEFAULT_LANGUAGE = 'fr';

// Langues secondaires — pas encore traduites (constants/translations.ts n'a
// aucune entrée pour ces codes). Volontairement séparées de LANGUAGES
// (jamais fusionnées dedans) : LanguageContext.tsx utilise LANGUAGES comme
// liste canonique des langues valides/sélectionnables (détection auto,
// validation de la langue sauvegardée) — les y ajouter rendrait ces langues
// sélectionnables alors qu'aucune traduction n'existe. Affichées sur l'écran
// de sélection avec le badge "Bientôt disponible", lignes non cliquables.
export const COMING_SOON_LANGUAGES: Language[] = [
  // Africaines
  { code: 'ff', name: 'Fula',       nativeName: 'Pulaar',          flag: '🇸🇳' },
  { code: 'ln', name: 'Lingala',    nativeName: 'Lingála',         flag: '🇨🇩' },
  { code: 'bm', name: 'Bambara',    nativeName: 'Bamanankan',      flag: '🇲🇱' },
  { code: 'so', name: 'Somali',     nativeName: 'Soomaali',        flag: '🇸🇴' },
  { code: 'om', name: 'Oromo',      nativeName: 'Afaan Oromoo',    flag: '🇪🇹' },
  { code: 'mg', name: 'Malagasy',   nativeName: 'Malagasy',        flag: '🇲🇬' },
  { code: 'sn', name: 'Shona',      nativeName: 'chiShona',        flag: '🇿🇼' },
  { code: 'xh', name: 'Xhosa',      nativeName: 'isiXhosa',        flag: '🇿🇦' },
  { code: 'rw', name: 'Kinyarwanda',nativeName: 'Ikinyarwanda',    flag: '🇷🇼' },
  { code: 'ak', name: 'Akan/Twi',   nativeName: 'Akan',            flag: '🇬🇭' },
  // Internationales
  { code: 'nl', name: 'Dutch',      nativeName: 'Nederlands',      flag: '🇳🇱' },
  { code: 'pl', name: 'Polish',     nativeName: 'Polski',          flag: '🇵🇱' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt',      flag: '🇻🇳' },
  { code: 'th', name: 'Thai',       nativeName: 'ไทย',             flag: '🇹🇭' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia',flag: '🇮🇩' },
  { code: 'fa', name: 'Persian',    nativeName: 'فارسی',           flag: '🇮🇷', rtl: true },
  { code: 'ur', name: 'Urdu',       nativeName: 'اردو',            flag: '🇵🇰', rtl: true },
  { code: 'bn', name: 'Bengali',    nativeName: 'বাংলা',           flag: '🇧🇩' },
  { code: 'uk', name: 'Ukrainian',  nativeName: 'Українська',      flag: '🇺🇦' },
  { code: 'el', name: 'Greek',      nativeName: 'Ελληνικά',        flag: '🇬🇷' },
];
