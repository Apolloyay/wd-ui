import { getDatabase } from './database';
import { decrypt, encrypt, type EncryptionKey } from '../crypto/crypto';
import { randomId } from '../crypto/randomId';
import type { DiaryEntry } from '../types/entry';

/**
 * Everything below stores/reads ciphertext only — the caller passes the
 * derived EncryptionKey in memory (never persisted in the DB) and gets back
 * plaintext DiaryEntry objects.
 */

/**
 * bookId lives inside the encrypted JSON (like every other field here), not
 * as a plaintext SQL column, so filtering by book happens in memory after
 * decrypting — fine at diary scale, and keeps the server fully opaque to
 * which entries belong to which book.
 */
export async function listEntries(key: EncryptionKey, bookId?: string): Promise<DiaryEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<EncryptedEntryRecordRow>(
    'SELECT * FROM entries ORDER BY created_at DESC'
  );
  const entries = rows.flatMap((row) => tryDecryptRow(row, key));
  return bookId ? entries.filter((e) => e.bookId === bookId) : entries;
}

/** Number of entries currently filed under a book — used to guard book deletion. */
export async function countEntriesInBook(bookId: string, key: EncryptionKey): Promise<number> {
  const entries = await listEntries(key, bookId);
  return entries.length;
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
  input: {
    bookId: string;
    entryType?: DiaryEntry['entryType'];
    title: string;
    body: string;
    bodyFormat?: DiaryEntry['bodyFormat'];
    mood?: string;
    tags?: string[];
    location?: DiaryEntry['location'];
    weather?: DiaryEntry['weather'];
  },
  key: EncryptionKey
): Promise<DiaryEntry> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const entry: DiaryEntry = {
    id: randomId(),
    bookId: input.bookId,
    entryType: input.entryType ?? 'text',
    title: input.title,
    body: input.body,
    bodyFormat: input.bodyFormat ?? 'html',
    mood: input.mood,
    tags: input.tags ?? [],
    comments: [],
    images: [],
    location: input.location,
    weather: input.weather,
    hidden: false,
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
  changes: Partial<
    Pick<DiaryEntry, 'title' | 'body' | 'bodyFormat' | 'mood' | 'tags' | 'comments' | 'images' | 'location' | 'weather' | 'hidden'>
  >,
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

// --- Sync support -----------------------------------------------------
// Everything below moves ciphertext only; it never needs the encryption
// key, since the server (and the sync wire format) never sees plaintext.

/** Rows with local changes the server hasn't seen yet. */
export async function getDirtyRows(): Promise<EncryptedEntryRecordRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<EncryptedEntryRecordRow>('SELECT * FROM entries WHERE dirty = 1');
}

/**
 * Clears the dirty flag for rows that were successfully pushed — but only
 * if they're still at the version we pushed. If the user edited an entry
 * again mid-sync (bumping its version), we leave it dirty so the next sync
 * picks up that newer edit instead of silently dropping it.
 */
export async function markRowsSyncedIfUnchanged(pushed: { id: string; version: number }[]): Promise<void> {
  const db = await getDatabase();
  for (const row of pushed) {
    await db.runAsync('UPDATE entries SET dirty = 0 WHERE id = ? AND version = ?', row.id, row.version);
  }
}

/** Applies changes pulled from the server. Never overwrites a newer, not-yet-pushed local edit. */
export async function upsertFromServer(records: EncryptedEntryRecordRow[]): Promise<void> {
  const db = await getDatabase();
  for (const r of records) {
    const existing = await db.getFirstAsync<EncryptedEntryRecordRow>('SELECT * FROM entries WHERE id = ?', r.id);
    if (existing?.dirty && existing.updated_at >= r.updated_at) {
      continue;
    }
    await db.runAsync(
      `INSERT INTO entries (id, ciphertext, nonce, created_at, updated_at, version, dirty)
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
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'lastSyncedAt');
  return row?.value ?? null;
}

export async function setLastSyncedAt(iso: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES ('lastSyncedAt', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    iso
  );
}

export interface EncryptedEntryRecordRow {
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
  const parsed = JSON.parse(json) as DiaryEntry;
  // Entries written before books/tags/comments/images/hidden existed won't
  // have these fields — default them instead of letting old data crash.
  return {
    ...parsed,
    bookId: parsed.bookId ?? '',
    entryType: parsed.entryType ?? 'text',
    bodyFormat: parsed.bodyFormat ?? 'plain',
    tags: parsed.tags ?? [],
    comments: parsed.comments ?? [],
    images: (parsed.images ?? []).map((img) => ({ ...img, overlays: img.overlays ?? [] })),
    hidden: parsed.hidden ?? false,
  };
}

/**
 * The local DB is shared across whichever account is currently unlocked on
 * this device (see App.tsx's handleUseDifferentAccount) — rows left behind
 * by a previous account fail AES-GCM's tag check under the current key.
 * Skip those instead of letting one undecryptable row crash the whole list.
 */
function tryDecryptRow(row: EncryptedEntryRecordRow, key: EncryptionKey): DiaryEntry[] {
  try {
    return [decryptRow(row, key)];
  } catch {
    return [];
  }
}

