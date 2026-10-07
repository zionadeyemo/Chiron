"use client";

import type { DocumentMeta } from "../types";
import { api } from "./api";
import { describePdf } from "./pdf";

/** Uploads a PDF or image; for PDFs, records page count and printed page labels. */
export async function addMaterial(file: File): Promise<DocumentMeta> {
  const { document } = await api.upload(file);
  if (document.kind !== "pdf") return document;
  const info = await describePdf(document.id);
  return (await api.patchDocument(document.id, info)).document;
}
