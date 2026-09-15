import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Where the server's JWT access token lives. Unlike the salt/canary, this
 * one is a real secret — it grants API access — so the web fallback is
 * deliberately weaker on purpose: sessionStorage, not localStorage, so it's
 * gone as soon as the tab closes rather than sitting around indefinitely.
 * (There's still no XSS-proof place to put it in a plain web page; if that
 * matters for your threat model, put the token in an httpOnly cookie set by
 * the server instead and drop this file's web branch entirely.)
 */
const TOKEN_KEY = 'wediary.access_token';

export async function saveAccessToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.sessionStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getAccessToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return window.sessionStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearAccessToken(): Promise<void> {
  if (Platform.OS === 'web') {
    window.sessionStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
