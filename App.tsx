import { useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { EncryptionKey } from './src/crypto/crypto';
import UnlockScreen from './src/screens/UnlockScreen';
import HomeScreen from './src/screens/HomeScreen';
import EntryScreen from './src/screens/EntryScreen';

type Route = { name: 'home' } | { name: 'entry'; entryId: string | null };

export default function App() {
  const [encryptionKey, setEncryptionKey] = useState<EncryptionKey | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [refreshToken, setRefreshToken] = useState(0);

  if (!encryptionKey) {
    return (
      <SafeAreaView style={styles.flex}>
        <UnlockScreen onUnlocked={setEncryptionKey} />
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex}>
      {route.name === 'home' ? (
        <HomeScreen
          encryptionKey={encryptionKey}
          refreshToken={refreshToken}
          onNewEntry={() => setRoute({ name: 'entry', entryId: null })}
          onOpenEntry={(id) => setRoute({ name: 'entry', entryId: id })}
        />
      ) : (
        <EntryScreen
          encryptionKey={encryptionKey}
          entryId={route.entryId}
          onDone={() => {
            setRefreshToken((t) => t + 1);
            setRoute({ name: 'home' });
          }}
        />
      )}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
});
