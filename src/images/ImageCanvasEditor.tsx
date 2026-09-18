import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { randomId } from '../crypto/randomId';
import type { ImageOverlay, ImageOverlayText } from '../types/entry';
import type { ImageBlob } from '../types/image';

interface Props {
  blob: ImageBlob | null;
  loadingBlob: boolean;
  overlays: ImageOverlay[];
  onChangeOverlays: (overlays: ImageOverlay[]) => void;
  onPickImage: () => void;
  onRotate: () => void;
  onApplyCrop: (rect: { originX: number; originY: number; width: number; height: number }) => void;
  busy: boolean;
}

type Mode = 'view' | 'draw' | 'crop';

const COLORS = ['#e63946', '#2d6cdf', '#2a9d8f', '#f4a261', '#1a1a1a'];
const MAX_DISPLAY_WIDTH = 560;

export default function ImageCanvasEditor({
  blob,
  loadingBlob,
  overlays,
  onChangeOverlays,
  onPickImage,
  onRotate,
  onApplyCrop,
  busy,
}: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('view');
  const [containerWidth, setContainerWidth] = useState(MAX_DISPLAY_WIDTH);
  const [drawColor, setDrawColor] = useState(COLORS[0]);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[] | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [cropRect, setCropRect] = useState({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
  const draggingCorner = useRef<'tl' | 'tr' | 'bl' | 'br' | null>(null);
  const draggingTextId = useRef<string | null>(null);

  const displayWidth = Math.min(containerWidth, MAX_DISPLAY_WIDTH);
  const displayHeight = blob ? displayWidth * (blob.height / blob.width) : displayWidth * 0.75;

  const handleLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

  const toNormalized = (evt: GestureResponderEvent) => ({
    x: clamp(evt.nativeEvent.locationX / displayWidth, 0, 1),
    y: clamp(evt.nativeEvent.locationY / displayHeight, 0, 1),
  });

  // --- Freehand drawing -----------------------------------------------
  const drawResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => mode === 'draw',
        onMoveShouldSetPanResponder: () => mode === 'draw',
        onPanResponderGrant: (evt) => setCurrentStroke([toNormalized(evt)]),
        onPanResponderMove: (evt) => setCurrentStroke((prev) => (prev ? [...prev, toNormalized(evt)] : prev)),
        onPanResponderRelease: () => {
          setCurrentStroke((prev) => {
            if (prev && prev.length > 1) {
              onChangeOverlays([
                ...overlays,
                { id: randomId(), kind: 'drawing', points: prev, color: drawColor, strokeWidth: 0.008 },
              ]);
            }
            return null;
          });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }),
    [mode, overlays, drawColor, displayWidth, displayHeight]
  );

  const handleUndoStroke = () => {
    const lastDrawingIndex = [...overlays].reverse().findIndex((o) => o.kind === 'drawing');
    if (lastDrawingIndex === -1) return;
    const index = overlays.length - 1 - lastDrawingIndex;
    onChangeOverlays(overlays.filter((_, i) => i !== index));
  };

  // --- Text overlays -----------------------------------------------
  const handleAddText = () => {
    const next: ImageOverlayText = { id: randomId(), kind: 'text', text: t('entry.imageTextDefault'), x: 0.5, y: 0.5, fontSize: 0.06, color: '#fff' };
    onChangeOverlays([...overlays, next]);
    setSelectedTextId(next.id);
  };

  const updateTextOverlay = (id: string, changes: Partial<ImageOverlayText>) => {
    onChangeOverlays(overlays.map((o) => (o.id === id && o.kind === 'text' ? { ...o, ...changes } : o)));
  };

  const handleDeleteSelectedText = () => {
    if (!selectedTextId) return;
    onChangeOverlays(overlays.filter((o) => o.id !== selectedTextId));
    setSelectedTextId(null);
  };

  const textResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => mode === 'view',
        onMoveShouldSetPanResponder: () => mode === 'view' && !!draggingTextId.current,
        onPanResponderMove: (evt) => {
          const id = draggingTextId.current;
          if (!id) return;
          updateTextOverlay(id, toNormalized(evt));
        },
        onPanResponderRelease: () => {
          draggingTextId.current = null;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }),
    [mode, overlays, displayWidth, displayHeight]
  );

  // --- Crop -----------------------------------------------
  const cropResponderFor = (corner: 'tl' | 'tr' | 'bl' | 'br') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        draggingCorner.current = corner;
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        setCropRect((prev) => moveCorner(prev, corner, gesture.dx / displayWidth, gesture.dy / displayHeight));
      },
      onPanResponderRelease: () => {
        draggingCorner.current = null;
      },
    });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const cropHandles = useMemo(
    () => ({ tl: cropResponderFor('tl'), tr: cropResponderFor('tr'), bl: cropResponderFor('bl'), br: cropResponderFor('br') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayWidth, displayHeight]
  );

  const handleEnterCrop = () => {
    setCropRect({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
    setMode('crop');
  };

  const handleApplyCrop = () => {
    if (!blob) return;
    onApplyCrop({
      originX: Math.round(cropRect.x * blob.width),
      originY: Math.round(cropRect.y * blob.height),
      width: Math.round(cropRect.width * blob.width),
      height: Math.round(cropRect.height * blob.height),
    });
    setMode('view');
  };

  if (!blob) {
    return (
      <View style={styles.emptyWrap}>
        {loadingBlob ? (
          <ActivityIndicator />
        ) : (
          <Pressable style={styles.pickButton} onPress={onPickImage} disabled={busy}>
            <Text style={styles.pickButtonText}>{t('entry.imagePickPrimary')}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const drawingOverlays = overlays.filter((o): o is Extract<ImageOverlay, { kind: 'drawing' }> => o.kind === 'drawing');
  const textOverlays = overlays.filter((o): o is ImageOverlayText => o.kind === 'text');

  return (
    <View onLayout={handleLayout}>
      <View style={[styles.canvasWrap, { width: displayWidth, height: displayHeight }]}>
        <Image
          source={{ uri: `data:${blob.mimeType};base64,${blob.dataBase64}` }}
          style={{ width: displayWidth, height: displayHeight, borderRadius: 8 }}
          resizeMode="contain"
        />

        {mode === 'draw' && (
          <View style={StyleSheet.absoluteFill} {...drawResponder.panHandlers} />
        )}

        <Svg width={displayWidth} height={displayHeight} style={StyleSheet.absoluteFill} pointerEvents="none">
          {drawingOverlays.map((stroke) => (
            <Polyline
              key={stroke.id}
              points={stroke.points.map((p) => `${p.x * displayWidth},${p.y * displayHeight}`).join(' ')}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.strokeWidth * displayWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {currentStroke && (
            <Polyline
              points={currentStroke.map((p) => `${p.x * displayWidth},${p.y * displayHeight}`).join(' ')}
              fill="none"
              stroke={drawColor}
              strokeWidth={0.008 * displayWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {mode === 'crop' && (
            <>
              <Rect
                x={cropRect.x * displayWidth}
                y={cropRect.y * displayHeight}
                width={cropRect.width * displayWidth}
                height={cropRect.height * displayHeight}
                fill="rgba(45,108,223,0.15)"
                stroke="#2d6cdf"
                strokeWidth={2}
              />
              {cornerPoints(cropRect).map(([key, cx, cy]) => (
                <Circle key={key} cx={cx * displayWidth} cy={cy * displayHeight} r={9} fill="#2d6cdf" stroke="#fff" strokeWidth={2} />
              ))}
            </>
          )}
        </Svg>

        {mode === 'crop' &&
          cornerPoints(cropRect).map(([key, cx, cy]) => (
            <View
              key={key}
              style={[styles.cropHandleHitbox, { left: cx * displayWidth - 18, top: cy * displayHeight - 18 }]}
              {...cropHandles[key].panHandlers}
            />
          ))}

        {mode !== 'crop' && (
          <View style={StyleSheet.absoluteFill} {...(mode === 'view' ? textResponder.panHandlers : {})} pointerEvents="box-none">
            {textOverlays.map((overlay) => (
              <Pressable
                key={overlay.id}
                onPressIn={() => {
                  if (mode === 'view') {
                    draggingTextId.current = overlay.id;
                    setSelectedTextId(overlay.id);
                  }
                }}
                style={[
                  styles.textOverlay,
                  {
                    left: overlay.x * displayWidth,
                    top: overlay.y * displayHeight,
                    borderColor: selectedTextId === overlay.id ? '#2d6cdf' : 'transparent',
                  },
                ]}
              >
                <Text style={{ color: overlay.color, fontSize: overlay.fontSize * displayWidth, fontWeight: '700' }}>
                  {overlay.text}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {selectedTextId && mode === 'view' && (
        <View style={styles.textEditPanel}>
          <TextInput
            style={styles.textEditInput}
            value={textOverlays.find((o) => o.id === selectedTextId)?.text ?? ''}
            onChangeText={(text) => updateTextOverlay(selectedTextId, { text })}
          />
          <View style={styles.colorRow}>
            {COLORS.concat('#ffffff').map((color) => (
              <Pressable
                key={color}
                style={[styles.colorSwatch, { backgroundColor: color }]}
                onPress={() => updateTextOverlay(selectedTextId, { color })}
              />
            ))}
          </View>
          <Pressable style={styles.smallDangerButton} onPress={handleDeleteSelectedText}>
            <Text style={styles.smallDangerButtonText}>{t('entry.imageOverlayDelete')}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.toolbar}>
        <ToolButton label={t('entry.imageReplace')} active={false} onPress={onPickImage} disabled={busy} />
        <ToolButton label={t('entry.imageRotate')} active={false} onPress={onRotate} disabled={busy} />
        {mode === 'crop' ? (
          <>
            <ToolButton label={t('entry.imageCropApply')} active onPress={handleApplyCrop} disabled={busy} />
            <ToolButton label={t('entry.imageCropCancel')} active={false} onPress={() => setMode('view')} disabled={busy} />
          </>
        ) : (
          <ToolButton label={t('entry.imageCrop')} active={false} onPress={handleEnterCrop} disabled={busy} />
        )}
        <ToolButton
          label={t('entry.imageDraw')}
          active={mode === 'draw'}
          onPress={() => setMode(mode === 'draw' ? 'view' : 'draw')}
          disabled={busy || mode === 'crop'}
        />
        <ToolButton label={t('entry.imageAddText')} active={false} onPress={handleAddText} disabled={busy || mode === 'crop'} />
        <ToolButton label={t('entry.imageUndoStroke')} active={false} onPress={handleUndoStroke} disabled={busy || mode === 'crop'} />
      </View>

      {mode === 'draw' && (
        <View style={styles.colorRow}>
          {COLORS.map((color) => (
            <Pressable
              key={color}
              style={[styles.colorSwatch, { backgroundColor: color }, drawColor === color && styles.colorSwatchActive]}
              onPress={() => setDrawColor(color)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ToolButton({ label, active, onPress, disabled }: { label: string; active: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.toolButton, active && styles.toolButtonActive]} onPress={onPress} disabled={disabled}>
      <Text style={[styles.toolButtonText, active && styles.toolButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cornerPoints(rect: { x: number; y: number; width: number; height: number }): ['tl' | 'tr' | 'bl' | 'br', number, number][] {
  return [
    ['tl', rect.x, rect.y],
    ['tr', rect.x + rect.width, rect.y],
    ['bl', rect.x, rect.y + rect.height],
    ['br', rect.x + rect.width, rect.y + rect.height],
  ];
}

function moveCorner(
  rect: { x: number; y: number; width: number; height: number },
  corner: 'tl' | 'tr' | 'bl' | 'br',
  dx: number,
  dy: number
): { x: number; y: number; width: number; height: number } {
  const MIN = 0.1;
  let { x, y, width, height } = rect;
  if (corner === 'tl') {
    x = clamp(rect.x + dx, 0, rect.x + rect.width - MIN);
    y = clamp(rect.y + dy, 0, rect.y + rect.height - MIN);
    width = rect.x + rect.width - x;
    height = rect.y + rect.height - y;
  } else if (corner === 'tr') {
    y = clamp(rect.y + dy, 0, rect.y + rect.height - MIN);
    width = clamp(rect.width + dx, MIN, 1 - rect.x);
    height = rect.y + rect.height - y;
  } else if (corner === 'bl') {
    x = clamp(rect.x + dx, 0, rect.x + rect.width - MIN);
    width = rect.x + rect.width - x;
    height = clamp(rect.height + dy, MIN, 1 - rect.y);
  } else {
    width = clamp(rect.width + dx, MIN, 1 - rect.x);
    height = clamp(rect.height + dy, MIN, 1 - rect.y);
  }
  return { x, y, width, height };
}

const styles = StyleSheet.create({
  emptyWrap: { height: 220, borderRadius: 8, backgroundColor: '#eef1f6', alignItems: 'center', justifyContent: 'center' },
  pickButton: { backgroundColor: '#2d6cdf', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  pickButtonText: { color: '#fff', fontWeight: '600' },
  canvasWrap: { position: 'relative', backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' },
  cropHandleHitbox: { position: 'absolute', width: 36, height: 36 },
  textOverlay: { position: 'absolute', padding: 4, borderWidth: 2, borderRadius: 4 },
  textEditPanel: { marginTop: 10, gap: 8 },
  textEditInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14 },
  colorRow: { flexDirection: 'row', gap: 8 },
  colorSwatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#ccc' },
  colorSwatchActive: { borderWidth: 2, borderColor: '#2d6cdf' },
  smallDangerButton: { alignSelf: 'flex-start' },
  smallDangerButtonText: { color: '#c0392b', fontSize: 12, fontWeight: '600' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  toolButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#eef1f6' },
  toolButtonActive: { backgroundColor: '#2d6cdf' },
  toolButtonText: { fontSize: 12, color: '#444', fontWeight: '600' },
  toolButtonTextActive: { color: '#fff' },
});
