import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { EncryptionKey } from '../crypto/crypto';
import { listEntries } from '../db/entriesRepository';
import { bodyToPlainText } from '../richtext/bodyText';
import { usePeriodicSync, type SyncStatus } from '../sync/useSync';
import { colors } from '../theme/colors';
import type { DiaryBook } from '../types/book';
import type { DiaryEntry } from '../types/entry';

interface Props {
  encryptionKey: EncryptionKey;
  book: DiaryBook;
  onBack: () => void;
  onNewEntry: (entryType: DiaryEntry['entryType']) => void;
  onOpenEntry: (id: string) => void;
  refreshToken: number; // bump this after creating/editing an entry to refetch + force an extra sync
}

export default function HomeScreen({ encryptionKey, book, onBack, onNewEntry, onOpenEntry, refreshToken }: Props) {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const refresh = useCallback(async () => {
    const result = await listEntries(encryptionKey, book.id);
    setEntries(result);
    setLoading(false);
  }, [encryptionKey, book.id]);

  // Syncs on mount, on a timer, whenever the app returns to the foreground,
  // and once more right after refreshToken bumps (saving an entry) -- sync
  // failures never block reading what's already saved locally, since refresh
  // reads from the local DB regardless of how the sync attempt went.
  const syncStatus = usePeriodicSync(refresh, refreshToken);

  useEffect(() => {
    setActiveTag(null); // reset tag filter when switching books
  }, [book.id]);

  const shownEntries = useMemo(
    () => (showHidden ? entries : entries.filter((e) => !e.hidden)),
    [entries, showHidden]
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of shownEntries) for (const tag of e.tags) set.add(tag);
    return Array.from(set).sort();
  }, [shownEntries]);

  const visibleEntries = useMemo(
    () => (activeTag ? shownEntries.filter((e) => e.tags.includes(activeTag)) : shownEntries),
    [shownEntries, activeTag]
  );

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Pressable onPress={onBack} style={styles.backRow}>
          <Text style={styles.backText}>{t('entries.back')}</Text>
        </Pressable>

        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{book.name}</Text>
            <Text style={styles.syncStatus}>{syncStatusLabel(syncStatus, t)}</Text>
          </View>
          <View style={styles.newButtonRow}>
            <Pressable style={styles.newButton} onPress={() => onNewEntry('text')}>
              <Text style={styles.newButtonText}>{t('entries.newButton')}</Text>
            </Pressable>
            <Pressable style={[styles.newButton, styles.newButtonSecondary]} onPress={() => onNewEntry('image')}>
              <Text style={styles.newButtonText}>{t('entries.newImageButton')}</Text>
            </Pressable>
          </View>
        </View>

        {allTags.length > 0 && (
          <FlatList
            horizontal
            data={allTags}
            keyExtractor={(tag) => tag}
            style={styles.tagFilterList}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item: tag }) => (
              <Pressable
                style={[styles.tagChip, activeTag === tag && styles.tagChipActive]}
                onPress={() => setActiveTag(activeTag === tag ? null : tag)}
              >
                <Text style={[styles.tagChipText, activeTag === tag && styles.tagChipTextActive]}>{tag}</Text>
              </Pressable>
            )}
          />
        )}

        <Pressable onPress={() => setShowHidden((v) => !v)} style={styles.showHiddenToggle}>
          <Text style={styles.showHiddenText}>{t(showHidden ? 'entries.hideHidden' : 'entries.showHidden')}</Text>
        </Pressable>

        {!loading && visibleEntries.length === 0 && (
          <Text style={styles.empty}>
            {shownEntries.length === 0 ? t('entries.emptyNoEntries') : t('entries.emptyNoTagMatch')}
          </Text>
        )}

        <FlatList
          data={visibleEntries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable style={[styles.card, item.hidden && styles.cardHidden]} onPress={() => onOpenEntry(item.id)}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>{item.title || t('entries.untitled')}</Text>
                {item.images.length > 0 && <Text style={styles.photoBadge}>📷 {item.images.length}</Text>}
                {item.location && <Text style={styles.photoBadge}>📍</Text>}
                {item.hidden && <Text style={styles.hiddenBadge}>{t('entries.hiddenBadge')}</Text>}
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
  container: { flex: 1, backgroundColor: colors.background },
  // On wide/ultrawide desktop windows, a full-bleed edge-to-edge layout reads
  // poorly — cap the content width and center it like a normal web page.
  content: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  backRow: { marginBottom: 8 },
  backText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  syncStatus: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  newButtonRow: { flexDirection: 'row', gap: 8 },
  newButton: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  newButtonSecondary: { backgroundColor: colors.secondary },
  newButtonText: { color: colors.white, fontWeight: '700' },
  tagFilterList: { marginBottom: 12, flexGrow: 0 },
  tagChip: {
    backgroundColor: colors.chip,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: 8,
  },
  tagChipActive: { backgroundColor: colors.primary },
  tagChipText: { fontSize: 12, color: colors.textDim },
  tagChipTextActive: { color: colors.white, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  showHiddenToggle: { alignSelf: 'flex-start', marginBottom: 12 },
  showHiddenText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  card: { padding: 14, borderRadius: 16, backgroundColor: colors.card, marginBottom: 10 },
  cardHidden: { opacity: 0.6 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  photoBadge: { fontSize: 11, color: colors.textSecondary },
  hiddenBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cardDate: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  cardBody: { fontSize: 14, color: colors.text },
  cardTags: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  cardTag: { backgroundColor: colors.chipTag, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  cardTagText: { fontSize: 11, color: colors.textDim },
});
