import type { DiaryEntry } from '../types/entry';

type BodySource = Pick<DiaryEntry, 'body' | 'bodyFormat'>;

/**
 * A plain-text version of the body -- used for list/search-result previews
 * and for keyword matching, so a bold word still matches a search and a
 * card snippet doesn't show raw tags.
 */
export function bodyToPlainText(entry: BodySource): string {
  if (entry.bodyFormat !== 'html') return entry.body;
  return entry.body
    .replace(/<(p|div|br|li|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * HTML-safe version of the body for embedding in a display surface that
 * renders raw HTML (e.g. the PDF export template): already-HTML bodies pass
 * through untouched, plain ones get escaped and their line breaks turned
 * into <br> so they still read the same as they did before rich text existed.
 */
export function bodyToSafeHtml(entry: BodySource): string {
  if (entry.bodyFormat === 'html') return entry.body;
  return escapeHtml(entry.body).replace(/\n/g, '<br>');
}

/** Wraps a legacy plain-text body as HTML so the rich text editor has something to load. */
export function plainTextToEditableHtml(text: string): string {
  if (!text) return '';
  return escapeHtml(text).replace(/\n/g, '<br>');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
