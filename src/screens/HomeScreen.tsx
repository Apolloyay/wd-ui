import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { EncryptionKey } from '../crypto/crypto';
import { listEntries } from '../db/entriesRepository';
import type { DiaryEntry } from '../types/entry';

interface Props {
  encryptionKey: EncryptionKey;
  onNewEntry: () => void;
  onOpenEntry: (id: string) => void;
  refreshToken: number; // bump this after creating/editing an entry to refetch
}

export default function HomeScreen({ encryptionKey, onNewEntry, onOpenEntry, refreshToken }: Props) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await listEntries(encryptionKey);
    setEntries(result);
    setLoading(false);
  }, [encryptionKey]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshToken]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Entries</Text>
        <Pressable style={styles.newButton} onPress={onNewEntry}>
          <Text style={styles.newButtonText}>+ New</Text>
        </Pressable>
      </View>

      {!loading && entries.length === 0 && (
        <Text style={styles.empty}>No entries yet — tap "+ New" to write your first one.</Text>
      )}

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => onOpenEntry(item.id)}>
            <Text style={styles.cardTitle}>{item.title || '(untitled)'}</Text>
            <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString()}</Text>
            <Text numberOfLines={2} style={styles.cardBody}>
              {item.body}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  newButton: { backgroundColor: '#2d6cdf', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  newButtonText: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  card: { padding: 14, borderRadius: 10, backgroundColor: '#f4f4f6', marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardDate: { fontSize: 12, color: '#888', marginBottom: 4 },
  cardBody: { fontSize: 14, color: '#333' },
});
