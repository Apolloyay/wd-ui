import '../crypto/randomPolyfill';
import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';

const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 recommendation for PBKDF2-HMAC-SHA256
const KEY_LENGTH_BYTES = 32; // AES-256
const NONCE_LENGTH_BYTES = 12; // AES-GCM standard nonce size

export interface EncryptionKey {
  bytes: Uint8Array;
}

/**
 * Derives a stable 256-bit key from the user's passphrase + a per-user salt.
 * The salt is not secret — it just needs to be unique per user and stored
 * alongside their account (e.g. returned by the server at login, or kept in
 * SecureStore). Never derive a key from the passphrase alone.
 */
export function deriveKeyFromPassphrase(passphrase: string, saltBase64: string): EncryptionKey {
  const salt = base64ToBytes(saltBase64);
  const bytes = pbkdf2(sha256, passphrase.normalize('NFKC'), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LENGTH_BYTES,
  });
  return { bytes };
}

export function generateSalt(): string {
  return bytesToBase64(randomBytes(16));
}

/**
 * Encrypts plaintext with AES-256-GCM using a fresh random nonce.
 * Returns base64 ciphertext (tag included) and the base64 nonce used —
 * both must be stored; the nonce is not secret.
 */
export function encrypt(plaintext: string, key: EncryptionKey): { ciphertext: string; nonce: string } {
  const nonce = randomBytes(NONCE_LENGTH_BYTES);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertextBytes = gcm(key.bytes, nonce).encrypt(plaintextBytes);
  return {
    ciphertext: bytesToBase64(ciphertextBytes),
    nonce: bytesToBase64(nonce),
  };
}

export function decrypt(ciphertextBase64: string, nonceBase64: string, key: EncryptionKey): string {
  const nonce = base64ToBytes(nonceBase64);
  const ciphertextBytes = base64ToBytes(ciphertextBase64);
  const plaintextBytes = gcm(key.bytes, nonce).decrypt(ciphertextBytes);
  return new TextDecoder().decode(plaintextBytes);
}

const CANARY_PLAINTEXT = 'wediary-passphrase-check-v1';

export interface Canary {
  ciphertext: string;
  nonce: string;
}

/**
 * A known plaintext encrypted with the user's key, stored locally so a
 * later app launch can check "is this the right passphrase?" without any
 * network call — decrypt the canary and see if it comes back unchanged.
 * Wrong passphrase -> wrong key -> AES-GCM auth tag fails -> decrypt throws.
 */
export function createCanary(key: EncryptionKey): Canary {
  return encrypt(CANARY_PLAINTEXT, key);
}

export function verifyCanary(key: EncryptionKey, canary: Canary): boolean {
  try {
    return decrypt(canary.ciphertext, canary.nonce, key) === CANARY_PLAINTEXT;
  } catch {
    return false; // wrong key -> GCM tag mismatch
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
