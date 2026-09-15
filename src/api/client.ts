/**
 * Stub API client for the Spring Boot backend (see /server). Not wired into
 * the UI yet — the app is fully usable offline-only for now. Next steps:
 *
 *   1. Add register/login calling POST /auth/register and /auth/login,
 *      store the returned JWT (SecureStore on native, memory + refresh
 *      flow on web — never localStorage for the token).
 *   2. Add a sync function that pushes rows where `dirty = 1` to
 *      POST /entries/sync and applies the server's response (see
 *      server's SyncController for the expected payload shape), then
 *      clears the dirty flag locally.
 *   3. Call sync on app foreground + on an interval, and reconcile using
 *      `updated_at` (last-write-wins), matching the server's model.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}
