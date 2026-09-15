import '../crypto/randomPolyfill';
import { randomBytes } from '@noble/hashes/utils.js';
import { getDatabase } from './database';
import { decrypt, encrypt, type EncryptionKey } from '../crypto/crypto';
import type { DiaryEntry } from '../types/entry';

/**
 * Everything below stores/reads ciphertext only — the caller passes the
 * derived EncryptionKey in memory (never persisted in the DB) and gets back
 * plaintext DiaryEntry objects.
 */

export async function listEntries(key: EncryptionKey): Promise<DiaryEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<EncryptedEntryRecordRow>(
    'SELECT * FROM entries ORDER BY created_at DESC'
  );
  return rows.map((row) => decryptRow(row, key));
}

export async function getEntry(id: string, key: EncryptionKey): Promise<DiaryEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<EncryptedEntryRecordRow>(
    'SELECT * FROM entries WHERE id = ?',
    id
  );
  return row ? decryptRow(row, key) : null;
}

export async function createEntry(
  input: { title: string; body: string; mood?: string },
  key: EncryptionKey
): Promise<DiaryEntry> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const entry: DiaryEntry = {
    id: cryptoRandomId(),
    title: input.title,
    body: input.body,
    mood: input.mood,
    createdAt: now,
    updatedAt: now,
  };
  const { ciphertext, nonce } = encrypt(JSON.stringify(entry), key);
  await db.runAsync(
    'INSERT INTO entries (id, ciphertext, nonce, created_at, updated_at, version, dirty) VALUES (?, ?, ?, ?, ?, 1, 1)',
    entry.id,
    ciphertext,
    nonce,
    entry.createdAt,
    entry.updatedAt
  );
  return entry;
}

export async function updateEntry(
  id: string,
  changes: Partial<Pick<DiaryEntry, 'title' | 'body' | 'mood'>>,
  key: EncryptionKey
): Promise<DiaryEntry> {
  const existing = await getEntry(id, key);
  if (!existing) throw new Error(`Entry ${id} not found`);

  const updated: DiaryEntry = {
    ...existing,
    ...changes,
    updatedAt: new Date().toISOString(),
  };
  const { ciphertext, nonce } = encrypt(JSON.stringify(updated), key);

  const db = await getDatabase();
  await db.runAsync(
    'UPDATE entries SET ciphertext = ?, nonce = ?, updated_at = ?, version = version + 1, dirty = 1 WHERE id = ?',
    ciphertext,
    nonce,
    updated.updatedAt,
    id
  );
  return updated;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM entries WHERE id = ?', id);
}

interface EncryptedEntryRecordRow {
  id: string;
  ciphertext: string;
  nonce: string;
  created_at: string;
  updated_at: string;
  version: number;
  dirty: number;
}

function decryptRow(row: EncryptedEntryRecordRow, key: EncryptionKey): DiaryEntry {
  const json = decrypt(row.ciphertext, row.nonce, key);
  return JSON.parse(json) as DiaryEntry;
}

function cryptoRandomId(): string {
  // Hand-rolled UUID v4 from CSPRNG bytes — avoids relying on
  // crypto.randomUUID(), which react-native-get-random-values does not add
  // (it only shims getRandomValues).
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b: number) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
