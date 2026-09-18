import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { login, register } from '../api/client';
import { saveAccessToken } from '../auth/session';
import { createCanary, deriveKeyFromPassphrase, type EncryptionKey } from '../crypto/crypto';
import { saveCanary, saveSalt } from '../crypto/keyStore';
import Button from '../theme/Button';
import { colors } from '../theme/colors';

interface Props {
  onAuthenticated: (key: EncryptionKey) => void;
}

/**
 * First-run (or "use a different account") screen. Needs the network once,
 * to register/login — after this, UnlockScreen handles returning launches
 * fully offline using the salt + canary this screen stores.
 */
export default function AuthScreen({ onAuthenticated }: Props) {
  const { t } = useTranslation();
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
      setError(e instanceof Error ? e.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('common.appName')}</Text>
      <Text style={styles.subtitle}>
        {mode === 'login' ? t('auth.subtitleLogin') : t('auth.subtitleRegister')}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={t('auth.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder={t('auth.passwordPlaceholder')}
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
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Button title={mode === 'login' ? t('auth.logIn') : t('auth.createAccount')} onPress={handleSubmit} />
        )}
      </View>

      <Text style={styles.link} onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
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
    backgroundColor: colors.background,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  title: { fontSize: 30, fontWeight: '800', textAlign: 'center', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.white,
    color: colors.text,
  },
  errorSlot: { minHeight: 20, justifyContent: 'center' },
  error: { color: colors.danger, textAlign: 'center' },
  buttonSlot: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.primary, fontWeight: '600', textAlign: 'center', marginTop: 16 },
});
