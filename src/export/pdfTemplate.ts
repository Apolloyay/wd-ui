import { weatherCodeToIcon } from '../location/weather';
import { bodyToSafeHtml, escapeHtml } from '../richtext/bodyText';
import type { DiaryEntry, EntryComment, EntryImage, ImageOverlayDrawing, ImageOverlayText } from '../types/entry';
import type { ImageBlob } from '../types/image';

export interface ExportableEntry {
  id: string;
  entryType?: DiaryEntry['entryType'];
  title: string;
  body: string;
  bodyFormat: DiaryEntry['bodyFormat'];
  tags: string[];
  comments: EntryComment[];
  images?: EntryImage[];
  location?: DiaryEntry['location'];
  weather?: DiaryEntry['weather'];
  createdAt: string;
}

// Fixed pixel width for a rendered image-diary photo -- lets overlay text
// sizes/positions be computed once here instead of guessing a live layout
// width the way the on-screen editor does.
const PHOTO_CANVAS_WIDTH_PX = 480;

export interface ExportLabels {
  untitled: string;
  tagsLabel: string;
  commentsLabel: string;
}

/**
 * Shared styling for every exported PDF, single-entry or bulk. Kept spare on
 * purpose: this is a document meant to be read and archived, not a replica
 * of the app's UI chrome (no buttons, no status pills, no icons-as-text).
 */
export const PDF_CSS = `
  @page { size: A4; margin: 22mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Songti SC', 'Noto Serif SC', serif; color: #1a1a1a; margin: 0; }
  .entry { page-break-after: always; }
  .entry:last-child { page-break-after: auto; }
  .entry-title { font-size: 24px; font-weight: 700; margin: 0 0 4px; font-family: -apple-system, Helvetica, Arial, sans-serif; }
  .entry-date { font-size: 12px; color: #8a8a8a; margin-bottom: 4px; font-family: -apple-system, Helvetica, Arial, sans-serif; }
  .entry-location { font-size: 12px; color: #8a8a8a; margin-bottom: 18px; font-family: -apple-system, Helvetica, Arial, sans-serif; }
  .entry-tags { margin-bottom: 18px; }
  .tag { display: inline-block; font-size: 10px; color: #666; border: 1px solid #ccc; padding: 2px 8px; border-radius: 9px; margin-right: 6px; font-family: -apple-system, Helvetica, Arial, sans-serif; }
  .entry-body { font-size: 14.5px; line-height: 1.75; white-space: pre-wrap; }
  .entry-body p { margin: 0 0 0.9em; }
  .entry-body h2 { font-size: 18px; margin: 1em 0 0.5em; font-family: -apple-system, Helvetica, Arial, sans-serif; }
  .entry-body ul, .entry-body ol { margin: 0 0 0.9em; padding-left: 1.4em; }
  .entry-photos { margin: 18px 0; display: flex; flex-wrap: wrap; gap: 10px; }
  .entry-photo { max-width: 47%; max-height: 260px; border-radius: 4px; object-fit: cover; }
  .entry-photo-canvas-section { margin: 18px 0; }
  .entry-photo-canvas-wrap { position: relative; border-radius: 4px; overflow: hidden; }
  .entry-photo-canvas-img { display: block; object-fit: cover; }
  .entry-photo-canvas-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  .entry-photo-overlay-text { position: absolute; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,0.5); font-family: -apple-system, Helvetica, Arial, sans-serif; }
  .entry-comments-label { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #999; margin: 24px 0 10px; font-family: -apple-system, Helvetica, Arial, sans-serif; }
  .entry-comment { border-left: 2px solid #ddd; padding-left: 12px; margin-bottom: 12px; font-family: -apple-system, Helvetica, Arial, sans-serif; }
  .entry-comment-date { font-size: 10px; color: #999; margin-bottom: 2px; }
  .entry-comment-body { font-size: 12.5px; color: #333; }
`;

