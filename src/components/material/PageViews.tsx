"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_PAGES } from "@/lib/demo/chapter7";
import { ensurePageUploaded, renderPage } from "@/lib/client/pdf";
import { Markdown } from "../Markdown";
import { Figure } from "./Figures";

export function DemoPageView({ page }: { page: number }) {
  const p = DEMO_PAGES[page - 1];
  if (!p) return <p className="label">No such page.</p>;
  const chunks = p.markdown.split(/^\[\[fig:(\w+)\]\]$/m);
  return (
    <div className="prose-material">
      {chunks.map((chunk, i) => (i % 2 ? <Figure key={i} id={chunk} /> : chunk.trim() ? <Markdown key={i}>{chunk}</Markdown> : null))}
      <div className="label mt-10 text-center">{p.label}</div>
    </div>
  );
}

export function PdfPageView({ documentId, page }: { documentId: string; page: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width / 20) * 20));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!width || !canvasRef.current) return;
    let cancelled = false;
    setState("loading");
    renderPage(documentId, page, canvasRef.current, width, textRef.current)
      .then((size) => {
        if (cancelled || !textRef.current) return;
        textRef.current.style.width = `${size.width}px`;
        textRef.current.style.height = `${size.height}px`;
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    // Prepare the page image for the tutor in the background.
    ensurePageUploaded(documentId, page).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [documentId, page, width]);

  return (
    <div ref={wrapRef} className="w-full">
      <div className="relative mx-auto" style={{ width: "fit-content" }}>
        <canvas ref={canvasRef} className={`block ${state === "ready" ? "" : "opacity-0"}`} />
        <div ref={textRef} className="textLayer" />
        {state === "loading" && <p className="label absolute top-8 left-0 right-0 text-center">Rendering page…</p>}
        {state === "error" && <p className="label absolute top-8 left-0 right-0 text-center text-oxblood">Couldn&rsquo;t render this page.</p>}
      </div>
    </div>
  );
}

export function ScreenshotView({ documentId, title }: { documentId: string; title: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local, already-sized user upload
    <img src={`/api/documents/${documentId}/file`} alt={title} className="mx-auto block h-auto max-w-full" />
  );
}
