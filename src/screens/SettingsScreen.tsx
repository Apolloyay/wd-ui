import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import { colors } from '../theme/colors';

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
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  backRow: { marginBottom: 8 },
  backText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 20, marginBottom: 8 },
  actionButton: {
    backgroundColor: colors.chip,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  actionButtonText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  actionDescription: { fontSize: 12, color: colors.textMuted, marginTop: 6, maxWidth: 480 },
  dangerButton: { backgroundColor: colors.dangerBg },
  dangerButtonText: { color: colors.danger },
});
