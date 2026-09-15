/**
 * A diary entry as used by the UI — always decrypted plaintext in memory.
 */
export interface DiaryEntry {
  id: string;
  title: string;
  body: string;
  mood?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * How an entry is actually persisted (locally and remotely): the server and
 * the local DB never see plaintext, only this shape.
 */
export interface EncryptedEntryRecord {
  id: string;
  ciphertext: string; // base64
  nonce: string; // base64, unique per encryption
  createdAt: string;
  updatedAt: string;
  /** bumped on every local write; used for last-write-wins sync */
  version: number;
  /** true if this row has local changes not yet pushed to the server */
  dirty: boolean;
}
