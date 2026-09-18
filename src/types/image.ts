/**
 * The actual bytes of an attached photo — stored and synced as its own
 * opaque ciphertext blob, separate from the DiaryEntry that references it.
 * Keeping images out of the entry's own blob is what lets the entries list
 * (and search) stay fast: those screens only ever decrypt an entry's small
 * EntryImage[] metadata, never these bytes -- see EntryImage in entry.ts.
 */
export interface ImageBlob {
  id: string;
  mimeType: string;
  dataBase64: string;
  /** pixel dimensions of the stored image -- lets overlay coordinates (normalized 0-1) be placed correctly at any display size */
  width: number;
  height: number;
  createdAt: string; // ISO 8601
}
