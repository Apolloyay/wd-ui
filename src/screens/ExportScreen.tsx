import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EncryptionKey } from '../crypto/crypto';
import { listBooks } from '../db/booksRepository';
import { listEntries } from '../db/entriesRepository';
import { getImageBlob } from '../db/imageBlobRepository';
import { exportEntriesToPdf } from '../export/exportPdf';
import { slugifyForFilename } from '../export/pdfTemplate';
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
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function ExportScreen({ encryptionKey, onBack }: Props) {
  const { t, i18n } = useTranslation();
  const isPhoneWidth = useIsPhoneWidth();
  const [books, setBooks] = useState<DiaryBook[]>([]);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [includeHidden, setIncludeHidden] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [bookResult, entryResult] = await Promise.all([listBooks(encryptionKey), listEntries(encryptionKey)]);
    setBooks(bookResult);
    setEntries(entryResult);
  }, [encryptionKey]);

  usePeriodicSync(refresh);

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const shownBooks = useMemo(
    () => (includeHidden ? books : books.filter((b) => !b.hidden)),
    [books, includeHidden]
  );

  const matchingEntries = useMemo(() => {
    const from = fromDate.trim();
    const to = toDate.trim();
    const fromValid = DATE_RE.test(from);
    const toValid = DATE_RE.test(to);
    return entries
      .filter((e) => {
        if (!includeHidden && (e.hidden || booksById.get(e.bookId)?.hidden)) return false;
        if (selectedBookId && e.bookId !== selectedBookId) return false;
        const day = e.createdAt.slice(0, 10);
        if (fromValid && day < from) return false;
        if (toValid && day > to) return false;
        return true;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [entries, booksById, selectedBookId, fromDate, toDate, includeHidden]);

  const handleExport = async () => {
    setError(null);
    if (matchingEntries.length === 0) {
      setError(t('export.nothingToExport'));
      return;
    }
    setExporting(true);
    try {
      const imagesByEntryId: Record<string, ImageBlob[]> = {};
      for (const entry of matchingEntries) {
        const resolved: ImageBlob[] = [];
        for (const img of entry.images) {
          const blob = await getImageBlob(img.id, encryptionKey);
          if (blob) resolved.push(blob);
        }
        imagesByEntryId[entry.id] = resolved;
      }
      const scopeName = selectedBookId ? booksById.get(selectedBookId)?.name ?? 'diary' : 'we-diary';
      const rangeSuffix = fromDate.trim() || toDate.trim() ? `-${fromDate.trim() || 'start'}-to-${toDate.trim() || 'now'}` : '';
      const filename = `${slugifyForFilename(scopeName, 'diary')}${rangeSuffix}.pdf`;
      await exportEntriesToPdf(
        matchingEntries,
        imagesByEntryId,
        { untitled: t('entries.untitled'), tagsLabel: t('entry.tagsLabel'), commentsLabel: t('entry.commentsLabel') },
        i18n.language,
        filename
      );
    } catch {
      setError(t('export.error'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      {isPhoneWidth && <NavBar title={t('export.title')} onBack={onBack} backLabel={t('export.back')} />}
      <View style={styles.content}>
        {!isPhoneWidth && (
          <>
            {onBack && (
              <Pressable onPress={onBack} style={styles.backRow}>
                <Text style={styles.backText}>{t('export.back')}</Text>
              </Pressable>
            )}
            <Text style={styles.title}>{t('export.title')}</Text>
          </>
        )}

        <Text style={styles.filterLabel}>{t('export.scopeLabel')}</Text>
        <FlatList
          horizontal
          data={shownBooks}
          keyExtractor={(b) => b.id}
          style={styles.filterList}
          showsHorizontalScrollIndicator={false}
          ListHeaderComponent={
            <Pressable
              style={[styles.chip, selectedBookId === null && styles.chipActive]}
              onPress={() => setSelectedBookId(null)}
            >
              <Text style={[styles.chipText, selectedBookId === null && styles.chipTextActive]}>
                {t('export.allBooks')}
              </Text>
            </Pressable>
          }
          renderItem={({ item: book }) => (
            <Pressable
              style={[styles.chip, selectedBookId === book.id && styles.chipActive]}
              onPress={() => setSelectedBookId(book.id)}
            >
              <Text style={[styles.chipText, selectedBookId === book.id && styles.chipTextActive]}>{book.name}</Text>
            </Pressable>
          )}
        />

        <Text style={styles.filterLabel}>{t('export.dateRangeLabel')}</Text>
        <View style={styles.dateRow}>
          <TextInput
            style={styles.dateInput}
            placeholder={t('export.fromPlaceholder')}
            value={fromDate}
            onChangeText={setFromDate}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.dateInput}
            placeholder={t('export.toPlaceholder')}
            value={toDate}
            onChangeText={setToDate}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Pressable onPress={() => setIncludeHidden((v) => !v)} style={styles.showHiddenToggle}>
          <Text style={styles.showHiddenText}>{t(includeHidden ? 'export.hideHidden' : 'export.showHidden')}</Text>
        </Pressable>

        <Text style={styles.resultCount}>{t('export.entryCount', { count: matchingEntries.length })}</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.exportButton} onPress={handleExport} disabled={exporting}>
          {exporting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.exportButtonText}>{t('export.exportButton')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  backRow: { marginBottom: 8 },
  backText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 16 },
  filterLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, marginTop: 12 },
  filterList: { marginBottom: 4, flexGrow: 0 },
  chip: { backgroundColor: colors.chip, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginRight: 8 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textDim },
  chipTextActive: { color: colors.white, fontWeight: '600' },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: colors.white,
    color: colors.text,
  },
  showHiddenToggle: { alignSelf: 'flex-start', marginTop: 16 },
  showHiddenText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  resultCount: { fontSize: 13, color: colors.textSecondary, marginTop: 20, marginBottom: 12 },
  error: { color: colors.danger, fontSize: 13, marginBottom: 12 },
  exportButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 24,
  },
  exportButtonText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
