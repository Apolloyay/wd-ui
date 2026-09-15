import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { clearAccessToken } from './src/auth/session';
import type { EncryptionKey } from './src/crypto/crypto';
import { clearCanary, clearSalt, loadCanary, loadSalt } from './src/crypto/keyStore';
import AuthScreen from './src/screens/AuthScreen';
import EntryScreen from './src/screens/EntryScreen';
import HomeScreen from './src/screens/HomeScreen';
import UnlockScreen from './src/screens/UnlockScreen';

type Screen =
  | { name: 'loading' }
  | { name: 'auth' }
  | { name: 'unlock' }
  | { name: 'home' }
  | { name: 'entry'; entryId: string | null };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [encryptionKey, setEncryptionKey] = useState<EncryptionKey | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    (async () => {
      const [salt, canary] = await Promise.all([loadSalt(), loadCanary()]);
      // A device that has already logged in once can unlock offline from
      // here on; a brand-new device needs the network once to auth.
      if (salt && canary) {
        setScreen({ name: 'unlock' });
      } else {
        setScreen({ name: 'auth' });
      }
    })();
  }, []);

  const handleAuthenticated = (key: EncryptionKey) => {
    setEncryptionKey(key);
    setScreen({ name: 'home' });
  };

  const handleUseDifferentAccount = async () => {
    // Forgets this device's local credentials only. Existing entries are
    // left in the local DB but become unreadable under a different
    // account's key — fine for now since this is a single-account-per-
    // device app; revisit if multi-account switching becomes a real need.
    await Promise.all([clearSalt(), clearCanary(), clearAccessToken()]);
    setScreen({ name: 'auth' });
  };

  if (screen.name === 'loading') {
    return (
      <SafeAreaView style={styles.flex}>
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!encryptionKey) {
    return (
      <SafeAreaView style={styles.flex}>
        {screen.name === 'auth' ? (
          <AuthScreen onAuthenticated={handleAuthenticated} />
        ) : (
          <UnlockScreen onUnlocked={handleAuthenticated} onUseDifferentAccount={handleUseDifferentAccount} />
        )}
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex}>
      {screen.name === 'entry' ? (
        <EntryScreen
          encryptionKey={encryptionKey}
          entryId={screen.entryId}
          onDone={() => {
            setRefreshToken((t) => t + 1); // also re-triggers a sync, see HomeScreen
            setScreen({ name: 'home' });
          }}
        />
      ) : (
        <HomeScreen
          encryptionKey={encryptionKey}
          refreshToken={refreshToken}
          onNewEntry={() => setScreen({ name: 'entry', entryId: null })}
          onOpenEntry={(id) => setScreen({ name: 'entry', entryId: id })}
        />
      )}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
