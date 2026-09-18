import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { buildEntrySection, PDF_CSS, type ExportableEntry, type ExportLabels } from './pdfTemplate';
import type { ImageBlob } from '../types/image';

// A4 in jsPDF's pt unit, and the CSS-pixel width used purely to lay out the
// off-screen render container (html2canvas needs a real, in-document element
// to compute layout/fonts from -- it can't rasterize a detached node).
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const CONTAINER_WIDTH_PX = 794; // A4 width at 96 DPI
const MARGIN_PT = 56; // ~20mm
const CONTENT_WIDTH_PT = A4_WIDTH_PT - MARGIN_PT * 2;
const CONTENT_HEIGHT_PT = A4_HEIGHT_PT - MARGIN_PT * 2;

/**
 * Web: generates a real PDF file client-side and triggers a normal browser
 * download -- no system print dialog, no "unnecessary UI". Each entry is
 * rasterized to its own canvas with html2canvas, then sliced into as many
 * full pages as its height needs and placed with addImage(). This is more
 * code than jsPDF's own .html() convenience method, but deterministic --
 * .html()'s automatic pagination doesn't reliably start a fresh page at
 * each addPage() call when rendering several sections into one document.
 */
export async function exportEntriesToPdf(
  entries: ExportableEntry[],
  imagesByEntryId: Record<string, ImageBlob[]>,
  labels: ExportLabels,
  locale: string,
  filename: string
): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let usedFirstPage = false;
  for (const entry of entries) {
    const html = `<style>${PDF_CSS}</style>${buildEntrySection(entry, imagesByEntryId[entry.id] ?? [], labels, locale)}`;
    usedFirstPage = await renderSectionIntoDoc(doc, html, usedFirstPage);
  }
  doc.save(filename);
}

/** Returns true (always) -- signals to the caller that the doc's first page has now been used. */
async function renderSectionIntoDoc(doc: jsPDF, html: string, usedFirstPage: boolean): Promise<boolean> {
  // html2canvas clones the whole document into its own off-screen iframe to
  // render from; placing our container at a large negative offset compounds
  // with that clone's own positioning and the capture comes back blank.
  // Rendering on-screen (briefly, under an opaque cover) is the reliable
  // approach -- this only shows during the export's own loading state.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = `${CONTAINER_WIDTH_PX}px`;
  container.style.background = '#ffffff';
  container.style.zIndex = '999999';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { backgroundColor: '#ffffff', scale: 2 });
    const pxPerPt = canvas.width / CONTENT_WIDTH_PT;
    const pageHeightPx = CONTENT_HEIGHT_PT * pxPerPt;

    let renderedPx = 0;
    while (renderedPx < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeightPx;
      const ctx = slice.getContext('2d');
      if (!ctx) break;
      ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

      if (usedFirstPage) doc.addPage();
      usedFirstPage = true;
      doc.addImage(
        slice.toDataURL('image/jpeg', 0.92),
        'JPEG',
        MARGIN_PT,
        MARGIN_PT,
        CONTENT_WIDTH_PT,
        sliceHeightPx / pxPerPt
      );

      renderedPx += sliceHeightPx;
    }
  } finally {
    document.body.removeChild(container);
  }
  return usedFirstPage;
}
