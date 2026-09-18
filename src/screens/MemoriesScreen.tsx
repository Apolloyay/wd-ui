import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { EncryptionKey } from '../crypto/crypto';
import { listBooks } from '../db/booksRepository';
import { listEntries } from '../db/entriesRepository';
import { getImageBlob } from '../db/imageBlobRepository';
import { bodyToPlainText } from '../richtext/bodyText';
import { usePeriodicSync } from '../sync/useSync';
import { colors } from '../theme/colors';
import NavBar from '../theme/NavBar';
import { useIsPhoneWidth } from '../theme/responsive';
import type { DiaryBook } from '../types/book';
import type { DiaryEntry } from '../types/entry';
import type { ImageBlob } from '../types/image';

interface Props {
  encryptionKey: EncryptionKey;
  // Undefined at phone width when this screen is a bottom-tab-bar peer of
  // Books rather than pushed from it -- see App.tsx's showBackOnRootTabs.
  onBack?: () => void;
  onOpenEntry: (book: DiaryBook, entryId: string) => void;
}

interface MemoryGroup {
  yearsAgo: number;
  entries: DiaryEntry[];
}

export default function MemoriesScreen({ encryptionKey, onBack, onOpenEntry }: Props) {
  const { t, i18n } = useTranslation();
  const isPhoneWidth = useIsPhoneWidth();
  const [books, setBooks] = useState<DiaryBook[]>([]);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [imageBlobs, setImageBlobs] = useState<Record<string, ImageBlob | null>>({});
  const fetchedImageIds = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const [bookResult, entryResult] = await Promise.all([listBooks(encryptionKey), listEntries(encryptionKey)]);
    setBooks(bookResult);
    setEntries(entryResult);
  }, [encryptionKey]);

  usePeriodicSync(refresh);

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const shownEntries = useMemo(
    () => (showHidden ? entries : entries.filter((e) => !e.hidden && !booksById.get(e.bookId)?.hidden)),
    [entries, showHidden, booksById]
  );

  // Same calendar month+day as today, in any earlier year -- today's own
  // freshly written entries aren't "memories" yet.
  const groups = useMemo<MemoryGroup[]>(() => {
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const byYearsAgo = new Map<number, DiaryEntry[]>();
    for (const entry of shownEntries) {
      const created = new Date(entry.createdAt);
      if (created.getMonth() !== todayMonth || created.getDate() !== todayDate) continue;
      const yearsAgo = today.getFullYear() - created.getFullYear();
      if (yearsAgo <= 0) continue;
      const bucket = byYearsAgo.get(yearsAgo) ?? [];
      bucket.push(entry);
      byYearsAgo.set(yearsAgo, bucket);
    }
    return Array.from(byYearsAgo.entries())
      .sort(([a], [b]) => a - b)
      .map(([yearsAgo, groupEntries]) => ({
        yearsAgo,
        entries: groupEntries.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      }));
  }, [shownEntries]);

  // Lazily fetches a thumbnail for each memory that has a photo -- mirrors
  // EntryScreen's on-demand image loading rather than pulling every blob.
  useEffect(() => {
    for (const group of groups) {
      for (const entry of group.entries) {
        const img = entry.images[0];
        if (!img || fetchedImageIds.current.has(img.id)) continue;
        fetchedImageIds.current.add(img.id);
        getImageBlob(img.id, encryptionKey).then((blob) => {
          setImageBlobs((prev) => ({ ...prev, [img.id]: blob }));
        });
      }
    }
  }, [groups, encryptionKey]);

  return (
    <View style={styles.container}>
      {isPhoneWidth && <NavBar title={t('memories.title')} onBack={onBack} backLabel={t('memories.back')} />}
      <View style={styles.content}>
        {!isPhoneWidth && (
          <>
            {onBack && (
              <Pressable onPress={onBack} style={styles.backRow}>
                <Text style={styles.backText}>{t('memories.back')}</Text>
              </Pressable>
            )}
            <Text style={styles.title}>{t('memories.title')}</Text>
          </>
        )}
        <Text style={styles.subtitle}>{t('memories.subtitle')}</Text>

        <Pressable onPress={() => setShowHidden((v) => !v)} style={styles.showHiddenToggle}>
          <Text style={styles.showHiddenText}>{t(showHidden ? 'memories.hideHidden' : 'memories.showHidden')}</Text>
        </Pressable>

        {groups.length === 0 && <Text style={styles.empty}>{t('memories.empty')}</Text>}

        <FlatList
          data={groups}
          keyExtractor={(group) => String(group.yearsAgo)}
          renderItem={({ item: group }) => (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>{t('memories.yearsAgo', { count: group.yearsAgo })}</Text>
              {group.entries.map((entry) => {
                const book = booksById.get(entry.bookId);
                const thumbImg = entry.images[0];
                const thumbBlob = thumbImg ? imageBlobs[thumbImg.id] : undefined;
                return (
                  <Pressable
                    key={entry.id}
                    style={styles.card}
                    onPress={() => book && onOpenEntry(book, entry.id)}
                  >
                    {thumbImg &&
                      (thumbBlob ? (
                        <Image
                          source={{ uri: `data:${thumbBlob.mimeType};base64,${thumbBlob.dataBase64}` }}
                          style={styles.cardThumb}
                        />
                      ) : thumbBlob === null ? null : (
                        <View style={[styles.cardThumb, styles.cardThumbLoading]}>
                          <ActivityIndicator size="small" />
                        </View>
                      ))}
                    <View style={styles.cardBody}>
                      <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>{entry.title || t('entries.untitled')}</Text>
                        {entry.hidden && <Text style={styles.hiddenBadge}>{t('entries.hiddenBadge')}</Text>}
                        {book && <Text style={styles.cardBook}>{book.name}</Text>}
                      </View>
                      <Text style={styles.cardDate}>{new Date(entry.createdAt).toLocaleDateString(i18n.language)}</Text>
                      <Text numberOfLines={2} style={styles.cardText}>
                        {bodyToPlainText(entry)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
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
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 12 },
  showHiddenToggle: { alignSelf: 'flex-start', marginBottom: 16 },
  showHiddenText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  group: { marginBottom: 20 },
  groupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.04,
  },
  card: { flexDirection: 'row', padding: 12, borderRadius: 16, backgroundColor: colors.card, marginBottom: 10, gap: 12 },
  cardThumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.chip },
  cardThumbLoading: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardTitle: { fontSize: 15, fontWeight: '700', flexShrink: 1, color: colors.text },
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
  cardDate: { fontSize: 11, color: colors.textMuted, marginTop: 2, marginBottom: 4 },
  cardText: { fontSize: 13, color: colors.text },
});
