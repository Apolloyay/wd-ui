import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { deriveKeyFromPassphrase, verifyCanary, type EncryptionKey } from '../crypto/crypto';
import { loadCanary, loadSalt } from '../crypto/keyStore';

interface Props {
  onUnlocked: (key: EncryptionKey) => void;
  onUseDifferentAccount: () => void;
}

/**
 * Returning-user unlock — fully offline. We already have this device's
 * salt + canary from a previous login/register (AuthScreen), so we just
 * re-derive the key and check it against the canary; no network call.
 */
export default function UnlockScreen({ onUnlocked, onUseDifferentAccount }: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const [salt, canary] = await Promise.all([loadSalt(), loadCanary()]);
      if (!salt || !canary) {
        setError('No account found on this device — use "Log in / create account" below.');
        return;
      }
      const key = deriveKeyFromPassphrase(passphrase, salt);
      if (!verifyCanary(key, canary)) {
        setError('Incorrect passphrase.');
        return;
      }
      onUnlocked(key);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>We Diary</Text>
      <Text style={styles.subtitle}>Enter your passphrase to unlock</Text>
      <TextInput
        style={styles.input}
        placeholder="Passphrase"
        secureTextEntry
        value={passphrase}
        onChangeText={setPassphrase}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={handleUnlock}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {busy ? <ActivityIndicator /> : <Button title="Unlock" onPress={handleUnlock} />}
      <Text style={styles.link} onPress={onUseDifferentAccount}>
        Log in / create a different account
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Capped + centered so the input doesn't stretch edge-to-edge on wide/ultrawide windows.
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#fff',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: '#c0392b', textAlign: 'center' },
  link: { color: '#2d6cdf', textAlign: 'center', marginTop: 16 },
});
