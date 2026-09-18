import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EncryptionKey } from '../crypto/crypto';
import { countEntriesInBook } from '../db/entriesRepository';
import { BookHasEntriesError, createBook, deleteBook, listBooks, updateBook } from '../db/booksRepository';
import { usePeriodicSync, type SyncStatus } from '../sync/useSync';
import type { DiaryBook } from '../types/book';

interface Props {
  encryptionKey: EncryptionKey;
  onOpenBook: (book: DiaryBook) => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenMemories: () => void;
  onOpenExport: () => void;
}

export default function BooksScreen({
  encryptionKey,
  onOpenBook,
  onOpenSettings,
  onOpenSearch,
  onOpenMemories,
  onOpenExport,
}: Props) {
  const { t } = useTranslation();
  const [bookList, setBookList] = useState<DiaryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBookName, setNewBookName] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const refresh = useCallback(async () => {
    const result = await listBooks(encryptionKey);
    setBookList(result);
    setLoading(false);
    return result;
  }, [encryptionKey]);

  // Runs after every sync (initial, periodic, and app-foreground -- see
  // usePeriodicSync), not after every local refresh() call -- otherwise
  // deleting your last book would immediately recreate a default one.
  const handleSynced = useCallback(async () => {
    const current = await refresh();
    // First run (or a brand-new account): give people somewhere to write
    // instead of a dead-end empty list.
    if (current.length === 0) {
      await createBook({ name: t('books.defaultBookName') }, encryptionKey);
      await refresh();
    }
  }, [refresh, encryptionKey, t]);

  const syncStatus = usePeriodicSync(handleSynced);

  const handleAddBook = async () => {
    const name = newBookName.trim();
    if (!name) return;
    await createBook({ name }, encryptionKey);
    setNewBookName('');
    await refresh();
  };

  const handleDeleteBook = async (book: DiaryBook) => {
    setDeleteError(null);
    const count = await countEntriesInBook(book.id, encryptionKey);
    try {
      await deleteBook(book.id, count);
      await refresh();
    } catch (e) {
      setDeleteError(e instanceof BookHasEntriesError ? t('books.deleteHasEntriesError') : t('books.deleteGenericError'));
    }
  };

  const handleToggleHidden = async (book: DiaryBook) => {
    await updateBook(book.id, { hidden: !book.hidden }, encryptionKey);
    await refresh();
  };

  const visibleBooks = useMemo(
    () => (showHidden ? bookList : bookList.filter((b) => !b.hidden)),
    [bookList, showHidden]
  );

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{t('books.title')}</Text>
            <Text style={styles.syncStatus}>{syncStatusLabel(syncStatus, t)}</Text>
          </View>
          <View style={styles.headerButtons}>
            <Pressable
              style={styles.settingsButton}
              onPress={onOpenSearch}
              accessibilityLabel={t('search.openButtonLabel')}
            >
              <Text style={styles.settingsIcon}>🔍</Text>
            </Pressable>
            <Pressable
              style={styles.settingsButton}
              onPress={onOpenMemories}
              accessibilityLabel={t('memories.openButtonLabel')}
            >
              <Text style={styles.settingsIcon}>📅</Text>
            </Pressable>
            <Pressable
              style={styles.settingsButton}
              onPress={onOpenExport}
              accessibilityLabel={t('export.openButtonLabel')}
            >
              <Text style={styles.settingsIcon}>📤</Text>
            </Pressable>
            <Pressable
              style={styles.settingsButton}
              onPress={onOpenSettings}
              accessibilityLabel={t('settings.openButtonLabel')}
            >
              <Text style={styles.settingsIcon}>⚙</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder={t('books.newBookPlaceholder')}
            value={newBookName}
            onChangeText={setNewBookName}
            onSubmitEditing={handleAddBook}
          />
          <Pressable style={styles.addButton} onPress={handleAddBook}>
            <Text style={styles.addButtonText}>{t('books.add')}</Text>
          </Pressable>
        </View>

        {deleteError && <Text style={styles.error}>{deleteError}</Text>}

        <Pressable onPress={() => setShowHidden((v) => !v)} style={styles.showHiddenToggle}>
          <Text style={styles.showHiddenText}>{t(showHidden ? 'books.hideHidden' : 'books.showHidden')}</Text>
        </Pressable>

        {!loading && visibleBooks.length === 0 && (
          <Text style={styles.empty}>{t('books.empty')}</Text>
        )}

        <FlatList
          data={visibleBooks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.card, item.hidden && styles.cardHidden]}>
              <Pressable style={styles.cardMain} onPress={() => onOpenBook(item)}>
                <Text style={styles.cardTitle}>{item.name}</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => handleToggleHidden(item)}>
                <Text style={styles.actionButtonText}>{t(item.hidden ? 'books.unhide' : 'books.hide')}</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => handleDeleteBook(item)}>
                <Text style={styles.deleteButtonText}>{t('books.delete')}</Text>
              </Pressable>
            </View>
          )}
        />
      </View>
    </View>
  );
}

function syncStatusLabel(status: SyncStatus, t: (key: string) => string): string {
  switch (status) {
    case 'syncing':
      return t('sync.syncing');
    case 'synced':
      return t('sync.synced');
    case 'offline':
      return t('sync.offline');
    case 'signed-out':
      return t('sync.signedOut');
    case 'error':
      return t('sync.error');
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  syncStatus: { fontSize: 12, color: '#888', marginTop: 2 },
  headerButtons: { flexDirection: 'row', gap: 8 },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eef1f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: { fontSize: 18 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addButton: { backgroundColor: '#2d6cdf', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, justifyContent: 'center' },
  addButtonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#c0392b', fontSize: 13, marginBottom: 8 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  showHiddenToggle: { alignSelf: 'flex-start', marginBottom: 12 },
  showHiddenText: { fontSize: 12, color: '#2d6cdf', fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f4f4f6',
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardHidden: { opacity: 0.6 },
  cardMain: { flex: 1, padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  actionButton: { paddingHorizontal: 14, paddingVertical: 14 },
  actionButtonText: { color: '#2d6cdf', fontSize: 13 },
  deleteButtonText: { color: '#c0392b', fontSize: 13 },
});
