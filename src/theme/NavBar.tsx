import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './colors';

interface Props {
  title: string;
  onBack?: () => void;
  // Existing screens' translated back strings already read e.g. "‹ Books" --
  // the leading chevron is stripped so it isn't drawn twice next to ours.
  backLabel?: string;
  right?: ReactNode;
}

/**
 * Compact iOS-style navigation bar: centered title, a chevron + label back
 * button overlaid on the left, an optional action/status overlaid on the
 * right. Used in place of each screen's wide-layout header when the app is
 * running at iPhone width -- see useIsPhoneWidth.
 */
export default function NavBar({ title, onBack, backLabel, right }: Props) {
  const cleanBackLabel = backLabel?.replace(/^[‹<]\s*/, '');
  return (
    <View style={styles.bar}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.leftOverlay}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack} hitSlop={8}>
            <Text style={styles.chevron}>‹</Text>
            {!!cleanBackLabel && (
              <Text style={styles.backLabel} numberOfLines={1}>
                {cleanBackLabel}
              </Text>
            )}
          </Pressable>
        )}
      </View>
      {right && <View style={styles.rightOverlay}>{right}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 44,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, textAlign: 'center', marginHorizontal: 84 },
  leftOverlay: {
    position: 'absolute',
    left: 4,
    top: 0,
    bottom: 0,
    maxWidth: 150,
    justifyContent: 'center',
  },
  rightOverlay: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  backButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8 },
  chevron: { fontSize: 28, lineHeight: 30, color: colors.primary, marginRight: 2 },
  backLabel: { fontSize: 17, color: colors.primary, flexShrink: 1 },
});
