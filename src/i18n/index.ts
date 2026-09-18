import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhHans from './locales/zh-Hans.json';

/**
 * The full set of languages the app ships translations for. Adding a new
 * one later is: drop a locales/<code>.json file, add it here and to
 * LANGUAGE_LABELS, and wire it into the resources map below — nothing else
 * in the app needs to change, since every screen reads strings through
 * useTranslation() rather than hardcoding them.
 */
export const SUPPORTED_LANGUAGES = ['en', 'zh-Hans'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
};

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Best-effort guess at which shipped language to start with before the user
 * has ever chosen one (or on a device with no saved preference) -- Simplified
 * Chinese for zh-* locales (zh-Hans-CN, zh-CN, zh, ...), English otherwise.
 * Never throws: Intl support varies by platform/engine.
 */
export function detectDefaultLanguage(): SupportedLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en';
  } catch {
    return 'en';
  }
}

// No backend plugin is used (resources are bundled with the app), so this
// initializes synchronously -- translations are available immediately, no
// need to await it. The initial language is just a placeholder; App.tsx
// calls i18n.changeLanguage() with the saved/detected one before any
// text-bearing screen renders.
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-Hans': { translation: zhHans },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // not rendering HTML, no need to escape
});

export default i18n;
