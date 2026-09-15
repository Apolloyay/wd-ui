import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { deriveKeyFromPassphrase, generateSalt, type EncryptionKey } from '../crypto/crypto';
import { loadSalt, saveSalt } from '../crypto/keyStore';

interface Props {
  onUnlocked: (key: EncryptionKey) => void;
}

/**
 * Very first cut of the unlock flow: derives the encryption key from a
 * passphrase the user chooses. There is no server-side auth wired up yet —
 * this only protects the local database. See server/README.md for the
 * backend piece that adds account-based cloud sync on top of this.
 */
export default function UnlockScreen({ onUnlocked }: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (passphrase.length < 8) {
      setError('Use at least 8 characters — this passphrase protects your entries.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let salt = await loadSalt();
      if (!salt) {
        salt = generateSalt();
        await saveSalt(salt);
      }
      const key = deriveKeyFromPassphrase(passphrase, salt);
      onUnlocked(key);
    } catch (e) {
      setError('Could not unlock. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>We Diary</Text>
      <Text style={styles.subtitle}>Enter your passphrase to unlock your entries</Text>
      <TextInput
        style={styles.input}
        placeholder="Passphrase"
        secureTextEntry
        value={passphrase}
        onChangeText={setPassphrase}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {busy ? <ActivityIndicator /> : <Button title="Continue" onPress={handleContinue} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: '#c0392b', textAlign: 'center' },
});
