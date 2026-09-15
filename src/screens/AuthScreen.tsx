import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { login, register } from '../api/client';
import { saveAccessToken } from '../auth/session';
import { createCanary, deriveKeyFromPassphrase, type EncryptionKey } from '../crypto/crypto';
import { saveCanary, saveSalt } from '../crypto/keyStore';

interface Props {
  onAuthenticated: (key: EncryptionKey) => void;
}

/**
 * First-run (or "use a different account") screen. Needs the network once,
 * to register/login — after this, UnlockScreen handles returning launches
 * fully offline using the salt + canary this screen stores.
 */
export default function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const auth = mode === 'login' ? await login(email, password) : await register(email, password);

      // This same password both authenticates the account AND derives the
      // local encryption key (via the server-issued salt) — the server
      // only ever stores a bcrypt hash of it, never the key itself.
      const key = deriveKeyFromPassphrase(password, auth.encryptionSalt);

      await saveAccessToken(auth.accessToken);
      await saveSalt(auth.encryptionSalt);
      await saveCanary(createCanary(key));

      onAuthenticated(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>We Diary</Text>
      <Text style={styles.subtitle}>
        {mode === 'login' ? 'Log in to sync your entries' : 'Create an account to sync your entries'}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password (min 8 characters)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Fixed-height slots so an error appearing / the button<->spinner swap
          don't shift the rest of the form — that reflow is what read as a
          "flicker" on a fast (local) request, even though nothing reloads. */}
      <View style={styles.errorSlot}>{error && <Text style={styles.error}>{error}</Text>}</View>

      <View style={styles.buttonSlot}>
        {busy ? (
          <ActivityIndicator />
        ) : (
          <Button title={mode === 'login' ? 'Log in' : 'Create account'} onPress={handleSubmit} />
        )}
      </View>

      <Text style={styles.link} onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Log in'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Capped + centered so inputs don't stretch edge-to-edge on wide/ultrawide windows.
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
  errorSlot: { minHeight: 20, justifyContent: 'center' },
  error: { color: '#c0392b', textAlign: 'center' },
  buttonSlot: { minHeight: 44, justifyContent: 'center' },
  link: { color: '#2d6cdf', textAlign: 'center', marginTop: 16 },
});
