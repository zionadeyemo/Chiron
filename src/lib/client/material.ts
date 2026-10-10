"use client";

import type { DocumentMeta } from "../types";
import { api } from "./api";
import { describePdf } from "./pdf";

/** Uploads a PDF and records its page count and printed page labels. */
export async function addPdf(file: File): Promise<DocumentMeta> {
  const { document } = await api.uploadPdf(file);
  const info = await describePdf(document.id);
  return (await api.patchDocument(document.id, info)).document;
}

/** Resolves within `ms`, whichever comes first — never lets a stuck render block asking. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}
