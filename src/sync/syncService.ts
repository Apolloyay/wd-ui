import { syncBooks, syncEntries, syncImages, syncPlaces } from '../api/client';
import { getAccessToken } from '../auth/session';
import * as books from '../db/booksRepository';
import * as entries from '../db/entriesRepository';
import * as images from '../db/imageBlobRepository';
import * as places from '../db/savedPlacesRepository';

export type SyncResult =
  | { ok: true; pushed: number; pulled: number }
  | { ok: false; reason: 'signed-out' | 'network' | 'server' };

/**
 * Push locally-dirty books, entries, and image blobs, then pull anything
 * newer from the server. Books sync first so an entry referencing a
 * brand-new book (from another device) has that book available once pulled;
 * image blobs sync last since nothing else depends on them being present
 * yet (a not-yet-downloaded image just shows as unavailable until it is).
 * Safe to call opportunistically and often (app foreground, after saving, on
 * a timer) — it's a no-op beyond a few cheap requests when there's nothing
 * to push or pull. Never throws; failures come back as a result so callers
 * can show "offline" instead of crashing the UI.
 */
export async function syncNow(): Promise<SyncResult> {
  const token = await getAccessToken();
  if (!token) return { ok: false, reason: 'signed-out' };

  try {
    const bookResult = await syncOne(token, books, syncBooks);
    const entryResult = await syncOne(token, entries, syncEntries);
    const imageResult = await syncOne(token, images, syncImages);
    const placeResult = await syncOne(token, places, syncPlaces);
    return {
      ok: true,
      pushed: bookResult.pushed + entryResult.pushed + imageResult.pushed + placeResult.pushed,
      pulled: bookResult.pulled + entryResult.pulled + imageResult.pulled + placeResult.pulled,
    };
  } catch (e) {
    // fetch() throws on no connectivity/DNS/etc; a real HTTP error status
    // is thrown as an Error by the client too, but we only need "couldn't
    // reach the server" vs. "server said no" for the UI, so treat both as
    // a soft failure here rather than surfacing raw error text.
    return { ok: false, reason: e instanceof TypeError ? 'network' : 'server' };
  }
}

interface RepoOfSyncable {
  getDirtyRows(): Promise<{ id: string; ciphertext: string; nonce: string; created_at: string; updated_at: string; version: number }[]>;
  markRowsSyncedIfUnchanged(pushed: { id: string; version: number }[]): Promise<void>;
  upsertFromServer(records: { id: string; ciphertext: string; nonce: string; created_at: string; updated_at: string; version: number; dirty: number }[]): Promise<void>;
  getLastSyncedAt(): Promise<string | null>;
  setLastSyncedAt(iso: string): Promise<void>;
}

async function syncOne(
  token: string,
  repo: RepoOfSyncable,
  apiSync: (
    token: string,
    changed: { id: string; ciphertext: string; nonce: string; createdAt: string; updatedAt: string; version: number }[],
    lastSyncedAt: string | null
  ) => Promise<{ serverChanges: { id: string; ciphertext: string; nonce: string; createdAt: string; updatedAt: string; version: number }[]; syncedAt: string }>
): Promise<{ pushed: number; pulled: number }> {
  const dirtyRows = await repo.getDirtyRows();
  const changed = dirtyRows.map((r) => ({
    id: r.id,
    ciphertext: r.ciphertext,
    nonce: r.nonce,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: r.version,
  }));
  const lastSyncedAt = await repo.getLastSyncedAt();

  const response = await apiSync(token, changed, lastSyncedAt);

  await repo.markRowsSyncedIfUnchanged(dirtyRows.map((r) => ({ id: r.id, version: r.version })));
  await repo.upsertFromServer(
    response.serverChanges.map((e) => ({
      id: e.id,
      ciphertext: e.ciphertext,
      nonce: e.nonce,
      created_at: e.createdAt,
      updated_at: e.updatedAt,
      version: e.version,
      dirty: 0,
    }))
  );
  await repo.setLastSyncedAt(response.syncedAt);

  return { pushed: changed.length, pulled: response.serverChanges.length };
}
