import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from './colors';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  busy?: boolean;
  disabled?: boolean;
}

/**
 * Rounded pill button used in place of RN's native Button, which can't be
 * given the warm palette or rounded corners this app's theme wants.
 */
export default function Button({ title, onPress, variant = 'primary', busy, disabled }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        variant === 'secondary' && styles.secondary,
        (pressed || disabled) && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled || busy}
    >
      {busy ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.text}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { backgroundColor: colors.secondary },
  pressed: { opacity: 0.8 },
  text: { color: colors.white, fontWeight: '700', fontSize: 16 },
});