/** One entry's content -- reused as-is for a single export or as one page of a bulk export. */
export function buildEntrySection(entry: ExportableEntry, images: ImageBlob[], labels: ExportLabels, locale: string): string {
  const title = escapeHtml(entry.title.trim() || labels.untitled);
  const date = escapeHtml(new Date(entry.createdAt).toLocaleString(locale));
  const tagsHtml = entry.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  const bodyHtml = bodyToSafeHtml(entry);
  const locationHtml = entry.location
    ? `<div class="entry-location">📍 ${escapeHtml(entry.location.placeName)}${
        entry.weather ? `   ${weatherCodeToIcon(entry.weather.weatherCode)} ${Math.round(entry.weather.temperatureC)}°C` : ''
      }</div>`
    : '';

  const isImageEntry = entry.entryType === 'image';
  const primaryEntryImage = entry.images?.[0];
  const primaryBlob = primaryEntryImage ? images.find((b) => b.id === primaryEntryImage.id) : undefined;

  const photosSectionHtml = isImageEntry
    ? primaryBlob
      ? `<div class="entry-photo-canvas-section">${buildImageCanvasHtml(primaryBlob, primaryEntryImage!.overlays)}</div>`
      : ''
    : images.length
      ? `<div class="entry-photos">${images
          .map((img) => `<img class="entry-photo" src="data:${img.mimeType};base64,${img.dataBase64}" />`)
          .join('')}</div>`
      : '';

  const commentsHtml = entry.comments
    .map(
      (c) => `
        <div class="entry-comment">
          <div class="entry-comment-date">${escapeHtml(new Date(c.createdAt).toLocaleString(locale))}</div>
          <div class="entry-comment-body">${escapeHtml(c.body)}</div>
        </div>`
    )
    .join('');

  return `
    <section class="entry">
      <h1 class="entry-title">${title}</h1>
      <div class="entry-date"${entry.location ? '' : ' style="margin-bottom: 18px;"'}>${date}</div>
      ${locationHtml}
      ${entry.tags.length ? `<div class="entry-tags">${tagsHtml}</div>` : ''}
      ${photosSectionHtml}
      <div class="entry-body">${bodyHtml}</div>
      ${entry.comments.length ? `<div class="entry-comments-label">${escapeHtml(labels.commentsLabel)}</div>${commentsHtml}` : ''}
    </section>`;
}

/** Renders an image-diary entry's single photo plus its editable overlay layer (drawings + text). */
function buildImageCanvasHtml(blob: ImageBlob, overlays: (ImageOverlayDrawing | ImageOverlayText)[]): string {
  const height = PHOTO_CANVAS_WIDTH_PX * (blob.height / blob.width);
  const strokesHtml = overlays
    .filter((o): o is ImageOverlayDrawing => o.kind === 'drawing')
    .map(
      (stroke) =>
        `<polyline points="${stroke.points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${escapeHtml(
          stroke.color
        )}" stroke-width="${stroke.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`
    )
    .join('');
  const textsHtml = overlays
    .filter((o): o is ImageOverlayText => o.kind === 'text')
    .map(
      (ov) =>
        `<div class="entry-photo-overlay-text" style="left:${ov.x * 100}%; top:${ov.y * 100}%; color:${escapeHtml(
          ov.color
        )}; font-size:${ov.fontSize * PHOTO_CANVAS_WIDTH_PX}px;">${escapeHtml(ov.text)}</div>`
    )
    .join('');
  return `
    <div class="entry-photo-canvas-wrap" style="width:${PHOTO_CANVAS_WIDTH_PX}px; height:${height}px;">
      <img class="entry-photo-canvas-img" src="data:${blob.mimeType};base64,${blob.dataBase64}" style="width:${PHOTO_CANVAS_WIDTH_PX}px; height:${height}px;" />
      <svg class="entry-photo-canvas-svg" viewBox="0 0 1 1" preserveAspectRatio="none">${strokesHtml}</svg>
      ${textsHtml}
    </div>`;
}

/** A filesystem/URL-safe stand-in for a title, e.g. for a suggested download filename. */
export function slugifyForFilename(text: string, fallback: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

/** Wraps entry sections into a standalone HTML document (what native's WebView-based PDF engine needs). */
export function buildStandaloneHtml(sections: string[]): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${PDF_CSS}</style>
</head>
<body>${sections.join('\n')}</body>
</html>`;
}
