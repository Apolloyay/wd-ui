import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './colors';

export interface TabBarItem {
  key: string;
  label: string;
  icon: string;
}

interface Props {
  items: TabBarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

/** iOS-style bottom tab bar, shown instead of the top icon row when the app is running at iPhone width. */
export default function TabBar({ items, activeKey, onSelect }: Props) {
  return (
    <View style={styles.bar}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable key={item.key} style={styles.tab} onPress={() => onSelect(item.key)} hitSlop={4}>
            <Text style={[styles.icon, active && styles.iconActive]}>{item.icon}</Text>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingTop: 6,
    paddingBottom: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  icon: { fontSize: 21, opacity: 0.5 },
  iconActive: { opacity: 1 },
  label: { fontSize: 10, color: colors.textMuted },
  labelActive: { color: colors.primary, fontWeight: '700' },
});
