import { syncEntries } from '../api/client';
import { getAccessToken } from '../auth/session';
import {
  getDirtyRows,
  getLastSyncedAt,
  markRowsSyncedIfUnchanged,
  setLastSyncedAt,
  upsertFromServer,
} from '../db/entriesRepository';

export type SyncResult =
  | { ok: true; pushed: number; pulled: number }
  | { ok: false; reason: 'signed-out' | 'network' | 'server' };

/**
 * Push locally-dirty entries, then pull anything newer from the server.
 * Safe to call opportunistically and often (app foreground, after saving an
 * entry, on a timer) — it's a no-op beyond one cheap request when there's
 * nothing to push or pull. Never throws; failures come back as a result so
 * callers can show "offline" instead of crashing the UI.
 */
export async function syncNow(): Promise<SyncResult> {
  const token = await getAccessToken();
  if (!token) return { ok: false, reason: 'signed-out' };

  const dirtyRows = await getDirtyRows();
  const changed = dirtyRows.map((r) => ({
    id: r.id,
    ciphertext: r.ciphertext,
    nonce: r.nonce,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: r.version,
  }));
  const lastSyncedAt = await getLastSyncedAt();

  let response: Awaited<ReturnType<typeof syncEntries>>;
  try {
    response = await syncEntries(token, changed, lastSyncedAt);
  } catch (e) {
    // fetch() throws on no connectivity/DNS/etc; a real HTTP error status
    // is thrown as an Error by the client too, but we only need "couldn't
    // reach the server" vs. "server said no" for the UI, so treat both as
    // a soft failure here rather than surfacing raw error text.
    return { ok: false, reason: e instanceof TypeError ? 'network' : 'server' };
  }

  await markRowsSyncedIfUnchanged(dirtyRows.map((r) => ({ id: r.id, version: r.version })));
  await upsertFromServer(
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
  await setLastSyncedAt(response.syncedAt);

  return { ok: true, pushed: changed.length, pulled: response.serverChanges.length };
}
