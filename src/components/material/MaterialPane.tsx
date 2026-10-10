"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentMeta } from "@/lib/types";
import { DemoPageView, PdfPageView } from "./PageViews";

export interface MaterialLocation {
  documentId: string;
  /** 1-based page index within the document. */
  page: number;
}

interface Props {
  documents: DocumentMeta[];
  location: MaterialLocation | null;
  onNavigate: (loc: MaterialLocation) => void;
  onMarkProblem: (input: { docId: string; page: number; text?: string }) => void;
  onPointAt: (text: string) => void;
  onAddPdf: (file: File) => void;
  onClose: () => void;
}

export function pageLabel(doc: DocumentMeta | undefined, page: number) {
  const printed = doc?.pageLabels?.[page - 1];
  return printed ? `p. ${printed}` : `page ${page}`;
}

/** The course material drawer: read pages, mark a problem, point Chiron at a passage. */
export function MaterialPane({ documents, location, onNavigate, onMarkProblem, onPointAt, onAddPdf, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const doc = documents.find((d) => d.id === location?.documentId) ?? documents[0];
  const page = location && doc && location.documentId === doc.id ? location.page : 1;
  const pageCount = Math.max(1, doc?.pageCount ?? 1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const locKey = `${doc?.id}:${page}`;
  const [rawSelection, setSelection] = useState<{ text: string; x: number; y: number; at: string } | null>(null);
  const selection = rawSelection?.at === locKey ? rawSelection : null; // a page turn drops it
  const [marking, setMarking] = useState<{ text: string } | null>(null);

  const go = useCallback(
    (p: number) => {
      if (!doc) return;
      const next = Math.min(pageCount, Math.max(1, p));
      if (next !== page) onNavigate({ documentId: doc.id, page: next });
    },
    [doc, pageCount, page, onNavigate],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [locKey]);

  const captureSelection = () => {
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!sel || !text || text.length < 2 || !sheetRef.current || !sheetRef.current.contains(sel.anchorNode)) {
      setSelection(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const host = scrollRef.current!.getBoundingClientRect();
    setSelection({
      text: text.slice(0, 1000),
      x: Math.min(host.width - 220, Math.max(8, rect.left - host.left + rect.width / 2 - 100)),
      y: rect.top - host.top + scrollRef.current!.scrollTop - 38,
      at: locKey,
    });
  };

  return (
    <section className="flex min-h-0 flex-col border-r border-rule bg-desk" aria-label="Course material">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-rule px-4">
        <span className="label shrink-0">Material</span>
        {documents.length > 1 ? (
          <select
            className="min-w-0 flex-1 truncate bg-transparent font-serif text-[15px] text-ink outline-none"
            value={doc?.id}
            onChange={(e) => onNavigate({ documentId: e.target.value, page: 1 })}
            aria-label="Document"
          >
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate font-serif text-[15px] text-ink-soft">{doc?.title ?? ""}</span>
        )}
        <button onClick={onClose} className="label shrink-0 hover:text-ink" aria-label="Close material">
          ×
        </button>
      </div>

      {doc && (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-rule px-3">
          <button onClick={() => go(page - 1)} disabled={page <= 1} className="px-2 py-1 font-mono text-sm text-muted hover:text-ink disabled:opacity-30" aria-label="Previous page">
            ‹
          </button>
          <span className="min-w-[88px] text-center font-mono text-[12px] text-ink-soft">
            {pageLabel(doc, page)} <span className="text-faint">· {page}/{pageCount}</span>
          </span>
          <button onClick={() => go(page + 1)} disabled={page >= pageCount} className="px-2 py-1 font-mono text-sm text-muted hover:text-ink disabled:opacity-30" aria-label="Next page">
            ›
          </button>
          <button
            onClick={() => setMarking({ text: selection?.text ?? "" })}
            className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] text-chiron hover:text-ink"
            title="Start a problem from this page"
          >
            Mark problem here
          </button>
        </div>
      )}

      {marking && doc && (
        <form
          className="settle flex shrink-0 flex-col gap-2 border-b border-rule bg-paper px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            onMarkProblem({ docId: doc.id, page, text: marking.text.trim() || undefined });
            setMarking(null);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          <textarea
            autoFocus
            value={marking.text}
            onChange={(e) => setMarking({ text: e.target.value })}
            rows={3}
            placeholder="Which problem? e.g. “7.18”, or select its text on the page first"
            className="resize-none border border-rule-soft bg-transparent px-2 py-1 font-serif text-[14px] text-ink-soft outline-none focus:border-chiron"
          />
          <div className="flex justify-end gap-4">
            <button type="button" onClick={() => setMarking(null)} className="label hover:text-ink">
              Cancel
            </button>
            <button type="submit" className="label text-chiron hover:text-ink">
              Start this problem
            </button>
          </div>
        </form>
      )}

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto" onMouseUp={captureSelection}>
        {!doc ? (
          <div className="px-6 pt-10">
            <p className="font-serif text-[15px] text-muted">No material yet. Add a PDF of your notes or problem set to read it here and mark problems on it.</p>
          </div>
        ) : (
          <div
            ref={sheetRef}
            className={`mx-auto my-5 max-w-[720px] border border-paper-edge bg-paper ${doc.kind === "demo" ? "px-9 py-9" : ""}`}
          >
            {doc.kind === "demo" ? <DemoPageView page={page} /> : <PdfPageView documentId={doc.id} page={page} />}
          </div>
        )}
        <div className="px-6 pb-6">
          <button onClick={() => fileRef.current?.click()} className="label hover:text-ink">
            + Add a PDF
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAddPdf(f);
              e.target.value = "";
            }}
          />
        </div>

        {selection && (
          <button
            className="settle absolute z-10 border border-chiron/30 bg-paper px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-chiron shadow-sm hover:bg-marker/40"
            style={{ left: selection.x, top: selection.y }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onPointAt(selection.text);
              window.getSelection()?.removeAllRanges();
              setSelection(null);
            }}
          >
            Ask about this
          </button>
        )}
      </div>
    </section>
  );
}
