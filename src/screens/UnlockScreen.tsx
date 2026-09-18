import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { deriveKeyFromPassphrase, verifyCanary, type EncryptionKey } from '../crypto/crypto';
import { loadCanary, loadSalt } from '../crypto/keyStore';
import Button from '../theme/Button';
import { colors } from '../theme/colors';

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
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const [salt, canary] = await Promise.all([loadSalt(), loadCanary()]);
      if (!salt || !canary) {
        setError(t('unlock.noAccountError'));
        return;
      }
      const key = deriveKeyFromPassphrase(passphrase, salt);
      if (!verifyCanary(key, canary)) {
        setError(t('unlock.incorrectPassphrase'));
        return;
      }
      onUnlocked(key);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('common.appName')}</Text>
      <Text style={styles.subtitle}>{t('unlock.subtitle')}</Text>
      <TextInput
        style={styles.input}
        placeholder={t('unlock.passphrasePlaceholder')}
        secureTextEntry
        value={passphrase}
        onChangeText={setPassphrase}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={handleUnlock}
      />
      {/* Fixed-height slots so an error appearing / the button<->spinner swap
          don't shift the rest of the form — that reflow is what read as a
          "flicker" on a near-instant (offline) check. */}
      <View style={styles.errorSlot}>{error && <Text style={styles.error}>{error}</Text>}</View>
      <View style={styles.buttonSlot}>
        {busy ? <ActivityIndicator color={colors.primary} /> : <Button title={t('unlock.unlock')} onPress={handleUnlock} />}
      </View>
      <Text style={styles.link} onPress={onUseDifferentAccount}>
        {t('unlock.useDifferentAccount')}
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
