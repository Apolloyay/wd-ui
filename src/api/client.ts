/**
 * Client for the Spring Boot backend (see /server). Auth only ever handles
 * account credentials — diary content is encrypted before it reaches
 * syncEntries(), so this file never touches plaintext.
 *
 * EXPO_PUBLIC_API_BASE_URL:
 * - Web dev: defaults to http://localhost:8080, which works as-is.
 * - iOS simulator: http://localhost:8080 also works (simulator shares the
 *   Mac's network namespace).
 * - Physical iPhone (Expo Go / dev client): "localhost" means the phone
 *   itself. Set this to your machine's LAN IP instead, e.g.
 *   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.23:8080
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

export interface AuthResponse {
  accessToken: string;
  encryptionSalt: string;
}

export interface EntryPayload {
  id: string;
  ciphertext: string;
  nonce: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface SyncResponseBody {
  serverChanges: EntryPayload[];
  syncedAt: string;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 409) throw new Error('An account with that email already exists.');
  if (!res.ok) throw new Error(await describeError(res, 'Registration failed'));
  return res.json();
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) throw new Error('Incorrect email or password.');
  if (!res.ok) throw new Error(await describeError(res, 'Login failed'));
  return res.json();
}

export async function syncEntries(
  accessToken: string,
  changed: EntryPayload[],
  lastSyncedAt: string | null
): Promise<SyncResponseBody> {
  const res = await apiFetch('/entries/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ changed, lastSyncedAt }),
  });
  if (!res.ok) throw new Error(await describeError(res, 'Sync failed'));
  return res.json();
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

async function describeError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body === 'object' && body) {
      const firstMessage = Object.values(body)[0];
      if (typeof firstMessage === 'string') return firstMessage;
    }
  } catch {
    // response wasn't JSON — fall through to the generic message
  }
  return `${fallback} (${res.status})`;
}
