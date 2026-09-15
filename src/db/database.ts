import * as SQLite from 'expo-sqlite';

const DB_NAME = 'wediary.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Lazily opens (and migrates) the local database. Safe to call repeatedly —
 * subsequent calls reuse the same connection.
 *
 * Note: expo-sqlite's web target runs on a WASM build backed by OPFS, which
 * requires a secure context (https, or localhost) and a reasonably recent
 * browser. Verify this against the current docs before relying on it in
 * production — see AGENTS.md.
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY NOT NULL,
      ciphertext TEXT NOT NULL,
      nonce TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      dirty INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  return db;
}
