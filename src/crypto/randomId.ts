import './randomPolyfill';
import { randomBytes } from '@noble/hashes/utils.js';

/**
 * CSPRNG-backed UUID v4 -- avoids crypto.randomUUID(), which
 * react-native-get-random-values does not add (it only shims getRandomValues).
 */
export function randomId(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b: number) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
