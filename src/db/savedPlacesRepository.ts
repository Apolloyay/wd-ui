import { getDatabase } from './database';
import { decrypt, encrypt, type EncryptionKey } from '../crypto/crypto';
import { randomId } from '../crypto/randomId';
import type { SavedPlace } from '../types/place';

/**
 * Same opaque-blob shape as booksRepository/imageBlobRepository -- a saved
 * place's label and coordinates never touch SQLite or the server in the
 * clear.
 */

export async function listSavedPlaces(key: EncryptionKey): Promise<SavedPlace[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<EncryptedSavedPlaceRecordRow>(
    'SELECT * FROM saved_places ORDER BY created_at ASC'
  );
  return rows.flatMap((row) => tryDecryptRow(row, key));
}

export async function createSavedPlace(
  input: { label: string; address: string; latitude: number; longitude: number },
  key: EncryptionKey
): Promise<SavedPlace> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const place: SavedPlace = {
    id: randomId(),
    label: input.label,
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    createdAt: now,
    updatedAt: now,
  };
  const { ciphertext, nonce } = encrypt(JSON.stringify(place), key);
  await db.runAsync(
    'INSERT INTO saved_places (id, ciphertext, nonce, created_at, updated_at, version, dirty) VALUES (?, ?, ?, ?, ?, 1, 1)',
    place.id,
    ciphertext,
    nonce,
    place.createdAt,
    place.updatedAt
  );
  return place;
}

export async function deleteSavedPlace(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM saved_places WHERE id = ?', id);
}

// --- Sync support -----------------------------------------------------
// Mirrors booksRepository's sync support exactly; saved places sync as
// their own independent stream against /places/sync.

export async function getDirtyRows(): Promise<EncryptedSavedPlaceRecordRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<EncryptedSavedPlaceRecordRow>('SELECT * FROM saved_places WHERE dirty = 1');
}

export async function markRowsSyncedIfUnchanged(pushed: { id: string; version: number }[]): Promise<void> {
  const db = await getDatabase();
  for (const row of pushed) {
    await db.runAsync('UPDATE saved_places SET dirty = 0 WHERE id = ? AND version = ?', row.id, row.version);
  }
}

export async function upsertFromServer(records: EncryptedSavedPlaceRecordRow[]): Promise<void> {
  const db = await getDatabase();
  for (const r of records) {
    const existing = await db.getFirstAsync<EncryptedSavedPlaceRecordRow>('SELECT * FROM saved_places WHERE id = ?', r.id);
    if (existing?.dirty && existing.updated_at >= r.updated_at) {
      continue;
    }
    await db.runAsync(
      `INSERT INTO saved_places (id, ciphertext, nonce, created_at, updated_at, version, dirty)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         ciphertext = excluded.ciphertext,
         nonce = excluded.nonce,
         updated_at = excluded.updated_at,
         version = excluded.version,
         dirty = 0`,
      r.id,
      r.ciphertext,
      r.nonce,
      r.created_at,
      r.updated_at,
      r.version
    );
  }
}

export async function getLastSyncedAt(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'savedPlacesLastSyncedAt');
  return row?.value ?? null;
}

export async function setLastSyncedAt(iso: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES ('savedPlacesLastSyncedAt', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    iso
  );
}

export interface EncryptedSavedPlaceRecordRow {
  id: string;
  ciphertext: string;
  nonce: string;
  created_at: string;
  updated_at: string;
  version: number;
  dirty: number;
}

function decryptRow(row: EncryptedSavedPlaceRecordRow, key: EncryptionKey): SavedPlace {
  const json = decrypt(row.ciphertext, row.nonce, key);
  const parsed = JSON.parse(json) as SavedPlace;
  // Places saved before "address" existed won't have it.
  return { ...parsed, address: parsed.address ?? '' };
}

/** See tryDecryptRow in entriesRepository -- same reasoning applies to saved places. */
function tryDecryptRow(row: EncryptedSavedPlaceRecordRow, key: EncryptionKey): SavedPlace[] {
  try {
    return [decryptRow(row, key)];
  } catch {
    return [];
  }
}
