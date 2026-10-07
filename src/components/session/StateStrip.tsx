"use client";

import { useEffect, useRef, useState } from "react";
import { levelFromScore } from "@/lib/depth";
import type { ConceptState, StudySession, UserProfile } from "@/lib/types";

interface Props {
  session: StudySession;
  profile: UserProfile;
  onEditTask: (label: string) => void;
  onEditStep: (step: string) => void;
  onEditConcept: (concept: string, state: ConceptState | null) => void;
  onOpenLearner: () => void;
}

const STATE_OPTIONS: { state: ConceptState | null; label: string }[] = [
  { state: "known", label: "I know this" },
  { state: "learning", label: "Still learning it" },
  { state: "uncertain", label: "Not sure — explain it" },
  { state: null, label: "Not relevant" },
];

export function StateStrip({ session, profile, onEditTask, onEditStep, onEditConcept, onOpenLearner }: Props) {
  const k = profile.knowledge;
  const relevant = session.relevantConcepts.filter((c) => k[c]);
  let assumed = relevant.filter((c) => k[c].state === "known");
  if (assumed.length === 0) {
    assumed = Object.entries(k)
      .filter(([, e]) => e.state === "known")
      .slice(0, 4)
      .map(([n]) => n);
  }
  const refresh = [
    ...relevant.filter((c) => k[c].state !== "known"),
    ...Object.entries(k)
      .filter(([n, e]) => e.state === "uncertain" && !relevant.includes(n))
      .map(([n]) => n),
  ].slice(0, 3);
  const level = levelFromScore(profile.depth.score);

  return (
    <footer className="flex min-h-14 shrink-0 items-stretch border-t border-rule bg-paper text-[14px]" aria-label="Session state">
      <Field label="Current task" className="max-w-[26%]">
        <EditableText value={session.task.label} onSave={onEditTask} ariaLabel="Edit current task" />
      </Field>
      <Field label="Current step" className="max-w-[24%]">
        <EditableText value={session.step || "—"} onSave={onEditStep} ariaLabel="Edit current step" />
      </Field>
      <Field label="Assuming you know" className="flex-1">
        <ConceptList names={assumed} onEdit={onEditConcept} tone="known" />
      </Field>
      <Field label="Might need refreshing" className="max-w-[22%]">
        {refresh.length ? <ConceptList names={refresh} onEdit={onEditConcept} tone="refresh" /> : <span className="text-faint">—</span>}
      </Field>
      <button
        onClick={onOpenLearner}
        className="flex shrink-0 flex-col justify-center gap-0.5 border-l border-rule px-4 text-left hover:bg-rule-soft/60"
        title="Open your learner model and depth preference"
      >
        <span className="label">Depth</span>
        <span className="font-mono text-[12px] text-chiron">
          L{level}
          {session.shortenNext != null && <span className="text-faint"> · ≤{session.shortenNext}w</span>}
        </span>
      </button>
    </footer>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col justify-center gap-0.5 border-r border-rule px-4 py-2 ${className}`}>
      <span className="label">{label}</span>
      <div className="min-w-0 font-serif text-ink">{children}</div>
    </div>
  );
}

function EditableText({ value, onSave, ariaLabel }: { value: string; onSave: (v: string) => void; ariaLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            onSave(draft.trim());
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label={ariaLabel}
        className="w-full border-b border-chiron bg-transparent outline-none"
      />
    );
  }
  return (
    <button
      onClick={() => {
        setDraft(value === "—" ? "" : value);
        setEditing(true);
      }}
      className="block w-full truncate text-left decoration-rule underline-offset-4 hover:underline"
      title={`${value} — click to correct`}
    >
      {value}
    </button>
  );
}

function ConceptList({ names, onEdit, tone }: { names: string[]; onEdit: Props["onEditConcept"]; tone: "known" | "refresh" }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative flex flex-wrap items-baseline gap-x-1 truncate">
      {names.map((n, i) => (
        <span key={n} className="relative">
          <button
            onClick={() => setOpen(open === n ? null : n)}
            className={`decoration-dotted underline-offset-4 hover:underline ${tone === "refresh" ? "text-oxblood" : ""}`}
            title="Click to correct"
          >
            {n}
          </button>
          {i < names.length - 1 && <span className="text-faint">,</span>}
          {open === n && (
            <div className="settle absolute bottom-full left-0 z-20 mb-2 w-52 border border-rule bg-paper py-1 shadow-[0_2px_10px_rgba(31,27,22,0.08)]">
              <div className="label px-3 py-1 normal-case tracking-normal">{n}</div>
              {STATE_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  onClick={() => {
                    onEdit(n, o.state);
                    setOpen(null);
                  }}
                  className="block w-full px-3 py-1 text-left font-sans text-[13px] text-ink-soft hover:bg-rule-soft"
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </span>
      ))}
    </div>
  );
}
