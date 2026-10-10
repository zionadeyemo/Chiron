"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientProblemSummary } from "@/lib/board/types";

const STATUS_LABEL: Record<ClientProblemSummary["status"], string> = {
  in_progress: "in progress",
  solved: "solved",
  independent: "on your own",
};

/** The current problem's title; opens the course's problem history (newest first). */
export function ProblemMenu({
  problems,
  activeId,
  onSelect,
  onNew,
}: {
  problems: ClientProblemSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = problems.find((p) => p.id === activeId);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!problems.length) return null;
  return (
    <div ref={ref} className="relative min-w-0">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 items-baseline gap-2 hover:text-ink">
        <span className="label shrink-0">Problem</span>
        <span className="max-w-[36ch] truncate font-serif text-[15px] text-ink">{active?.title ?? "—"}</span>
        <span className="font-mono text-[10px] text-faint">{problems.length > 1 ? `▾ ${problems.length}` : "▾"}</span>
      </button>
      {open && (
        <div className="settle absolute top-full left-0 z-30 mt-2 w-[380px] border border-rule bg-paper py-1 shadow-[0_4px_18px_rgba(31,27,22,0.08)]">
          <ul className="max-h-[50vh] overflow-y-auto">
            {problems.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setOpen(false);
                    if (p.id !== activeId) onSelect(p.id);
                  }}
                  className={`flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-rule-soft ${p.id === activeId ? "bg-rule-soft/60" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate font-serif text-[15px] text-ink">{p.title}</span>
                  <span className="label shrink-0 normal-case tracking-normal">{STATUS_LABEL[p.status]}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              setOpen(false);
              onNew();
            }}
            className="label block w-full border-t border-rule px-3 py-2 text-left text-chiron hover:bg-rule-soft"
          >
            + New problem
          </button>
        </div>
      )}
    </div>
  );
}
