"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CurrentTask, DocumentMeta, Location } from "@/lib/types";
import { Markdown } from "../Markdown";
import { DemoPageView, PdfPageView, ScreenshotView } from "./PageViews";

interface Props {
  documents: DocumentMeta[];
  location: Location;
  task: CurrentTask;
  onNavigate: (loc: Location) => void;
  onMarkProblem: (task: { label: string; text?: string; documentId: string; page: number }) => void;
  onPointAt: (text: string) => void;
  onAddFile: (file: File) => void;
}

export function pageLabel(doc: DocumentMeta | undefined, page: number) {
  const printed = doc?.pageLabels?.[page - 1];
  return printed ? `p. ${printed}` : `page ${page}`;
}

export function MaterialPane({ documents, location, task, onNavigate, onMarkProblem, onPointAt, onAddFile }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const doc = documents.find((d) => d.id === location.documentId) ?? documents[0];
  const pageCount = Math.max(1, doc?.pageCount ?? 1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const locKey = `${location.documentId}:${location.page}`;
  const [rawSelection, setSelection] = useState<{ text: string; x: number; y: number; at: string } | null>(null);
  const selection = rawSelection?.at === locKey ? rawSelection : null; // a page turn drops it
  const [marking, setMarking] = useState<{ label: string; text: string } | null>(null);
  const [taskOpen, setTaskOpen] = useState(true);

  const go = useCallback(
    (page: number) => {
      if (!doc) return;
      const p = Math.min(pageCount, Math.max(1, page));
      if (p !== location.page || doc.id !== location.documentId) onNavigate({ documentId: doc.id, page: p });
    },
    [doc, pageCount, location, onNavigate],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [locKey]);

  // ←/→ turn pages when the student isn't typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") go(location.page + 1);
      if (e.key === "ArrowLeft") go(location.page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, location.page]);

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
      x: Math.min(host.width - 200, Math.max(8, rect.left - host.left + rect.width / 2 - 80)),
      y: rect.top - host.top + scrollRef.current!.scrollTop - 38,
      at: locKey,
    });
  };

  const taskHere = task.documentId === location.documentId && task.page === location.page;
  const taskElsewhere = task.documentId && task.page && !taskHere;
  const taskDoc = documents.find((d) => d.id === task.documentId);

  return (
    <section className="flex min-h-0 flex-col" aria-label="Course material">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-rule px-5">
        <span className="label shrink-0">Material</span>
        {documents.length > 1 ? (
          <select
            className="min-w-0 truncate bg-transparent font-serif text-[15px] text-ink outline-none"
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
          <span className="min-w-0 truncate font-serif text-[15px] text-ink-soft">{doc?.title}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            onClick={() => go(location.page - 1)}
            disabled={location.page <= 1}
            className="px-2 py-1 font-mono text-sm text-muted hover:text-ink disabled:opacity-30"
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="min-w-[96px] text-center font-mono text-[12px] text-ink-soft">
            {pageLabel(doc, location.page)} <span className="text-faint">· {location.page}/{pageCount}</span>
          </span>
          <button
            onClick={() => go(location.page + 1)}
            disabled={location.page >= pageCount}
            className="px-2 py-1 font-mono text-sm text-muted hover:text-ink disabled:opacity-30"
            aria-label="Next page"
          >
            ›
          </button>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="shrink-0 border-l border-rule pl-3 font-mono text-[11px] uppercase tracking-[0.08em] text-muted hover:text-ink"
          title="Add a PDF or image (or just paste a screenshot)"
        >
          + Material
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onAddFile(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => setMarking({ label: "", text: selection?.text ?? "" })}
          className="shrink-0 border-l border-rule pl-3 font-mono text-[11px] uppercase tracking-[0.08em] text-chiron hover:text-ink"
          title="Tell Chiron which problem you're working on"
        >
          Mark problem here
        </button>
      </div>

      {/* Mark-problem form */}
      {marking && (
        <form
          className="settle flex shrink-0 flex-col gap-2 border-b border-rule bg-paper px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const raw = marking.label.trim();
            if (!raw || !doc) return;
            const label = /^\d/.test(raw) ? `Problem ${raw}` : raw;
            onMarkProblem({ label, text: marking.text.trim() || undefined, documentId: doc.id, page: location.page });
            setMarking(null);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
            setTaskOpen(true);
          }}
        >
          <div className="flex items-center gap-3">
            <label className="label shrink-0" htmlFor="mark-label">
              I&rsquo;m on
            </label>
            <input
              id="mark-label"
              autoFocus
              value={marking.label}
              onChange={(e) => setMarking({ ...marking, label: e.target.value })}
              placeholder="7.18"
              className="w-40 border-b border-rule bg-transparent py-0.5 font-serif text-[16px] outline-none focus:border-chiron"
            />
            <span className="label normal-case tracking-normal text-faint">on {pageLabel(doc, location.page)}</span>
            <div className="ml-auto flex gap-3">
              <button type="button" onClick={() => setMarking(null)} className="label hover:text-ink">
                Cancel
              </button>
              <button type="submit" className="label text-chiron hover:text-ink">
                Set as current task
              </button>
            </div>
          </div>
          <textarea
            value={marking.text}
            onChange={(e) => setMarking({ ...marking, text: e.target.value })}
            rows={2}
            placeholder="Problem statement (optional — select it on the page first to fill this in)"
            className="resize-none border border-rule-soft bg-transparent px-2 py-1 font-serif text-[14px] text-ink-soft outline-none focus:border-chiron"
          />
        </form>
      )}

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto" onMouseUp={captureSelection}>
        {/* Pinned current problem */}
        <div className="mx-auto max-w-[780px] px-6 pt-6">
          <div className="border-l-2 border-oxblood/70 pl-4">
            <div className="flex items-baseline gap-3">
              <span className="label text-oxblood/90">Current problem</span>
              <span className="font-serif text-[15px] text-ink">{task.label}</span>
              {taskElsewhere && (
                <button onClick={() => onNavigate({ documentId: task.documentId!, page: task.page! })} className="label hover:text-ink">
                  go to {pageLabel(taskDoc, task.page!)} →
                </button>
              )}
              {task.text && !taskHere && (
                <button onClick={() => setTaskOpen((o) => !o)} className="label ml-auto hover:text-ink" aria-expanded={taskOpen}>
                  {taskOpen ? "hide" : "show"}
                </button>
              )}
            </div>
            {task.text && taskOpen && !taskHere && (
              <Markdown className="prose-material mt-1 text-[15.5px] leading-[1.55] text-ink-soft">{task.text}</Markdown>
            )}
          </div>
        </div>

        {/* The page */}
        <div
          ref={sheetRef}
          className={`mx-auto my-6 max-w-[780px] border border-paper-edge bg-paper shadow-[0_1px_0_var(--paper-edge)] ${doc?.kind === "demo" ? "px-12 py-11" : ""}`}
        >
          {!doc ? (
            <p className="label">No material yet — paste a screenshot (Ctrl+V) to begin.</p>
          ) : doc.kind === "demo" ? (
            <DemoPageView page={location.page} />
          ) : doc.kind === "pdf" ? (
            <PdfPageView documentId={doc.id} page={location.page} />
          ) : (
            <ScreenshotView documentId={doc.id} title={doc.title} />
          )}
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
