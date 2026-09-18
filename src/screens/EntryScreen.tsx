import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { EncryptionKey } from '../crypto/crypto';
import { randomId } from '../crypto/randomId';
import { createEntry, getEntry, updateEntry } from '../db/entriesRepository';
import { createImageBlob, deleteImageBlob, getImageBlob } from '../db/imageBlobRepository';
import { createSavedPlace, deleteSavedPlace, listSavedPlaces } from '../db/savedPlacesRepository';
import { exportEntriesToPdf } from '../export/exportPdf';
import { slugifyForFilename } from '../export/pdfTemplate';
import ImageCanvasEditor from '../images/ImageCanvasEditor';
import { cropImage, pickAndProcessImage, rotateImage } from '../images/pickImage';
import { getCurrentCoordinates } from '../location/geolocation';
import { reverseGeocode } from '../location/reverseGeocode';
import { fetchWeather, weatherCodeToIcon } from '../location/weather';
import RichTextEditor from '../richtext/RichTextEditor';
import { bodyToPlainText, plainTextToEditableHtml } from '../richtext/bodyText';
import Button from '../theme/Button';
import { colors } from '../theme/colors';
import type { DiaryEntry, EntryComment, EntryImage, ImageOverlay } from '../types/entry';
import type { ImageBlob } from '../types/image';
import type { SavedPlace } from '../types/place';

