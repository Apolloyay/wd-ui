import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type SupportedLanguage } from './index';
import { saveLanguage } from './languageStore';

/**
 * A row of language chips -- scales to however many SUPPORTED_LANGUAGES
 * ends up holding, not just today's two. Changing the language here updates
 * every screen immediately (react-i18next re-renders on i18n's languageChanged
 * event) and persists the choice for the next launch.
 */
export default function LanguageSwitcher() {
  // useTranslation (rather than reading the i18n singleton directly) is what
  // subscribes this component to languageChanged, so it re-renders itself too.
  const { i18n } = useTranslation();
  const current = i18n.language as SupportedLanguage;

  const handleSelect = async (language: SupportedLanguage) => {
    if (language === current) return;
    await i18n.changeLanguage(language);
    await saveLanguage(language);
  };

  return (
    <View style={styles.row}>
      {SUPPORTED_LANGUAGES.map((language) => (
        <Pressable
          key={language}
          style={[styles.chip, language === current && styles.chipActive]}
          onPress={() => handleSelect(language)}
        >
          <Text style={[styles.chipText, language === current && styles.chipTextActive]}>
            {LANGUAGE_LABELS[language]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  chip: { backgroundColor: colors.chip, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textDim },
  chipTextActive: { color: colors.white, fontWeight: '600' },
});
