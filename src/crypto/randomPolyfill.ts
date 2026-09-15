import { Platform } from 'react-native';

/**
 * `@noble/*` and other crypto libs expect a global `crypto.getRandomValues`.
 * Browsers (and therefore react-native-web) already provide it natively.
 * Native iOS/Android (Hermes) do not, so we shim it there with
 * `react-native-get-random-values`.
 *
 * Import this once, before any other crypto code runs (see index.ts).
 */
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('react-native-get-random-values');
}
