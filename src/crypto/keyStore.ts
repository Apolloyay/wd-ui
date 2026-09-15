import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Canary } from './crypto';

/**
 * Holds what a returning user's device needs to unlock offline: the salt
 * (needed to re-derive the key from a passphrase) and a canary (needed to
 * check that passphrase is actually right — see crypto.ts). Neither value
 * is secret on its own — the salt is just per-user randomness, and the
 * canary is useless without the key it was encrypted with — so unlike the
 * access token, storing them in web localStorage isn't a security downgrade.
 *
 * - Native (iOS/Android): expo-secure-store -> Keychain / Keystore. Safe.
 * - Web: expo-secure-store has NO web implementation, so we use localStorage.
 */
const SALT_KEY = 'wediary.key_salt';
const CANARY_KEY = 'wediary.canary';

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

export async function saveCanary(canary: Canary): Promise<void> {
  const value = JSON.stringify(canary);
  if (Platform.OS === 'web') {
    window.localStorage.setItem(CANARY_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(CANARY_KEY, value);
}

export async function loadCanary(): Promise<Canary | null> {
  const raw = Platform.OS === 'web' ? window.localStorage.getItem(CANARY_KEY) : await SecureStore.getItemAsync(CANARY_KEY);
  return raw ? (JSON.parse(raw) as Canary) : null;
}

export async function clearCanary(): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.removeItem(CANARY_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(CANARY_KEY);
}
