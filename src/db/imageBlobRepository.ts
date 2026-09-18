import { getDatabase } from './database';
import { decrypt, encrypt, type EncryptionKey } from '../crypto/crypto';
import { randomId } from '../crypto/randomId';
import type { ImageBlob } from '../types/image';

/**
 * Deliberately has no listImageBlobs()/listForEntry() -- an entry already
 * knows the ids of its own images (see EntryImage in types/entry.ts), so
 * every caller fetches exactly the blobs it needs by id via getImageBlob().
 * That's what keeps opening an entry cheap even if the diary as a whole has
 * hundreds of photos elsewhere: nothing here ever has to scan-and-decrypt
 * every image blob just to find the few that belong to one entry.
 */

export async function getImageBlob(id: string, key: EncryptionKey): Promise<ImageBlob | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<EncryptedImageBlobRecordRow>('SELECT * FROM image_blobs WHERE id = ?', id);
  if (!row) return null;
  try {
    return decryptRow(row, key);
  } catch {
    // Not yet synced under this key, or from another account sharing this
    // device's local DB -- treat as unavailable rather than crashing.
    return null;
  }
}

export async function createImageBlob(
  input: { mimeType: string; dataBase64: string; width: number; height: number },
  key: EncryptionKey
): Promise<ImageBlob> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const blob: ImageBlob = {
    id: randomId(),
    mimeType: input.mimeType,
    dataBase64: input.dataBase64,
    width: input.width,
    height: input.height,
    createdAt: now,
  };
  const { ciphertext, nonce } = encrypt(JSON.stringify(blob), key);
  await db.runAsync(
    'INSERT INTO image_blobs (id, ciphertext, nonce, created_at, updated_at, version, dirty) VALUES (?, ?, ?, ?, ?, 1, 1)',
    blob.id,
    ciphertext,
    nonce,
    now,
    now
  );
  return blob;
}

export async function deleteImageBlob(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM image_blobs WHERE id = ?', id);
}

// --- Sync support -----------------------------------------------------
// Mirrors booksRepository/entriesRepository's sync support exactly -- image
// blobs move as ciphertext only, same as everything else.

export async function getDirtyRows(): Promise<EncryptedImageBlobRecordRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<EncryptedImageBlobRecordRow>('SELECT * FROM image_blobs WHERE dirty = 1');
}

export async function markRowsSyncedIfUnchanged(pushed: { id: string; version: number }[]): Promise<void> {
  const db = await getDatabase();
  for (const row of pushed) {
    await db.runAsync('UPDATE image_blobs SET dirty = 0 WHERE id = ? AND version = ?', row.id, row.version);
  }
}

export async function upsertFromServer(records: EncryptedImageBlobRecordRow[]): Promise<void> {
  const db = await getDatabase();
  for (const r of records) {
    const existing = await db.getFirstAsync<EncryptedImageBlobRecordRow>('SELECT * FROM image_blobs WHERE id = ?', r.id);
    if (existing?.dirty && existing.updated_at >= r.updated_at) {
      continue;
    }
    await db.runAsync(
      `INSERT INTO image_blobs (id, ciphertext, nonce, created_at, updated_at, version, dirty)
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
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'imagesLastSyncedAt');
  return row?.value ?? null;
}

export async function setLastSyncedAt(iso: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES ('imagesLastSyncedAt', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    iso
  );
}

export interface EncryptedImageBlobRecordRow {
  id: string;
  ciphertext: string;
  nonce: string;
  created_at: string;
  updated_at: string;
  version: number;
  dirty: number;
}

function decryptRow(row: EncryptedImageBlobRecordRow, key: EncryptionKey): ImageBlob {
  const json = decrypt(row.ciphertext, row.nonce, key);
  const parsed = JSON.parse(json) as ImageBlob;
  // Blobs stored before width/height were tracked won't have them -- fall
  // back to a square so aspect-ratio math elsewhere doesn't divide by zero.
  return { ...parsed, width: parsed.width || 800, height: parsed.height || 800 };
}
