import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { isSupportedLanguage, type SupportedLanguage } from './index';

/** Same web-vs-native storage split as crypto/keyStore.ts -- see there for why. */
const LANGUAGE_KEY = 'wediary.language';

export async function saveLanguage(language: SupportedLanguage): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(LANGUAGE_KEY, language);
    return;
  }
  await SecureStore.setItemAsync(LANGUAGE_KEY, language);
}

export async function loadLanguage(): Promise<SupportedLanguage | null> {
  const raw = Platform.OS === 'web' ? window.localStorage.getItem(LANGUAGE_KEY) : await SecureStore.getItemAsync(LANGUAGE_KEY);
  return raw && isSupportedLanguage(raw) ? raw : null;
}
