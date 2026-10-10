"use client";

import { useState } from "react";
import type { ClientBoard } from "@/lib/board/types";
import { Markdown } from "../Markdown";

interface Props {
  problem: ClientBoard["problem"];
  pageLabel?: string;
  onEdit: (statement: string) => Promise<void>;
  onOpenPage?: () => void;
}

/** The problem as Chiron read it, so a misread can be caught and fixed before working it. */
export function ProblemCard({ problem, pageLabel, onEdit, onOpenPage }: Props) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const read = problem.source !== "text";

  return (
    <section className="border-b border-rule pb-4" aria-label="Problem">
      <div className="flex items-baseline gap-3">
        <span className="label text-oxblood/90">Problem</span>
        <h2 className="min-w-0 flex-1 truncate font-serif text-[17px] text-ink">{problem.title}</h2>
        {problem.pdfRef && onOpenPage && (
          <button onClick={onOpenPage} className="label hover:text-ink">
            {pageLabel ?? "page"} →
          </button>
        )}
        {editing === null && (
          <button onClick={() => setEditing(problem.statement)} className="label hover:text-ink" title="Fix anything Chiron misread">
            Edit
          </button>
        )}
        <button onClick={() => setOpen((o) => !o)} className="label hover:text-ink" aria-expanded={open}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && editing === null && (
        <div className="mt-2 flex gap-4">
          {problem.imageRef && (
            // eslint-disable-next-line @next/next/no-img-element -- the student's own upload
            <img src={`/api/images/${problem.imageRef}`} alt="Problem as pasted" className="h-auto max-h-40 w-auto max-w-[40%] border border-rule-soft object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <Markdown className="prose-material text-[15.5px] leading-[1.55] text-ink-soft">{problem.statement}</Markdown>
            {read && <p className="label mt-1 normal-case tracking-normal text-faint">Read from your {problem.source === "pdf" ? "page" : "image"} — Edit if anything&rsquo;s off.</p>}
          </div>
        </div>
      )}

      {editing !== null && (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editing.trim()) return;
            setSaving(true);
            try {
              await onEdit(editing.trim());
              setEditing(null);
            } finally {
              setSaving(false);
            }
          }}
        >
          <textarea
            autoFocus
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            rows={Math.min(12, Math.max(3, editing.split("\n").length + 1))}
            className="w-full resize-y border border-rule bg-paper px-3 py-2 font-serif text-[15px] text-ink outline-none focus:border-chiron"
            aria-label="Problem statement"
          />
          <div className="flex items-center justify-end gap-4">
            {saving && <span className="breathe inline-block h-1.5 w-1.5 rounded-full bg-chiron" />}
            <button type="button" onClick={() => setEditing(null)} disabled={saving} className="label hover:text-ink">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="label text-chiron hover:text-ink disabled:opacity-40">
              Save and re-read
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
