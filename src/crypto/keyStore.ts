import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Holds the user's derived encryption key material between app launches
 * without asking for the passphrase every time.
 *
 * - Native (iOS/Android): expo-secure-store -> Keychain / Keystore. Safe.
 * - Web: expo-secure-store has NO web implementation. We fall back to
 *   localStorage, which is NOT secure against XSS. This is a placeholder —
 *   before shipping the web app, replace this with a non-extractable
 *   CryptoKey kept in IndexedDB via the Web Crypto API, or simply require
 *   re-entering the passphrase each session on web.
 */
const SALT_KEY = 'wediary.key_salt';

export async function saveSalt(saltBase64: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(SALT_KEY, saltBase64);
    return;
  }
  await SecureStore.setItemAsync(SALT_KEY, saltBase64);
}

export async function loadSalt(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return window.localStorage.getItem(SALT_KEY);
  }
  return SecureStore.getItemAsync(SALT_KEY);
}

export async function clearSalt(): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.removeItem(SALT_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SALT_KEY);
}
