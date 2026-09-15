# We Diary — App

Expo (React Native + React Native Web) app targeting iOS and Web from one TypeScript codebase.

> **Read `AGENTS.md` before writing code against a new Expo API** — Expo's SDK moves fast enough
> that a model's training data can be stale; check the version-pinned docs it links first.

## Run it

```
npm install
npm run web     # browser, via react-native-web
npm run ios     # requires macOS + Xcode; or scan the QR from `npm start` with Expo Go on iPhone
npm run android
```

## Structure

```
src/
├── types/entry.ts           DiaryEntry (plaintext, in-memory) vs EncryptedEntryRecord (at rest)
├── crypto/
│   ├── crypto.ts            PBKDF2 key derivation, AES-256-GCM encrypt/decrypt, canary (@noble/*)
│   ├── keyStore.ts          Where the salt + canary live (SecureStore native / localStorage web)
│   └── randomPolyfill.ts    Shims crypto.getRandomValues on native (web has it natively)
├── auth/session.ts          Where the server JWT lives (SecureStore native / sessionStorage web)
├── api/client.ts            register/login/syncEntries — talks to the Spring Boot backend
├── sync/syncService.ts      Push dirty rows, pull server changes, update local DB
├── db/
│   ├── database.ts          SQLite open + migration (expo-sqlite)
│   └── entriesRepository.ts CRUD (encrypts/decrypts) + sync bookkeeping (dirty rows, upserts)
└── screens/                 AuthScreen, UnlockScreen, HomeScreen, EntryScreen
```

## Auth + sync flow

1. **First run on a device**: `AuthScreen` — register or log in (needs network once). The same
   password both authenticates the account and, combined with a server-issued salt, derives the
   local AES key (PBKDF2). The server gets a bcrypt hash of the password; it never sees the key.
2. On success, the app stores the salt + a **canary** (a known string encrypted with that key) and
   the JWT, then goes straight to `HomeScreen`.
3. **Every later launch on that device**: `UnlockScreen` — passphrase only, fully offline. It
   re-derives the key and decrypts the canary to check the passphrase is right; no network call.
4. **Sync**: on unlock and after saving an entry, `syncService.syncNow()` pushes any locally-dirty
   entries and pulls anything newer from the server (last-write-wins by `updatedAt`). Failures
   (offline, server down) are swallowed into a status shown on `HomeScreen` — local reads/writes
   never block on the network.

## Security model (current state)

- Entries are encrypted with AES-256-GCM using a key derived (PBKDF2-HMAC-SHA256, 210k iterations)
  from the user's password + a salt issued by the server at registration.
- The server, the sync wire format, and the local SQLite file itself all only ever see ciphertext.
- **Known gap**: on Web, the salt/canary live in `localStorage` and the JWT in `sessionStorage` —
  neither is secure against XSS, since `expo-secure-store` has no web backend. Before shipping on
  web, consider a non-extractable `CryptoKey` in IndexedDB, or server-set httpOnly cookies for the
  token. See the comments in `src/crypto/keyStore.ts` and `src/auth/session.ts`.
- Access tokens are short-lived (15 min, see `server/README.md`) with no refresh flow yet — the
  user has to log in again after expiry today.

## Web support caveat

`expo-sqlite` on web runs on a WASM build (wa-sqlite) backed by OPFS, which needs a secure context
(https, or localhost) and a reasonably recent browser. `metro.config.js` was updated to let Metro
bundle the `.wasm` asset it needs — don't remove that `assetExts.push('wasm')` line.

## Verified in this scaffold

- `npx tsc --noEmit` passes.
- `npx expo export --platform web` and the Metro dev bundle (`npx expo start --web`) both build
  cleanly with no errors.
- The server side of the auth + sync flow was hit live with real HTTP requests (see the root
  README's status section) — the app's `api/client.ts` calls match what the server actually returns.
- **Not yet done**: clicking through the actual UI in a browser/simulator (no browser automation
  tool was available in the session this was built in) — do that before trusting this fully;
  something in the click-through UX may still need a fix even though every piece checks out
  individually.
