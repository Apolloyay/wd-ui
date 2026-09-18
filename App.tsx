import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { clearAccessToken } from './src/auth/session';
import type { EncryptionKey } from './src/crypto/crypto';
import { clearCanary, clearSalt, loadCanary, loadSalt } from './src/crypto/keyStore';
import i18n, { detectDefaultLanguage } from './src/i18n';
import { loadLanguage } from './src/i18n/languageStore';
import AuthScreen from './src/screens/AuthScreen';
import BooksScreen from './src/screens/BooksScreen';
import EntryScreen from './src/screens/EntryScreen';
import ExportScreen from './src/screens/ExportScreen';
import HomeScreen from './src/screens/HomeScreen';
import MemoriesScreen from './src/screens/MemoriesScreen';
import SearchScreen from './src/screens/SearchScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UnlockScreen from './src/screens/UnlockScreen';
import { colors } from './src/theme/colors';
import type { DiaryBook } from './src/types/book';
import type { DiaryEntry } from './src/types/entry';

type Screen =
  | { name: 'loading' }
  | { name: 'auth' }
  | { name: 'unlock' }
  | { name: 'books' }
  | { name: 'settings' }
  | { name: 'search' }
  | { name: 'memories' }
  | { name: 'export' }
  | { name: 'entries'; book: DiaryBook }
  | { name: 'entry'; book: DiaryBook; entryId: string | null; newEntryType?: DiaryEntry['entryType'] };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [encryptionKey, setEncryptionKey] = useState<EncryptionKey | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    (async () => {
      const [salt, canary, savedLanguage] = await Promise.all([loadSalt(), loadCanary(), loadLanguage()]);
      // No language chosen yet on this device -- guess from the OS locale
      // rather than defaulting everyone to English.
      await i18n.changeLanguage(savedLanguage ?? detectDefaultLanguage());
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
    setScreen({ name: 'books' });
  };

  const handleUseDifferentAccount = async () => {
    // Forgets this device's local credentials only. Existing entries are
    // left in the local DB but become unreadable under a different
    // account's key — fine for now since this is a single-account-per-
    // device app; revisit if multi-account switching becomes a real need.
    await Promise.all([clearSalt(), clearCanary(), clearAccessToken()]);
    setEncryptionKey(null);
    setScreen({ name: 'auth' });
  };

  // Returns to the passphrase prompt without forgetting the account -- the
  // saved salt/canary stay put, so UnlockScreen can get back in offline.
  const handleLock = () => {
    setEncryptionKey(null);
    setScreen({ name: 'unlock' });
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
          bookId={screen.book.id}
          entryId={screen.entryId}
          newEntryType={screen.newEntryType}
          onDone={() => {
            setRefreshToken((t) => t + 1); // also re-triggers a sync, see HomeScreen
            setScreen({ name: 'entries', book: screen.book });
          }}
        />
      ) : screen.name === 'entries' ? (
        <HomeScreen
          encryptionKey={encryptionKey}
          book={screen.book}
          refreshToken={refreshToken}
          onBack={() => setScreen({ name: 'books' })}
          onNewEntry={(entryType) => setScreen({ name: 'entry', book: screen.book, entryId: null, newEntryType: entryType })}
          onOpenEntry={(id) => setScreen({ name: 'entry', book: screen.book, entryId: id })}
        />
      ) : screen.name === 'settings' ? (
        <SettingsScreen
          onBack={() => setScreen({ name: 'books' })}
          onLock={handleLock}
          onSignOut={handleUseDifferentAccount}
        />
      ) : screen.name === 'search' ? (
        <SearchScreen
          encryptionKey={encryptionKey}
          onBack={() => setScreen({ name: 'books' })}
          onOpenEntry={(book, entryId) => setScreen({ name: 'entry', book, entryId })}
        />
      ) : screen.name === 'memories' ? (
        <MemoriesScreen
          encryptionKey={encryptionKey}
          onBack={() => setScreen({ name: 'books' })}
          onOpenEntry={(book, entryId) => setScreen({ name: 'entry', book, entryId })}
        />
      ) : screen.name === 'export' ? (
        <ExportScreen encryptionKey={encryptionKey} onBack={() => setScreen({ name: 'books' })} />
      ) : (
        <BooksScreen
          encryptionKey={encryptionKey}
          onOpenBook={(book) => setScreen({ name: 'entries', book })}
          onOpenSettings={() => setScreen({ name: 'settings' })}
          onOpenSearch={() => setScreen({ name: 'search' })}
          onOpenMemories={() => setScreen({ name: 'memories' })}
          onOpenExport={() => setScreen({ name: 'export' })}
        />
      )}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
