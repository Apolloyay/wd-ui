import { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EncryptionKey } from '../crypto/crypto';
import { createEntry, getEntry, updateEntry } from '../db/entriesRepository';

interface Props {
  encryptionKey: EncryptionKey;
  entryId: string | null; // null = creating a new entry
  onDone: () => void;
}

export default function EntryScreen({ encryptionKey, entryId, onDone }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(!!entryId);

  useEffect(() => {
    if (!entryId) return;
    (async () => {
      const existing = await getEntry(entryId, encryptionKey);
      if (existing) {
        setTitle(existing.title);
        setBody(existing.body);
      }
      setLoading(false);
    })();
  }, [entryId, encryptionKey]);

  const handleSave = async () => {
    if (entryId) {
      await updateEntry(entryId, { title, body }, encryptionKey);
    } else {
      await createEntry({ title, body }, encryptionKey);
    }
    onDone();
  };

  if (loading) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Button title="Cancel" onPress={onDone} />
        <Text style={styles.headerTitle}>{entryId ? 'Edit Entry' : 'New Entry'}</Text>
        <Button title="Save" onPress={handleSave} />
      </View>
      <TextInput
        style={styles.titleInput}
        placeholder="Title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.bodyInput}
        placeholder="Write what's on your mind..."
        value={body}
        onChangeText={setBody}
        multiline
        textAlignVertical="top"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  titleInput: { fontSize: 20, fontWeight: '700', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 8 },
  bodyInput: { fontSize: 16, minHeight: 300, lineHeight: 22 },
});
