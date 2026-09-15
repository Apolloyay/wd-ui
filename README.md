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
│   ├── crypto.ts            PBKDF2 key derivation + AES-256-GCM encrypt/decrypt (@noble/*)
│   ├── keyStore.ts          Where the per-user salt lives (SecureStore native / localStorage web)
│   └── randomPolyfill.ts    Shims crypto.getRandomValues on native (web has it natively)
├── db/
│   ├── database.ts          SQLite open + migration (expo-sqlite)
│   └── entriesRepository.ts CRUD — encrypts before writing, decrypts after reading
├── screens/                 UnlockScreen, HomeScreen, EntryScreen
└── api/client.ts            Stub fetch wrapper for the backend — not called yet, see TODOs inside
```

## Security model (current state)

- Entries are encrypted with AES-256-GCM using a key derived (PBKDF2-HMAC-SHA256, 210k iterations)
  from a passphrase the user enters on `UnlockScreen`.
- The server (and the local SQLite file itself, if someone reads it directly) only ever sees
  ciphertext + a nonce.
- **Known gap**: on Web, the per-user salt is kept in `localStorage` (not secure against XSS) since
  `expo-secure-store` has no web backend. Before shipping on web, replace this with a
  non-extractable `CryptoKey` in IndexedDB via the Web Crypto API, or just require the passphrase
  every session on web. See the comment in `src/crypto/keyStore.ts`.
- There is currently no account auth wired into the app (see `src/api/client.ts`) — this only
  protects the local database, there's no cloud sync yet.

## Web support caveat

`expo-sqlite` on web runs on a WASM build (wa-sqlite) backed by OPFS, which needs a secure context
(https, or localhost) and a reasonably recent browser. `metro.config.js` was updated to let Metro
bundle the `.wasm` asset it needs — don't remove that `assetExts.push('wasm')` line.

## Verified in this scaffold

- `npx tsc --noEmit` passes.
- `npx expo export --platform web` bundles successfully (smoke test only — the app has not been
  opened in an actual browser or iOS simulator yet).