interface Props {
  encryptionKey: EncryptionKey;
  bookId: string; // book this entry belongs to (fixed at creation)
  entryId: string | null; // null = creating a new entry
  newEntryType?: DiaryEntry['entryType']; // only consulted when entryId is null
  onDone: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

const AUTOSAVE_DELAY_MS = 800;

export default function EntryScreen({ encryptionKey, bookId, entryId, newEntryType, onDone }: Props) {
  const { t, i18n } = useTranslation();
  const [entryType, setEntryType] = useState<DiaryEntry['entryType']>(newEntryType ?? 'text');
  const [imageEditorBusy, setImageEditorBusy] = useState(false);
  const [imageEditorWarning, setImageEditorWarning] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [bodyFormat, setBodyFormat] = useState<DiaryEntry['bodyFormat']>('html');
  const [editorHtml, setEditorHtml] = useState(''); // what the rich text editor loads on mount
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [comments, setComments] = useState<EntryComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [images, setImages] = useState<EntryImage[]>([]);
  const [imageBlobs, setImageBlobs] = useState<Record<string, ImageBlob | null>>({});
  const [imageError, setImageError] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<ImageBlob | null>(null);
  const [location, setLocation] = useState<DiaryEntry['location']>(undefined);
  const [weather, setWeather] = useState<DiaryEntry['weather']>(undefined);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [savingPlaceLabel, setSavingPlaceLabel] = useState<string | null>(null); // non-null while the "save as..." input is open
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(!!entryId);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Mutable fields so the debounce timer and the save chain always act on
  // the latest keystrokes, not a stale value captured when they were set up.
  const latest = useRef({ title, body, bodyFormat, tags, comments, images, location, weather, hidden, entryType });
  // Only auto-captures location once per screen instance, for a brand-new
  // entry -- never re-prompts, and never touches GPS when editing an
  // existing entry just because it happens to have no location yet.
  const autoLocationAttempted = useRef(false);
  // Which image ids we've already kicked off a fetch for -- lets the lazy-load
  // effect below run once per image instead of re-fetching on every render.
  const fetchedImageIds = useRef(new Set<string>());
  // The id of the row on disk, if one exists yet -- a brand-new entry gets
  // one assigned by its first autosave, then every save after that updates
  // it in place instead of inserting a new row.
  const savedEntryId = useRef<string | null>(entryId);
  // Needed for the PDF's date line -- captured on load, or from createEntry's
  // result the first time autosave actually creates the row.
  const entryCreatedAt = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every scheduled save is chained onto this so they run one at a time, in
  // order -- a debounce firing while the previous save is still in flight
  // (e.g. a slow device) waits its turn instead of racing it.
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!entryId) return;
    (async () => {
      const existing = await getEntry(entryId, encryptionKey);
      if (existing) {
        setEntryType(existing.entryType);
        setTitle(existing.title);
        setBody(existing.body);
        setBodyFormat(existing.bodyFormat);
        // Legacy plain-text bodies need converting just so the rich editor has
        // valid HTML to load -- the stored bodyFormat stays 'plain' until the
        // user actually edits it (see handleBodyChange).
        setEditorHtml(existing.bodyFormat === 'html' ? existing.body : plainTextToEditableHtml(existing.body));
        setTags(existing.tags);
        setComments(existing.comments);
        setImages(existing.images);
        setLocation(existing.location);
        setWeather(existing.weather);
        setHidden(existing.hidden);
        entryCreatedAt.current = existing.createdAt;
        latest.current = {
          title: existing.title,
          body: existing.body,
          bodyFormat: existing.bodyFormat,
          tags: existing.tags,
          comments: existing.comments,
          images: existing.images,
          location: existing.location,
          weather: existing.weather,
          hidden: existing.hidden,
          entryType: existing.entryType,
        };
        setSaveStatus('saved');
      }
      setLoading(false);
    })();
  }, [entryId, encryptionKey]);

  useEffect(() => {
    listSavedPlaces(encryptionKey).then((places) => {
      if (mounted.current) setSavedPlaces(places);
    });
  }, [encryptionKey]);

  // Auto-captures "where was I when I started writing this" for a brand-new
  // entry -- see handleUseCurrentLocation below; fails silently (no error
  // banner) if permission is denied, since this is just a nice-to-have.
  useEffect(() => {
    if (entryId || autoLocationAttempted.current) return;
    autoLocationAttempted.current = true;
    captureCurrentLocation({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetches each referenced image's bytes on demand -- never touches images
  // belonging to any other entry, see imageBlobRepository's module comment.
  useEffect(() => {
    for (const img of images) {
      if (fetchedImageIds.current.has(img.id)) continue;
      fetchedImageIds.current.add(img.id);
      getImageBlob(img.id, encryptionKey).then((blob) => {
        if (mounted.current) setImageBlobs((prev) => ({ ...prev, [img.id]: blob }));
      });
    }
  }, [images, encryptionKey]);

  const scheduleSave = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      queueSave();
    }, AUTOSAVE_DELAY_MS);
  };

  const queueSave = () => {
    saveChain.current = saveChain.current.then(doSave);
  };

  const doSave = async () => {
    const data = latest.current;
    if (
      !data.title.trim() &&
      !bodyToPlainText(data).trim() &&
      data.tags.length === 0 &&
      data.comments.length === 0 &&
      data.images.length === 0 &&
      !data.location &&
      !data.hidden
    ) {
      return; // nothing worth saving yet
    }
    if (mounted.current) setSaveStatus('saving');
    if (savedEntryId.current) {
      await updateEntry(savedEntryId.current, data, encryptionKey);
    } else {
      const created = await createEntry({ bookId, ...data }, encryptionKey);
      savedEntryId.current = created.id;
      entryCreatedAt.current = created.createdAt;
    }
    if (mounted.current) setSaveStatus('saved');
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    latest.current = { ...latest.current, title: value };
    scheduleSave();
  };

  const handleBodyChange = (html: string) => {
    setBody(html);
    setBodyFormat('html');
    latest.current = { ...latest.current, body: html, bodyFormat: 'html' };
    scheduleSave();
  };

  const commitTags = (nextTags: string[]) => {
    setTags(nextTags);
    latest.current = { ...latest.current, tags: nextTags };
    scheduleSave();
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      commitTags([...tags, tag]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    commitTags(tags.filter((existing) => existing !== tag));
  };

  const commitComments = (nextComments: EntryComment[]) => {
    setComments(nextComments);
    latest.current = { ...latest.current, comments: nextComments };
    scheduleSave();
  };

  const handleAddComment = () => {
    const text = commentInput.trim();
    if (text) {
      commitComments([...comments, { id: randomId(), body: text, createdAt: new Date().toISOString() }]);
    }
    setCommentInput('');
  };

  const handleRemoveComment = (commentId: string) => {
    commitComments(comments.filter((c) => c.id !== commentId));
  };

  const commitImages = (nextImages: EntryImage[]) => {
    setImages(nextImages);
    latest.current = { ...latest.current, images: nextImages };
    scheduleSave();
  };

  const handleAddImage = async () => {
    setImageError(null);
    try {
      const picked = await pickAndProcessImage();
      if (!picked) return; // canceled or permission denied
      const blob = await createImageBlob(picked, encryptionKey);
      fetchedImageIds.current.add(blob.id);
      setImageBlobs((prev) => ({ ...prev, [blob.id]: blob })); // already have it, skip the round-trip fetch
      commitImages([...images, { id: blob.id, mimeType: blob.mimeType, createdAt: blob.createdAt, overlays: [] }]);
    } catch {
      setImageError(t('entry.imageAddError'));
    }
  };

  const handleRemoveImage = (imageId: string) => {
    commitImages(images.filter((img) => img.id !== imageId));
    deleteImageBlob(imageId); // fire and forget -- it's now unreferenced
  };

  // --- Image-diary primary photo (entryType === 'image') -----------------
  // Image entries carry exactly one edited photo (images[0]); everything
  // below replaces it in place rather than growing a gallery.
  const primaryImage = images[0] as EntryImage | undefined;
  const primaryImageBlob = primaryImage ? (imageBlobs[primaryImage.id] ?? null) : null;

  const replacePrimaryImage = async (picked: { mimeType: string; dataBase64: string; width: number; height: number }, overlays: ImageOverlay[]) => {
    const blob = await createImageBlob(picked, encryptionKey);
    fetchedImageIds.current.add(blob.id);
    setImageBlobs((prev) => ({ ...prev, [blob.id]: blob }));
    const oldId = primaryImage?.id;
    commitImages([{ id: blob.id, mimeType: blob.mimeType, createdAt: blob.createdAt, overlays }]);
    if (oldId) deleteImageBlob(oldId); // fire and forget -- superseded
  };

  const handlePickPrimaryImage = async () => {
    setImageError(null);
    setImageEditorBusy(true);
    try {
      const picked = await pickAndProcessImage();
      if (picked) await replacePrimaryImage(picked, []);
    } catch {
      setImageError(t('entry.imageAddError'));
    } finally {
      setImageEditorBusy(false);
    }
  };

  const handleRotatePrimaryImage = async () => {
    if (!primaryImageBlob) return;
    setImageError(null);
    setImageEditorBusy(true);
    try {
      const rotated = await rotateImage(primaryImageBlob.dataBase64, primaryImageBlob.mimeType, 90);
      await replacePrimaryImage(rotated, []);
      setImageEditorWarning(t('entry.imageEditClearedOverlays'));
    } catch {
      setImageError(t('entry.imageAddError'));
    } finally {
      setImageEditorBusy(false);
    }
  };

  const handleApplyCropPrimaryImage = async (rect: { originX: number; originY: number; width: number; height: number }) => {
    if (!primaryImageBlob) return;
    setImageError(null);
    setImageEditorBusy(true);
    try {
      const cropped = await cropImage(primaryImageBlob.dataBase64, primaryImageBlob.mimeType, rect);
      await replacePrimaryImage(cropped, []);
      setImageEditorWarning(t('entry.imageEditClearedOverlays'));
    } catch {
      setImageError(t('entry.imageAddError'));
    } finally {
      setImageEditorBusy(false);
    }
  };

  const handleChangePrimaryImageOverlays = (overlays: ImageOverlay[]) => {
    if (!primaryImage) return;
    commitImages([{ ...primaryImage, overlays }]);
  };

  // --- Location & weather --------------------------------------------
  // Weather is always fetched for the entry's OWN date (its createdAt, or
  // today if the row doesn't exist yet) -- current conditions if that's
  // today, otherwise Open-Meteo's historical archive. Re-fetched only when
  // the location itself changes, never on every keystroke.
  const applyLocation = async (next: DiaryEntry['location']) => {
    const forDate = entryCreatedAt.current ? entryCreatedAt.current.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const weatherResult = next ? await fetchWeather({ latitude: next.latitude, longitude: next.longitude }, forDate) : null;
    setLocation(next);
    setWeather(weatherResult ?? undefined);
    latest.current = { ...latest.current, location: next, weather: weatherResult ?? undefined };
    scheduleSave();
  };

  const captureCurrentLocation = async ({ silent }: { silent: boolean }) => {
    if (!silent) setLocationError(null);
    setLocationBusy(true);
    try {
      const coords = await getCurrentCoordinates();
      if (!coords) {
        if (!silent) setLocationError(t('entry.locationPermissionError'));
        return;
      }
      const placeName = (await reverseGeocode(coords, i18n.language.split('-')[0])) ?? t('entry.locationUnknownPlace');
      await applyLocation({ latitude: coords.latitude, longitude: coords.longitude, placeName });
    } catch {
      if (!silent) setLocationError(t('entry.locationError'));
    } finally {
      setLocationBusy(false);
    }
  };

  const handleUseCurrentLocation = () => captureCurrentLocation({ silent: false });

  const handleChooseSavedPlace = async (place: SavedPlace) => {
    setLocationError(null);
    setLocationBusy(true);
    try {
      // placeName is the actual saved address, not the nickname -- "Home" is
      // just how you find it in the chip list, the entry records where it is.
      await applyLocation({ latitude: place.latitude, longitude: place.longitude, placeName: place.address || place.label });
    } catch {
      setLocationError(t('entry.locationError'));
    } finally {
      setLocationBusy(false);
    }
  };

  const handleRemoveLocation = () => {
    applyLocation(undefined);
  };

  const handleSaveCurrentAsPlace = async () => {
    const label = savingPlaceLabel?.trim();
    if (!label || !location) return;
    const place = await createSavedPlace(
      { label, address: location.placeName, latitude: location.latitude, longitude: location.longitude },
      encryptionKey
    );
    setSavedPlaces((prev) => [...prev, place]);
    setSavingPlaceLabel(null);
  };

  const handleDeleteSavedPlace = async (id: string) => {
    await deleteSavedPlace(id);
    setSavedPlaces((prev) => prev.filter((p) => p.id !== id));
  };

  const handleToggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    latest.current = { ...latest.current, hidden: next };
    scheduleSave();
  };

  const handleExportPdf = async () => {
    setExportError(null);
    // Flush any edit still sitting in the debounce so the PDF reflects what's
    // actually on screen, not a slightly-stale saved version.
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      queueSave();
    }
    await saveChain.current;
    if (!entryCreatedAt.current) {
      setExportError(t('entry.exportNothingToExport'));
      return;
    }
    setExporting(true);
    try {
      const resolvedImages: ImageBlob[] = [];
      for (const img of images) {
        const blob = imageBlobs[img.id] ?? (await getImageBlob(img.id, encryptionKey));
        if (blob) resolvedImages.push(blob);
      }
      const id = savedEntryId.current!;
      await exportEntriesToPdf(
        [{ id, entryType, title, body, bodyFormat, tags, comments, images, location, weather, createdAt: entryCreatedAt.current }],
        { [id]: resolvedImages },
        { untitled: t('entries.untitled'), tagsLabel: t('entry.tagsLabel'), commentsLabel: t('entry.commentsLabel') },
        i18n.language,
        `${slugifyForFilename(title, t('entries.untitled'))}.pdf`
      );
    } catch {
      if (mounted.current) setExportError(t('entry.exportError'));
    } finally {
      if (mounted.current) setExporting(false);
    }
  };

  const handleDone = async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      queueSave(); // flush whatever was still debouncing instead of dropping it
    }
    await saveChain.current;
    onDone();
  };

  if (loading) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Button title={t('entry.done')} onPress={handleDone} />
          <Text style={styles.headerTitle}>{entryId ? t('entry.editEntryTitle') : t('entry.newEntryTitle')}</Text>
          <Text style={styles.saveStatus}>{saveStatusLabel(saveStatus, t)}</Text>
        </View>
        <TextInput
          style={styles.titleInput}
          placeholder={t('entry.titlePlaceholder')}
          value={title}
          onChangeText={handleTitleChange}
        />
        {entryType === 'image' ? (
          <>
            {imageError && <Text style={styles.imageError}>{imageError}</Text>}
            {imageEditorWarning && <Text style={styles.imageWarning}>{imageEditorWarning}</Text>}
            <ImageCanvasEditor
              blob={primaryImageBlob}
              loadingBlob={!!primaryImage && imageBlobs[primaryImage.id] === undefined}
              overlays={primaryImage?.overlays ?? []}
              onChangeOverlays={handleChangePrimaryImageOverlays}
              onPickImage={handlePickPrimaryImage}
              onRotate={handleRotatePrimaryImage}
              onApplyCrop={handleApplyCropPrimaryImage}
              busy={imageEditorBusy}
            />
            <Text style={styles.tagsLabel}>{t('entry.imageCaptionLabel')}</Text>
            <RichTextEditor
              initialHtml={editorHtml}
              onChangeHtml={handleBodyChange}
              placeholder={t('entry.imageCaptionPlaceholder')}
            />
          </>
        ) : (
          <RichTextEditor
            initialHtml={editorHtml}
            onChangeHtml={handleBodyChange}
            placeholder={t('entry.bodyPlaceholder')}
          />
        )}

        <Text style={styles.tagsLabel}>{t('entry.tagsLabel')}</Text>
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <Pressable key={tag} style={styles.tagChip} onPress={() => handleRemoveTag(tag)}>
              <Text style={styles.tagChipText}>{tag} ×</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.tagInput}
          placeholder={t('entry.tagPlaceholder')}
          value={tagInput}
          onChangeText={setTagInput}
          onSubmitEditing={handleAddTag}
          onBlur={handleAddTag}
        />

        {entryType === 'text' && (
        <>
        <Text style={styles.tagsLabel}>{t('entry.imagesLabel')}</Text>
        {imageError && <Text style={styles.imageError}>{imageError}</Text>}
        <View style={styles.imageRow}>
          {images.map((img) => {
            const blob = imageBlobs[img.id];
            return (
              <View key={img.id} style={styles.imageThumbWrap}>
                {blob ? (
                  <Pressable onPress={() => setViewingImage(blob)}>
                    <Image
                      source={{ uri: `data:${blob.mimeType};base64,${blob.dataBase64}` }}
                      style={styles.imageThumb}
                    />
                  </Pressable>
                ) : blob === null ? (
                  <View style={[styles.imageThumb, styles.imageUnavailable]}>
                    <Text style={styles.imageUnavailableText}>{t('entry.imageUnavailable')}</Text>
                  </View>
                ) : (
                  <View style={[styles.imageThumb, styles.imageUnavailable]}>
                    <ActivityIndicator size="small" />
                  </View>
                )}
                <Pressable style={styles.imageRemoveButton} onPress={() => handleRemoveImage(img.id)}>
                  <Text style={styles.imageRemoveButtonText}>×</Text>
                </Pressable>
              </View>
            );
          })}
          <Pressable
            style={styles.imageAddButton}
            onPress={handleAddImage}
            accessibilityLabel={t('entry.imageAdd')}
          >
            <Text style={styles.imageAddButtonText}>+</Text>
          </Pressable>
        </View>
        </>
        )}

        <Modal
          visible={!!viewingImage}
          transparent
          animationType="fade"
          onRequestClose={() => setViewingImage(null)}
        >
          <Pressable style={styles.imageViewerBackdrop} onPress={() => setViewingImage(null)}>
            {viewingImage && (
              <Image
                source={{ uri: `data:${viewingImage.mimeType};base64,${viewingImage.dataBase64}` }}
                style={styles.imageViewerFull}
                resizeMode="contain"
              />
            )}
            <Pressable style={styles.imageViewerCloseButton} onPress={() => setViewingImage(null)}>
              <Text style={styles.imageViewerCloseButtonText}>×</Text>
            </Pressable>
          </Pressable>
        </Modal>

        <Text style={styles.tagsLabel}>{t('entry.commentsLabel')}</Text>
        {comments.map((comment) => (
          <View key={comment.id} style={styles.commentCard}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentDate}>{new Date(comment.createdAt).toLocaleString(i18n.language)}</Text>
              <Pressable onPress={() => handleRemoveComment(comment.id)}>
                <Text style={styles.commentRemove}>{t('entry.commentRemove')}</Text>
              </Pressable>
            </View>
            <Text style={styles.commentBody}>{comment.body}</Text>
          </View>
        ))}
        <TextInput
          style={styles.tagInput}
          placeholder={t('entry.commentPlaceholder')}
          value={commentInput}
          onChangeText={setCommentInput}
          onSubmitEditing={handleAddComment}
          onBlur={handleAddComment}
          multiline
        />

        <Text style={styles.tagsLabel}>{t('entry.locationLabel')}</Text>
        {locationError && <Text style={styles.imageError}>{locationError}</Text>}
        {location ? (
          <>
            <Text style={styles.locationText}>
              📍 {location.placeName}
              {weather ? `   ${weatherCodeToIcon(weather.weatherCode)} ${Math.round(weather.temperatureC)}°C` : ''}
            </Text>
            <Text style={styles.locationAttributionText}>{t('entry.locationAttribution')}</Text>
          </>
        ) : (
          <Text style={styles.locationEmptyText}>{t('entry.locationEmpty')}</Text>
        )}
        <View style={styles.locationButtonRow}>
          <Pressable style={styles.smallButton} onPress={handleUseCurrentLocation} disabled={locationBusy}>
            {locationBusy ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.smallButtonText}>{t('entry.locationUseCurrent')}</Text>
            )}
          </Pressable>
          {location && (
            <Pressable
              style={styles.smallButton}
              onPress={() => setSavingPlaceLabel(savingPlaceLabel === null ? '' : null)}
            >
              <Text style={styles.smallButtonText}>{t('entry.locationSaveAs')}</Text>
            </Pressable>
          )}
          {location && (
            <Pressable style={styles.smallButton} onPress={handleRemoveLocation}>
              <Text style={styles.smallButtonTextDanger}>{t('entry.locationRemove')}</Text>
            </Pressable>
          )}
        </View>

        {savingPlaceLabel !== null && (
          <View style={styles.saveAsRow}>
            <TextInput
              style={[styles.tagInput, styles.saveAsInput]}
              placeholder={t('entry.locationSaveAsPlaceholder')}
              value={savingPlaceLabel}
              onChangeText={setSavingPlaceLabel}
              onSubmitEditing={handleSaveCurrentAsPlace}
              autoFocus
            />
            <Pressable style={styles.smallButton} onPress={handleSaveCurrentAsPlace}>
              <Text style={styles.smallButtonText}>{t('entry.locationSaveAsConfirm')}</Text>
            </Pressable>
          </View>
        )}

        {savedPlaces.length > 0 && (
          <View style={styles.savedPlaceList}>
            {savedPlaces.map((place) => (
              <View key={place.id} style={styles.savedPlaceChipWrap}>
                <Pressable style={styles.savedPlaceMain} onPress={() => handleChooseSavedPlace(place)}>
                  <Text style={styles.tagChipText}>{place.label}</Text>
                  {!!place.address && (
                    <Text style={styles.savedPlaceAddressText} numberOfLines={1}>
                      {place.address}
                    </Text>
                  )}
                </Pressable>
                <Pressable onPress={() => handleDeleteSavedPlace(place.id)}>
                  <Text style={styles.savedPlaceDeleteText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.tagsLabel}>{t('entry.privacyLabel')}</Text>
        <Pressable style={[styles.privacyButton, hidden && styles.privacyButtonActive]} onPress={handleToggleHidden}>
          <Text style={[styles.privacyButtonText, hidden && styles.privacyButtonTextActive]}>
            {t(hidden ? 'entry.unhideEntry' : 'entry.hideEntry')}
          </Text>
        </Pressable>
        <Text style={styles.privacyDescription}>{t('entry.hideEntryDescription')}</Text>

        <Text style={styles.tagsLabel}>{t('entry.exportLabel')}</Text>
        {exportError && <Text style={styles.imageError}>{exportError}</Text>}
        <Pressable style={styles.privacyButton} onPress={handleExportPdf} disabled={exporting}>
          {exporting ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.privacyButtonText}>{t('entry.exportButton')}</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function saveStatusLabel(status: SaveStatus, t: (key: string) => string): string {
  switch (status) {
    case 'saving':
      return t('entry.saving');
    case 'saved':
      return t('entry.saved');
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.background },
  // Matches HomeScreen's content cap so wide/ultrawide windows don't stretch
  // a single text column edge-to-edge.
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  saveStatus: { fontSize: 12, color: colors.textMuted, minWidth: 60, textAlign: 'right' },
  titleInput: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: 8,
    color: colors.text,
  },
  tagsLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 20, marginBottom: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tagChip: { backgroundColor: colors.chip, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  tagChipText: { fontSize: 12, color: colors.textDim },
  tagInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: colors.white,
    color: colors.text,
  },
  imageError: { color: colors.danger, fontSize: 13, marginBottom: 8 },
  imageWarning: { color: colors.warning, fontSize: 12, marginBottom: 8 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  imageThumbWrap: { position: 'relative' },
  imageThumb: { width: 84, height: 84, borderRadius: 14, backgroundColor: colors.chip },
  imageUnavailable: { alignItems: 'center', justifyContent: 'center' },
  imageUnavailableText: { fontSize: 10, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 4 },
  imageRemoveButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageRemoveButtonText: { color: colors.white, fontSize: 13, lineHeight: 14 },
  imageAddButton: {
    width: 84,
    height: 84,
    borderRadius: 14,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageAddButtonText: { fontSize: 24, color: colors.primary },
  imageViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerFull: { width: '92%', height: '85%' },
  imageViewerCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerCloseButtonText: { color: colors.white, fontSize: 20, lineHeight: 22 },
  commentCard: { backgroundColor: colors.card, borderRadius: 14, padding: 10, marginBottom: 8 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  commentDate: { fontSize: 11, color: colors.textMuted },
  commentRemove: { fontSize: 11, color: colors.danger },
  commentBody: { fontSize: 14, color: colors.text },
  privacyButton: {
    backgroundColor: colors.chip,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  privacyButtonActive: { backgroundColor: colors.dangerBg },
  privacyButtonText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  privacyButtonTextActive: { color: colors.danger },
  privacyDescription: { fontSize: 12, color: colors.textMuted, marginTop: 6, maxWidth: 480 },
  locationText: { fontSize: 14, color: colors.text },
  locationAttributionText: { fontSize: 10, color: colors.textFaint, marginTop: 2, marginBottom: 8 },
  locationEmptyText: { fontSize: 13, color: colors.textMuted, marginBottom: 10 },
  locationButtonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  smallButton: { backgroundColor: colors.chip, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  smallButtonText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  smallButtonTextDanger: { fontSize: 13, fontWeight: '600', color: colors.danger },
  saveAsRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  saveAsInput: { flex: 1 },
  savedPlaceList: { gap: 8, marginBottom: 8 },
  savedPlaceChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.chip,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: 14,
  },
  savedPlaceMain: { flex: 1 },
  savedPlaceAddressText: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  savedPlaceDeleteText: { fontSize: 15, color: colors.danger, fontWeight: '600' },
});
