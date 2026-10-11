"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { api } from "./api";

// pdf.js runs in the browser: it renders pages for the viewer and produces the PNG +
// extracted text the server sends to the vision model. No native deps on the server.

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsPromise;
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();

export function loadPdf(documentId: string): Promise<PDFDocumentProxy> {
  let p = docs.get(documentId);
  if (!p) {
    p = pdfjs().then((m) => m.getDocument({ url: `/api/documents/${documentId}/file` }).promise);
    p.catch(() => docs.delete(documentId));
    docs.set(documentId, p);
  }
  return p;
}

/** Reads page count and printed page labels once, so citations can say "p. 342". */
export async function describePdf(documentId: string) {
  const pdf = await loadPdf(documentId);
  const labels = await pdf.getPageLabels().catch(() => null);
  return { pageCount: pdf.numPages, pageLabels: labels ?? undefined };
}

export async function renderPage(
  documentId: string,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  textLayerEl?: HTMLDivElement | null,
) {
  const m = await pdfjs();
  const pdf = await loadPdf(documentId);
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = cssWidth / base.width;
  const viewport = page.getViewport({ scale });
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const task = page.render({ canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
  await task.promise;

  if (textLayerEl) {
    textLayerEl.replaceChildren();
    textLayerEl.style.setProperty("--total-scale-factor", String(scale));
    textLayerEl.style.setProperty("--scale-factor", String(scale));
    const layer = new m.TextLayer({ textContentSource: page.streamTextContent(), container: textLayerEl, viewport });
    await layer.render().catch(() => undefined);
  }
  return { width: viewport.width, height: viewport.height };
}

async function pageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  let out = "";
  for (const item of content.items) {
    if ("str" in item) out += item.str + (item.hasEOL ? "\n" : " ");
  }
  return out.replace(/[ \t]+\n/g, "\n").trim();
}

const uploads = new Map<string, Promise<void>>();

/**
 * Makes sure the server has a PNG + text for this page (for the model). Idempotent and
 * cheap after the first call. Rendered at ~1500px wide: legible equations, modest tokens.
 */
export function ensurePageUploaded(documentId: string, pageNumber: number): Promise<void> {
  const key = `${documentId}:${pageNumber}`;
  let p = uploads.get(key);
  if (!p) {
    p = (async () => {
      const { cached } = await api.pageCached(documentId, pageNumber);
      if (cached) return;
      const pdf = await loadPdf(documentId);
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 1500 / base.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, viewport }).promise;
      // PNG keeps equations crisp; a dense page falls back to JPEG to stay under the upload cap.
      let image = canvas.toDataURL("image/png");
      for (const quality of [0.85, 0.7]) if (image.length > 3_900_000) image = canvas.toDataURL("image/jpeg", quality);
      await api.putPage(documentId, pageNumber, image, await pageText(page));
    })();
    p.catch(() => uploads.delete(key));
    uploads.set(key, p);
  }
  return p;
}
