/** A follow-up note added to an entry after the fact, e.g. "update a week later". */
export interface EntryComment {
  id: string;
  body: string;
  createdAt: string; // ISO 8601
}

/**
 * A piece of text placed on top of a photo by the image editor. Stays as
 * live, re-editable data rather than being drawn into the photo's pixels --
 * x/y/fontSize are normalized (0-1, fraction of the image's own width/height)
 * so the same overlay places correctly at any display size (editor, PDF
 * export, ...). Rotate/crop are destructive (they re-process the underlying
 * photo via expo-image-manipulator), so applying either clears overlays --
 * their coordinates would no longer line up with the new geometry.
 */
export interface ImageOverlayText {
  id: string;
  kind: 'text';
  text: string;
  x: number;
  y: number;
  /** fraction of the image's width, so text scales with the photo */
  fontSize: number;
  color: string;
}

/** A freehand pen stroke on top of a photo -- same normalized-coordinate deal as ImageOverlayText. */
export interface ImageOverlayDrawing {
  id: string;
  kind: 'drawing';
  points: { x: number; y: number }[];
  color: string;
  /** fraction of the image's width */
  strokeWidth: number;
}

export type ImageOverlay = ImageOverlayText | ImageOverlayDrawing;

/**
 * A reference to an attached photo -- just enough metadata to render a
 * thumbnail placeholder and fetch the actual bytes on demand. The bytes
 * themselves live in their own ImageBlob (see types/image.ts) so that
 * listing/searching entries never has to decrypt image data.
 */
export interface EntryImage {
  id: string; // matches the ImageBlob holding the actual bytes
  mimeType: string;
  createdAt: string; // ISO 8601
  overlays: ImageOverlay[];
}

/** Where an entry was written -- captured once (see EntryScreen) and editable afterward. */
export interface EntryLocation {
  latitude: number;
  longitude: number;
  /** reverse-geocoded or copied from a SavedPlace label, e.g. "Seattle, WA" or "Home" */
  placeName: string;
}

/**
 * Weather at the entry's location on the entry's own date -- fetched once
 * (current conditions for today, historical for a backdated entry) and
 * re-fetched only when the location changes, not on every keystroke.
 */
export interface EntryWeather {
  temperatureC: number;
  /** WMO weather code (Open-Meteo), used to pick an icon/description */
  weatherCode: number;
  /** the date (YYYY-MM-DD) this reading is for -- lets stale weather be detected if an entry's date changes */
  forDate: string;
}

/**
 * A diary entry as used by the UI — always decrypted plaintext in memory.
 */
export interface DiaryEntry {
  id: string;
  /** which DiaryBook this entry belongs to */
  bookId: string;
  /**
   * 'image' entries are built around a single edited photo (crop/rotate/draw/
   * text overlays) rather than a rich text body -- still a normal entry in
   * the same book, listed/searched/exported/hidden exactly like 'text' ones.
   */
  entryType: 'text' | 'image';
  title: string;
  body: string;
  /**
   * 'html' for anything written with the rich text editor (body is a small
   * trusted HTML fragment -- bold/italic/underline/headings/lists -- safe to
   * render as-is since it only ever comes from this app's own editor on the
   * user's own device, never from another user or the network in plaintext).
   * 'plain' for entries written before rich text existed, where body is a
   * literal string that still needs HTML-escaping wherever it's displayed.
   */
  bodyFormat: 'plain' | 'html';
  mood?: string;
  tags: string[];
  comments: EntryComment[];
  images: EntryImage[];
  location?: EntryLocation;
  weather?: EntryWeather;
  /** excluded from the default entries list/search until "show hidden" is on */
  hidden: boolean;
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
