"use client";

import katex from "katex";
import { useMemo } from "react";

// Display math for the whiteboard. `\blank` renders a visibly empty slot (scaffold steps).
const MACROS = { "\\blank": "\\boxed{\\phantom{00}}" };

export function Tex({ latex, display = true, className }: { latex: string; display?: boolean; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(latex, { displayMode: display, throwOnError: false, strict: false, macros: { ...MACROS }, trust: false }),
    [latex, display],
  );
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
