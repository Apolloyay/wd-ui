import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import LanguageSwitcher from '../i18n/LanguageSwitcher';

interface Props {
  onBack: () => void;
  onLock: () => void;
  onSignOut: () => void;
}

export default function SettingsScreen({ onBack, onLock, onSignOut }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Pressable onPress={onBack} style={styles.backRow}>
          <Text style={styles.backText}>{t('settings.back')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('settings.title')}</Text>

        <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
        <LanguageSwitcher />

        <Text style={styles.sectionLabel}>{t('settings.account')}</Text>

        <Pressable style={styles.actionButton} onPress={onLock}>
          <Text style={styles.actionButtonText}>{t('settings.lock')}</Text>
        </Pressable>
        <Text style={styles.actionDescription}>{t('settings.lockDescription')}</Text>

        <Pressable style={[styles.actionButton, styles.dangerButton]} onPress={onSignOut}>
          <Text style={[styles.actionButtonText, styles.dangerButtonText]}>{t('settings.signOut')}</Text>
        </Pressable>
        <Text style={styles.actionDescription}>{t('settings.signOutDescription')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  backRow: { marginBottom: 8 },
  backText: { fontSize: 14, color: '#2d6cdf', fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginTop: 20, marginBottom: 8 },
  actionButton: {
    backgroundColor: '#eef1f6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  actionButtonText: { fontSize: 14, fontWeight: '600', color: '#2d6cdf' },
  actionDescription: { fontSize: 12, color: '#888', marginTop: 6, maxWidth: 480 },
  dangerButton: { backgroundColor: '#fdecea' },
  dangerButtonText: { color: '#c0392b' },
});
