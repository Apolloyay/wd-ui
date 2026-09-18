import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Bounds every attachment's size regardless of what the camera produced --
// this (not encryption or sync) is what actually keeps things fast: a
// full-resolution phone photo can be several MB, which would bloat local
// storage, sync payloads, and this data-URI's own decode/render cost.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.7;

export interface PickedImage {
  mimeType: string;
  dataBase64: string;
  width: number;
  height: number;
}

/** Returns null if the user canceled the picker or denied permission. */
export async function pickAndProcessImage(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  const needsResize = Math.max(asset.width, asset.height) > MAX_DIMENSION;
  const resizeAction = needsResize
    ? [{ resize: asset.width >= asset.height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION } }]
    : [];

  // Always re-encode (even a no-op resize) so quality/format compression is
  // applied consistently regardless of what the source photo looked like.
  const manipulated = await manipulateAsync(asset.uri, resizeAction, {
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!manipulated.base64) {
    throw new Error('Could not read the selected image.');
  }
  return { mimeType: 'image/jpeg', dataBase64: manipulated.base64, width: manipulated.width, height: manipulated.height };
}

/** Rotates an already-stored image by a multiple of 90 degrees (clockwise). */
export async function rotateImage(dataBase64: string, mimeType: string, degrees: number): Promise<PickedImage> {
  const manipulated = await manipulateAsync(
    `data:${mimeType};base64,${dataBase64}`,
    [{ rotate: degrees }],
    { compress: JPEG_QUALITY, format: SaveFormat.JPEG, base64: true }
  );
  if (!manipulated.base64) throw new Error('Could not rotate the image.');
  return { mimeType: 'image/jpeg', dataBase64: manipulated.base64, width: manipulated.width, height: manipulated.height };
}

/** Crops an already-stored image to a pixel rectangle (origin/size in the image's own pixel space). */
export async function cropImage(
  dataBase64: string,
  mimeType: string,
  rect: { originX: number; originY: number; width: number; height: number }
): Promise<PickedImage> {
  const manipulated = await manipulateAsync(
    `data:${mimeType};base64,${dataBase64}`,
    [{ crop: rect }],
    { compress: JPEG_QUALITY, format: SaveFormat.JPEG, base64: true }
  );
  if (!manipulated.base64) throw new Error('Could not crop the image.');
  return { mimeType: 'image/jpeg', dataBase64: manipulated.base64, width: manipulated.width, height: manipulated.height };
}
