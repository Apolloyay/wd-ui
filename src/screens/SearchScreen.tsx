import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EncryptionKey } from '../crypto/crypto';
import { listBooks } from '../db/booksRepository';
import { listEntries } from '../db/entriesRepository';
import { bodyToPlainText } from '../richtext/bodyText';
import { usePeriodicSync } from '../sync/useSync';
import { colors } from '../theme/colors';
import NavBar from '../theme/NavBar';
import { useIsPhoneWidth } from '../theme/responsive';
import type { DiaryBook } from '../types/book';
import type { DiaryEntry } from '../types/entry';

interface Props {
  encryptionKey: EncryptionKey;
  // Undefined at phone width when this screen is a bottom-tab-bar peer of
  // Books rather than pushed from it -- see App.tsx's showBackOnRootTabs.
  onBack?: () => void;
  onOpenEntry: (book: DiaryBook, entryId: string) => void;
}

export default function SearchScreen({ encryptionKey, onBack, onOpenEntry }: Props) {
  const { t, i18n } = useTranslation();
  const isPhoneWidth = useIsPhoneWidth();
  const [books, setBooks] = useState<DiaryBook[]>([]);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [keyword, setKeyword] = useState('');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const refresh = useCallback(async () => {
    const [bookResult, entryResult] = await Promise.all([listBooks(encryptionKey), listEntries(encryptionKey)]);
    setBooks(bookResult);
    setEntries(entryResult);
  }, [encryptionKey]);

  usePeriodicSync(refresh);

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const shownBooks = useMemo(() => (showHidden ? books : books.filter((b) => !b.hidden)), [books, showHidden]);
  const shownEntries = useMemo(
    () => (showHidden ? entries : entries.filter((e) => !e.hidden && !booksById.get(e.bookId)?.hidden)),
    [entries, showHidden, booksById]
  );

  // Tag choices are scoped to the selected book (if any) so they stay
  // relevant instead of listing every tag from every diary at once.
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of shownEntries) {
      if (selectedBookId && e.bookId !== selectedBookId) continue;
      for (const tag of e.tags) set.add(tag);
    }
    return Array.from(set).sort();
  }, [shownEntries, selectedBookId]);

  const results = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return shownEntries.filter((e) => {
      if (selectedBookId && e.bookId !== selectedBookId) return false;
      if (selectedTag && !e.tags.includes(selectedTag)) return false;
      if (
        needle &&
        !e.title.toLowerCase().includes(needle) &&
        !bodyToPlainText(e).toLowerCase().includes(needle) &&
        !e.comments.some((c) => c.body.toLowerCase().includes(needle))
      ) {
        return false;
      }
      return true;
    });
  }, [shownEntries, keyword, selectedBookId, selectedTag]);

  const handleSelectBook = (bookId: string | null) => {
    setSelectedBookId(bookId);
    setSelectedTag(null); // tag list is about to change scope, drop a now-possibly-invalid selection
  };

  return (
    <View style={styles.container}>
      {isPhoneWidth && <NavBar title={t('search.title')} onBack={onBack} backLabel={t('search.back')} />}
      <View style={styles.content}>
        {!isPhoneWidth && (
          <>
            {onBack && (
              <Pressable onPress={onBack} style={styles.backRow}>
                <Text style={styles.backText}>{t('search.back')}</Text>
              </Pressable>
            )}
            <Text style={styles.title}>{t('search.title')}</Text>
          </>
        )}

        <TextInput
          style={styles.input}
          placeholder={t('search.placeholder')}
          value={keyword}
          onChangeText={setKeyword}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable onPress={() => setShowHidden((v) => !v)} style={styles.showHiddenToggle}>
          <Text style={styles.showHiddenText}>{t(showHidden ? 'search.hideHidden' : 'search.showHidden')}</Text>
        </Pressable>

        <Text style={styles.filterLabel}>{t('search.filterByBook')}</Text>
        <FlatList
          horizontal
          data={shownBooks}
          keyExtractor={(b) => b.id}
          style={styles.filterList}
          showsHorizontalScrollIndicator={false}
          ListHeaderComponent={
            <Pressable
              style={[styles.chip, selectedBookId === null && styles.chipActive]}
              onPress={() => handleSelectBook(null)}
            >
              <Text style={[styles.chipText, selectedBookId === null && styles.chipTextActive]}>
                {t('search.allBooks')}
              </Text>
            </Pressable>
          }
          renderItem={({ item: book }) => (
            <Pressable
              style={[styles.chip, selectedBookId === book.id && styles.chipActive]}
              onPress={() => handleSelectBook(book.id)}
            >
              <Text style={[styles.chipText, selectedBookId === book.id && styles.chipTextActive]}>{book.name}</Text>
            </Pressable>
          )}
        />

        {availableTags.length > 0 && (
          <>
            <Text style={styles.filterLabel}>{t('search.filterByTag')}</Text>
            <FlatList
              horizontal
              data={availableTags}
              keyExtractor={(tag) => tag}
              style={styles.filterList}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item: tag }) => (
                <Pressable
                  style={[styles.chip, selectedTag === tag && styles.chipActive]}
                  onPress={() => setSelectedTag(selectedTag === tag ? null : tag)}
                >
                  <Text style={[styles.chipText, selectedTag === tag && styles.chipTextActive]}>{tag}</Text>
                </Pressable>
              )}
            />
          </>
        )}

        <Text style={styles.resultCount}>{t('search.resultCount', { count: results.length })}</Text>

        {results.length === 0 && <Text style={styles.empty}>{t('search.empty')}</Text>}

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const book = booksById.get(item.bookId);
            return (
              <Pressable
                style={styles.card}
                onPress={() => book && onOpenEntry(book, item.id)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.title || t('entries.untitled')}</Text>
                  <View style={styles.cardBadges}>
                    {item.images.length > 0 && <Text style={styles.photoBadge}>📷 {item.images.length}</Text>}
                    {item.location && <Text style={styles.photoBadge}>📍</Text>}
                    {item.hidden && <Text style={styles.hiddenBadge}>{t('entries.hiddenBadge')}</Text>}
                    {book && <Text style={styles.cardBook}>{book.name}</Text>}
                  </View>
                </View>
                <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString(i18n.language)}</Text>
                <Text numberOfLines={2} style={styles.cardBody}>
                  {bodyToPlainText(item)}
                </Text>
                {item.tags.length > 0 && (
                  <View style={styles.cardTags}>
                    {item.tags.map((tag) => (
                      <View key={tag} style={styles.cardTag}>
                        <Text style={styles.cardTagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  backRow: { marginBottom: 8 },
  backText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: colors.white,
    color: colors.text,
  },
  showHiddenToggle: { alignSelf: 'flex-start', marginBottom: 12 },
  showHiddenText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  filterLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
  filterList: { marginBottom: 12, flexGrow: 0 },
  chip: { backgroundColor: colors.chip, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginRight: 8 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textDim },
  chipTextActive: { color: colors.white, fontWeight: '600' },
  resultCount: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  card: { padding: 14, borderRadius: 16, backgroundColor: colors.card, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', flexShrink: 1, color: colors.text },
  cardBadges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  photoBadge: { fontSize: 11, color: colors.textSecondary },
  cardBook: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
    backgroundColor: colors.chipTag,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  hiddenBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cardDate: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: 4 },
  cardBody: { fontSize: 14, color: colors.text },
  cardTags: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  cardTag: { backgroundColor: colors.chipTag, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  cardTagText: { fontSize: 11, color: colors.textDim },
});
