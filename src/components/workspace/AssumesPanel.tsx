"use client";

import { useState } from "react";
import type { WorkspaceView } from "@/lib/board/types";
import type { ConceptState, DepthStyle } from "@/lib/types";

interface Props {
  view: WorkspaceView;
  onClose: () => void;
  onEditConcept: (concept: string, state: ConceptState | null) => void;
  onSetStyle: (style: DepthStyle) => void;
  onTogglePersonalize: (on: boolean) => void;
}

const GROUPS: { state: ConceptState; title: string; hint: string }[] = [
  { state: "known", title: "Comfortable with", hint: "Explained briefly, if at all." },
  { state: "learning", title: "Still learning", hint: "Explained, and built on." },
  { state: "uncertain", title: "Not sure about", hint: "Steps are split smaller here." },
];

const STYLES: { style: DepthStyle; label: string }[] = [
  { style: "hints", label: "Short hints" },
  { style: "steps", label: "Step-by-step" },
  { style: "full", label: "Full explanations" },
];

const SOURCE = { student: "you said", feedback: "from your work", profile: "from your background", model: "inferred" } as const;

/** What Chiron assumes about the student. Shapes plans and answers quietly; editable here. */
export function AssumesPanel({ view, onClose, onEditConcept, onSetStyle, onTogglePersonalize }: Props) {
  const [adding, setAdding] = useState("");
  const { concepts, topics, depthStyle } = view.assumptions;
  const on = view.course.personalize;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/10" onMouseDown={onClose}>
      <aside className="settle flex h-full w-[460px] max-w-full flex-col overflow-y-auto border-l border-rule bg-paper px-7 py-6" onMouseDown={(e) => e.stopPropagation()} aria-label="What Chiron assumes">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-[22px] text-ink">What Chiron assumes</h2>
          <button onClick={onClose} className="label hover:text-ink">
            Close
          </button>
        </div>
        <p className="mt-1 font-serif text-[15px] text-muted">For {view.course.name}. This shapes step sizes and explanations; Chiron doesn&rsquo;t bring it up.</p>

        <section className="mt-6 flex items-start gap-4 border-y border-rule-soft py-4">
          <div className="min-w-0 flex-1">
            <h3 className="label">Personalize explanations</h3>
            <p className="mt-1 font-serif text-[14.5px] text-ink-soft">
              {on ? "On: plans and answers use what's below." : "Off: Chiron uses only this course and the problem. Nothing below is used or updated."}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={on}
            onClick={() => onTogglePersonalize(!on)}
            className={`relative mt-1 h-5 w-9 shrink-0 rounded-full border transition-colors ${on ? "border-chiron bg-chiron" : "border-rule bg-rule-soft"}`}
          >
            <span className={`absolute top-[2px] h-3.5 w-3.5 rounded-full bg-paper transition-all ${on ? "left-[18px]" : "left-[2px]"}`} />
          </button>
        </section>

        <div className={on ? "" : "pointer-events-none opacity-45"} aria-disabled={!on}>
          <section className="mt-6">
            <h3 className="label">Explanations in chat</h3>
            <div className="mt-2 flex gap-4">
              {STYLES.map((s) => (
                <button
                  key={s.style}
                  onClick={() => onSetStyle(s.style)}
                  aria-pressed={depthStyle === s.style}
                  className={`font-mono text-[11px] uppercase tracking-[0.07em] ${depthStyle === s.style ? "text-ink underline decoration-chiron underline-offset-4" : "text-muted hover:text-ink"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <h3 className="label">Topics covered in this course</h3>
            <p className="mt-1 font-serif text-[15px] text-ink-soft">{topics.length ? topics.join(" · ") : "None yet — they appear as you work through problems."}</p>
          </section>

          {GROUPS.map((g) => {
            const items = concepts.filter((c) => c.state === g.state);
            return (
              <section key={g.state} className="mt-6">
                <div className="flex items-baseline gap-2">
                  <h3 className="label">{g.title}</h3>
                  <span className="font-serif text-[13px] text-faint italic">{g.hint}</span>
                </div>
                {items.length === 0 && <p className="mt-1 font-serif text-[14px] text-faint">—</p>}
                <ul className="mt-1">
                  {items.map((c) => (
                    <li key={c.name} className="group flex items-baseline gap-2 border-b border-rule-soft py-1.5">
                      <span className={`min-w-0 flex-1 truncate font-serif text-[15.5px] ${c.inCourse ? "text-ink" : "text-ink-soft"}`}>{c.name}</span>
                      <span className="hidden font-mono text-[10px] text-faint group-hover:inline">{SOURCE[c.source]}</span>
                      {GROUPS.filter((o) => o.state !== g.state).map((o) => (
                        <button key={o.state} onClick={() => onEditConcept(c.name, o.state)} className="font-mono text-[10.5px] text-muted hover:text-chiron" title={`Move to “${o.title}”`}>
                          → {o.title.toLowerCase()}
                        </button>
                      ))}
                      <button onClick={() => onEditConcept(c.name, null)} className="font-mono text-[11px] text-faint hover:text-oxblood" aria-label={`Remove ${c.name}`}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <form
            className="mt-6 flex items-baseline gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (adding.trim()) onEditConcept(adding.trim(), "known");
              setAdding("");
            }}
          >
            <input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              placeholder="Add something you're comfortable with…"
              className="min-w-0 flex-1 border-b border-rule bg-transparent py-1 font-serif text-[15px] outline-none placeholder:text-faint focus:border-chiron"
              aria-label="Add a concept"
            />
            <button type="submit" disabled={!adding.trim()} className="label text-chiron hover:text-ink disabled:opacity-30">
              Add
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
