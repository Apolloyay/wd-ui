import * as Print from 'expo-print';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { buildEntrySection, buildStandaloneHtml, type ExportableEntry, type ExportLabels } from './pdfTemplate';
import type { ImageBlob } from '../types/image';

// A4 (210mm x 297mm) expressed in expo-print's unit, pixels at 72 PPI.
const A4_WIDTH_PT = 595;
const A4_HEIGHT_PT = 842;

/**
 * Native (iOS): expo-print's printToFileAsync already writes a PDF straight
 * to disk with no system dialog involved -- the "just a print screen" issue
 * the polished-export ask was about is web-only (see exportPdf.web.ts).
 * This only renames the result to something meaningful before handing it to
 * the share sheet; if that fails for any reason, sharing still proceeds
 * under expo-print's own cache filename rather than losing the export.
 */
export async function exportEntriesToPdf(
  entries: ExportableEntry[],
  imagesByEntryId: Record<string, ImageBlob[]>,
  labels: ExportLabels,
  locale: string,
  filename: string
): Promise<void> {
  const sections = entries.map((entry) => buildEntrySection(entry, imagesByEntryId[entry.id] ?? [], labels, locale));
  const html = buildStandaloneHtml(sections);
  const { uri } = await Print.printToFileAsync({ html, width: A4_WIDTH_PT, height: A4_HEIGHT_PT });

  const shareUri = renameForSharing(uri, filename) ?? uri;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}

function renameForSharing(sourceUri: string, filename: string): string | null {
  try {
    const renamed = new File(new Directory(Paths.cache), filename);
    if (renamed.exists) renamed.delete();
    new File(sourceUri).copy(renamed);
    return renamed.uri;
  } catch {
    return null;
  }
}
