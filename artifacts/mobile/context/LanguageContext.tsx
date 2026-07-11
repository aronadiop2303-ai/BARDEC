import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { DEFAULT_LANGUAGE, LANGUAGES } from '@/constants/languages';
import translations, { TranslationKey } from '@/constants/translations';
import { setLanguage as setI18nLanguage } from '@/lib/i18n';

interface LanguageContextType {
  language: string;
  setLanguage: (code: string) => void;
  t: (key: TranslationKey) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key) => key,
  isRTL: false,
});

function detectDeviceLanguage(): string {
  try {
    const locales = getLocales();
    const deviceLang = locales[0]?.languageCode ?? DEFAULT_LANGUAGE;
    const supported = LANGUAGES.find(l => l.code === deviceLang);
    return supported ? deviceLang : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<string>(DEFAULT_LANGUAGE);

  useEffect(() => {
    loadLanguage();
  }, []);

  async function loadLanguage() {
    const saved = await AsyncStorage.getItem('bardec_language');
    if (saved && LANGUAGES.find(l => l.code === saved)) {
      setLanguageState(saved);
      setI18nLanguage(saved);
    } else {
      const detected = detectDeviceLanguage();
      setLanguageState(detected);
      setI18nLanguage(detected);
    }
  }

  function setLanguage(code: string) {
    setLanguageState(code);
    setI18nLanguage(code);
    AsyncStorage.setItem('bardec_language', code);
  }

  function t(key: TranslationKey): string {
    const dict = translations[language] ?? translations['en'];
    return dict?.[key] ?? translations['en']?.[key] ?? key;
  }

  const langConfig = LANGUAGES.find(l => l.code === language);
  const isRTL = langConfig?.rtl ?? false;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
