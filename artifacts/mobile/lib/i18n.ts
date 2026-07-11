import translations, { TranslationKey } from '@/constants/translations';

let currentLanguage = 'fr';

export function setLanguage(lang: string) {
  currentLanguage = lang;
}

export function getLanguage() {
  return currentLanguage;
}

export function t(key: TranslationKey, lang?: string): string {
  const l = lang ?? currentLanguage;
  const dict = translations[l] ?? translations['en'];
  return dict?.[key] ?? translations['en']?.[key] ?? key;
}
