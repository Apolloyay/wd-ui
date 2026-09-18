import { getDatabase } from './database';
import { decrypt, encrypt, type EncryptionKey } from '../crypto/crypto';
import { randomId } from '../crypto/randomId';
import type { DiaryBook } from '../types/book';

/**
 * Same shape/approach as entriesRepository: rows store ciphertext only, the
 * caller passes the derived EncryptionKey and gets back plaintext DiaryBook
 * objects. A book's name never touches SQLite or the server in the clear.
 */

export async function listBooks(key: EncryptionKey): Promise<DiaryBook[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<EncryptedBookRecordRow>(
    'SELECT * FROM books ORDER BY created_at ASC'
  );
  return rows.flatMap((row) => tryDecryptRow(row, key));
}

export async function getBook(id: string, key: EncryptionKey): Promise<DiaryBook | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<EncryptedBookRecordRow>('SELECT * FROM books WHERE id = ?', id);
  return row ? decryptRow(row, key) : null;
}

export async function createBook(input: { name: string }, key: EncryptionKey): Promise<DiaryBook> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const book: DiaryBook = {
    id: randomId(),
    name: input.name,
    hidden: false,
    createdAt: now,
    updatedAt: now,
  };
  const { ciphertext, nonce } = encrypt(JSON.stringify(book), key);
  await db.runAsync(
    'INSERT INTO books (id, ciphertext, nonce, created_at, updated_at, version, dirty) VALUES (?, ?, ?, ?, ?, 1, 1)',
    book.id,
    ciphertext,
    nonce,
    book.createdAt,
    book.updatedAt
  );
  return book;
}

export async function updateBook(
  id: string,
  changes: Partial<Pick<DiaryBook, 'name' | 'hidden'>>,
  key: EncryptionKey
): Promise<DiaryBook> {
  const existing = await getBook(id, key);
  if (!existing) throw new Error(`Book ${id} not found`);

  const updated: DiaryBook = { ...existing, ...changes, updatedAt: new Date().toISOString() };
  const { ciphertext, nonce } = encrypt(JSON.stringify(updated), key);

  const db = await getDatabase();
  await db.runAsync(
    'UPDATE books SET ciphertext = ?, nonce = ?, updated_at = ?, version = version + 1, dirty = 1 WHERE id = ?',
    ciphertext,
    nonce,
    updated.updatedAt,
    id
  );
  return updated;
}

/** Thrown by deleteBook so callers can show a translated message -- this layer owns no user-facing copy. */
export class BookHasEntriesError extends Error {
  constructor() {
    super('Book still has entries');
    this.name = 'BookHasEntriesError';
  }
}

/**
 * Deletes a book, refusing if it still has entries — callers should move or
 * delete those first rather than silently losing diary content.
 */
export async function deleteBook(id: string, entryCount: number): Promise<void> {
  if (entryCount > 0) {
    throw new BookHasEntriesError();
  }
  const db = await getDatabase();
  await db.runAsync('DELETE FROM books WHERE id = ?', id);
}

// --- Sync support -----------------------------------------------------
// Mirrors entriesRepository's sync support; books sync as their own
// independent stream against /books/sync, with their own lastSyncedAt.

export async function getDirtyRows(): Promise<EncryptedBookRecordRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<EncryptedBookRecordRow>('SELECT * FROM books WHERE dirty = 1');
}

export async function markRowsSyncedIfUnchanged(pushed: { id: string; version: number }[]): Promise<void> {
  const db = await getDatabase();
  for (const row of pushed) {
    await db.runAsync('UPDATE books SET dirty = 0 WHERE id = ? AND version = ?', row.id, row.version);
  }
}

export async function upsertFromServer(records: EncryptedBookRecordRow[]): Promise<void> {
  const db = await getDatabase();
  for (const r of records) {
    const existing = await db.getFirstAsync<EncryptedBookRecordRow>('SELECT * FROM books WHERE id = ?', r.id);
    if (existing?.dirty && existing.updated_at >= r.updated_at) {
      continue;
    }
    await db.runAsync(
      `INSERT INTO books (id, ciphertext, nonce, created_at, updated_at, version, dirty)
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
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'booksLastSyncedAt');
  return row?.value ?? null;
}

export async function setLastSyncedAt(iso: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES ('booksLastSyncedAt', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    iso
  );
}

export interface EncryptedBookRecordRow {
  id: string;
  ciphertext: string;
  nonce: string;
  created_at: string;
  updated_at: string;
  version: number;
  dirty: number;
}

function decryptRow(row: EncryptedBookRecordRow, key: EncryptionKey): DiaryBook {
  const json = decrypt(row.ciphertext, row.nonce, key);
  const parsed = JSON.parse(json) as DiaryBook;
  // Books written before "hidden" existed won't have the field.
  return { ...parsed, hidden: parsed.hidden ?? false };
}

/** See tryDecryptRow in entriesRepository -- same reasoning applies to books. */
function tryDecryptRow(row: EncryptedBookRecordRow, key: EncryptionKey): DiaryBook[] {
  try {
    return [decryptRow(row, key)];
  } catch {
    return [];
  }
}
