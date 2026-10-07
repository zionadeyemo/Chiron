"use client";

import { useState } from "react";
import { LEVEL_NAMES, levelFromScore } from "@/lib/depth";
import type { ConceptState, DepthStyle, UserProfile } from "@/lib/types";

interface Props {
  profile: UserProfile;
  onClose: () => void;
  onEditConcept: (concept: string, state: ConceptState | null) => void;
  onSetStyle: (style: DepthStyle) => void;
}

const GROUPS: { state: ConceptState; title: string; hint: string }[] = [
  { state: "known", title: "Known", hint: "Chiron won't re-explain these." },
  { state: "learning", title: "Learning", hint: "Chiron explains briefly and builds on them." },
  { state: "uncertain", title: "Uncertain", hint: "Chiron checks these before relying on them." },
];

const STYLES: { style: DepthStyle; label: string }[] = [
  { style: "hints", label: "Short hints" },
  { style: "steps", label: "Step-by-step" },
  { style: "full", label: "Full explanations" },
];

const SOURCE_LABEL = { student: "you said", feedback: "from your ratings", profile: "from your profile", model: "Chiron's guess" } as const;

export function LearnerDrawer({ profile, onClose, onEditConcept, onSetStyle }: Props) {
  const [adding, setAdding] = useState("");
  const entries = Object.entries(profile.knowledge).sort(([a], [b]) => a.localeCompare(b));
  const level = levelFromScore(profile.depth.score);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/10" onMouseDown={onClose}>
      <aside
        className="settle flex h-full w-[440px] max-w-full flex-col overflow-y-auto border-l border-rule bg-paper px-7 py-6"
        onMouseDown={(e) => e.stopPropagation()}
        aria-label="Learner model"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-[22px] text-ink">What Chiron assumes</h2>
          <button onClick={onClose} className="label hover:text-ink">
            Close
          </button>
        </div>
        <p className="mt-1 font-serif text-[15px] text-muted">
          {profile.year} · {profile.major} · {profile.course}
        </p>

        <section className="mt-6">
          <h3 className="label">Depth</h3>
          <p className="mt-1 font-serif text-[15px] text-ink-soft">
            Answering at <strong className="font-semibold text-chiron">level {level}</strong> ({LEVEL_NAMES[level]}). Your Too much / Too little
            ratings move this; so does this setting.
          </p>
          <div className="mt-2 flex gap-4">
            {STYLES.map((s) => (
              <button
                key={s.style}
                onClick={() => onSetStyle(s.style)}
                aria-pressed={profile.depth.style === s.style}
                className={`font-mono text-[11px] uppercase tracking-[0.07em] ${profile.depth.style === s.style ? "text-ink underline decoration-chiron underline-offset-4" : "text-muted hover:text-ink"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        {GROUPS.map((g) => {
          const items = entries.filter(([, e]) => e.state === g.state);
          return (
            <section key={g.state} className="mt-7">
              <div className="flex items-baseline gap-2">
                <h3 className="label">{g.title}</h3>
                <span className="font-serif text-[13px] italic text-faint">{g.hint}</span>
              </div>
              {items.length === 0 && <p className="mt-1 font-serif text-[14px] text-faint">—</p>}
              <ul className="mt-1.5">
                {items.map(([name, e]) => (
                  <li key={name} className="group flex items-baseline gap-2 border-b border-rule-soft py-1.5">
                    <span className="min-w-0 flex-1 truncate font-serif text-[15.5px] text-ink">{name}</span>
                    <span className="hidden font-mono text-[10px] text-faint group-hover:inline">{SOURCE_LABEL[e.source]}</span>
                    {GROUPS.filter((o) => o.state !== g.state).map((o) => (
                      <button key={o.state} onClick={() => onEditConcept(name, o.state)} className="font-mono text-[10.5px] text-muted hover:text-chiron" title={`Mark as ${o.title.toLowerCase()}`}>
                        → {o.title.toLowerCase()}
                      </button>
                    ))}
                    <button onClick={() => onEditConcept(name, null)} className="font-mono text-[11px] text-faint hover:text-oxblood" aria-label={`Remove ${name}`}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <form
          className="mt-7 flex items-baseline gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding.trim()) onEditConcept(adding.trim(), "known");
            setAdding("");
          }}
        >
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="Add something you know…"
            className="flex-1 border-b border-rule bg-transparent py-1 font-serif text-[15px] outline-none focus:border-chiron"
          />
          <button type="submit" className="label text-chiron hover:text-ink">
            Add as known
          </button>
        </form>
      </aside>
    </div>
  );
}
