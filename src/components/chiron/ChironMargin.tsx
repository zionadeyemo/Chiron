"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedbackKind, Mode, SideQuestion, Turn } from "@/lib/types";
import { Markdown } from "../Markdown";

export interface Pending {
  question: string;
  pointingAt?: string;
  explainMore: boolean;
}

interface Props {
  mode: Mode;
  turns: Turn[];
  pending: Pending | null;
  error: { message: string; retry: () => void } | null;
  taskShort: string;
  sideQuestion: SideQuestion | null;
  pointingAt: string | null;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onClearPointing: () => void;
  onAsk: (question: string) => void;
  onExplainMore: (turnId: string) => void;
  onRate: (turnId: string, kind: FeedbackKind) => void;
  onFlag: (turnId: string) => void;
  onCloseSide: () => void;
}

const LEVEL_TITLES = ["", "Level 1 — hint", "Level 2 — short explanation", "Level 3 — worked reasoning", "Level 4 — deep explanation"];
const RATINGS: { kind: FeedbackKind; label: string; key: string }[] = [
  { kind: "too_much", label: "Too much", key: "1" },
  { kind: "just_right", label: "Just right", key: "2" },
  { kind: "too_little", label: "Too little", key: "3" },
];

export function ChironMargin(props: Props) {
  const { mode, turns, pending, error, taskShort, sideQuestion, pointingAt, inputRef } = props;
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const busy = !!pending;
  const latest = turns[turns.length - 1];

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, pending, error]);

  // Alt+1/2/3 rate the latest note, Alt+E explains it more. Fast, never in the way.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !latest || busy) return;
      const rating = RATINGS.find((r) => r.key === e.key);
      if (rating) {
        e.preventDefault();
        props.onRate(latest.id, rating.kind);
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        props.onExplainMore(latest.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [latest, busy, props]);

  const submit = () => {
    const q = draft.trim();
    if (!q || busy) return;
    props.onAsk(q);
    setDraft("");
  };

  return (
    <section className="flex min-h-0 flex-col border-l border-rule bg-paper/60" aria-label="Chiron">
      <div className="flex h-11 shrink-0 items-center border-b border-rule px-5">
        <span className="label">Chiron</span>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-4">
        {turns.length === 0 && !pending && (
          <p className="prose-note max-w-[34ch] text-chiron-soft">
            I&rsquo;m here for {taskShort}. Ask the small question you&rsquo;re actually stuck on; I&rsquo;ll keep it short. Tell me under each note if it was
            too much or too little.
          </p>
        )}

        {turns.map((t, i) => (
          <Note
            key={t.id}
            turn={t}
            mode={mode}
            isLatest={i === turns.length - 1}
            startsAside={t.inSideQuestion && !turns[i - 1]?.inSideQuestion}
            busy={busy}
            onExplainMore={() => props.onExplainMore(t.id)}
            onRate={(k) => props.onRate(t.id, k)}
            onFlag={() => props.onFlag(t.id)}
          />
        ))}

        {pending && (
          <div className="settle mt-6">
            <StudentLine question={pending.explainMore ? null : pending.question} pointingAt={pending.pointingAt} />
            <div className="mt-2 flex items-center gap-2 border-l-2 border-chiron/25 pl-4 py-1">
              <span className="breathe inline-block h-1.5 w-1.5 rounded-full bg-chiron" />
              <span className="label normal-case tracking-normal text-faint">{mode === "chiron" ? "checking…" : "thinking…"}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="settle mt-5 border-l-2 border-oxblood pl-4">
            <p className="font-serif text-[15px] text-oxblood">{error.message}</p>
            <button onClick={error.retry} className="label mt-1 text-oxblood hover:text-ink">
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-rule px-5 pt-3 pb-3">
        {sideQuestion && (
          <div className="mb-2 flex items-baseline gap-2">
            <span className="label">Aside</span>
            <span className="min-w-0 truncate font-serif text-[14px] italic text-muted">{sideQuestion.question}</span>
            <button onClick={props.onCloseSide} className="label ml-auto shrink-0 text-chiron hover:text-ink">
              back to {taskShort} →
            </button>
          </div>
        )}
        {pointingAt && (
          <div className="mb-2 flex items-start gap-2">
            <span className="label shrink-0 pt-0.5">Pointing at</span>
            <span className="min-w-0 flex-1 truncate bg-marker/60 px-1 font-serif text-[14px] text-ink-soft">{pointingAt}</span>
            <button onClick={props.onClearPointing} className="label shrink-0 hover:text-ink" aria-label="Clear pointing">
              ×
            </button>
          </div>
        )}
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") props.onClearPointing();
          }}
          rows={Math.min(5, Math.max(1, draft.split("\n").length))}
          placeholder={`What's unclear in ${taskShort}?`}
          className="w-full resize-none bg-transparent font-serif focus-visible:outline-none text-[16.5px] leading-snug text-ink outline-none placeholder:text-faint"
          aria-label="Ask Chiron"
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="label truncate normal-case tracking-normal text-faint">Enter to ask · Ctrl+V screenshot · Alt+1/2/3 rate</span>
          <button onClick={submit} disabled={!draft.trim() || busy} className="label text-chiron hover:text-ink disabled:opacity-30">
            Ask
          </button>
        </div>
      </div>
    </section>
  );
}

function StudentLine({ question, pointingAt }: { question: string | null; pointingAt?: string }) {
  return (
    <div className="flex flex-col items-end gap-1 pl-10 text-right">
      {pointingAt && <span className="max-w-full truncate bg-marker/50 px-1 font-serif text-[13px] text-muted">“{pointingAt}”</span>}
      {question ? (
        <p className="font-serif text-[15.5px] italic leading-snug text-ink-soft">{question}</p>
      ) : (
        <p className="label">explain more</p>
      )}
    </div>
  );
}

function Note({
  turn,
  mode,
  isLatest,
  startsAside,
  busy,
  onExplainMore,
  onRate,
  onFlag,
}: {
  turn: Turn;
  mode: Mode;
  isLatest: boolean;
  startsAside: boolean;
  busy: boolean;
  onExplainMore: () => void;
  onRate: (k: FeedbackKind) => void;
  onFlag: () => void;
}) {
  const maxed = mode === "chiron" && (turn.depth ?? 0) >= 4;
  const closesAside = turn.sideQuestion === "close";
  return (
    <article className={`settle group mt-6 first:mt-0 ${turn.inSideQuestion ? "ml-4" : ""}`}>
      {startsAside && <div className="label mb-2 text-faint">Aside</div>}
      <StudentLine question={turn.kind === "explain_more" ? null : turn.question} pointingAt={turn.pointingAt} />
      {closesAside && <div className="label mt-3 text-faint">back to the problem</div>}
      <div
        className={`mt-2 border-l-2 pl-4 ${turn.inSideQuestion ? "border-dashed border-chiron/35" : "border-chiron/60"} ${turn.flagged ? "border-oxblood" : ""}`}
      >
        <Markdown className="prose-note">{turn.response}</Markdown>

        {/* Provenance: depth, sources, verification */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-faint">
          {mode === "chiron" && turn.depth != null && (
            <span title={LEVEL_TITLES[turn.depth]} className="text-chiron-soft">
              L{turn.depth}
            </span>
          )}
          {mode === "chiron" &&
            turn.sources.map((s, i) => (
              <span key={i} title={s.type === "material" ? "From your material" : s.type === "inference" ? "Chiron's inference" : "General knowledge (not in your material)"}>
                {s.type === "material" ? "§ " : s.type === "inference" ? "∴ " : "◦ "}
                {s.ref || s.type}
              </span>
            ))}
          {mode === "chiron" && turn.verified && (
            <span className="text-verified" title={turn.mathCalls.map((c) => `${c.tool}: ${c.ok ? "ok" : c.output}`).join("\n")}>
              ✓ checked
            </span>
          )}
          {turn.mock && <span className="text-oxblood">mock tutor</span>}
        </div>

        {/* The two controls: depth feedback + explain more. Always present. */}
        <div
          className={`mt-1.5 flex flex-wrap items-center gap-x-1 font-mono text-[11px] transition-opacity ${isLatest ? "opacity-100" : "opacity-45 group-hover:opacity-100 focus-within:opacity-100"}`}
        >
          {RATINGS.map((r, i) => (
            <span key={r.kind} className="flex items-center">
              {i > 0 && <span className="px-0.5 text-rule">·</span>}
              <button
                onClick={() => onRate(r.kind)}
                aria-pressed={turn.feedback === r.kind}
                title={isLatest ? `Alt+${r.key}` : undefined}
                className={`px-0.5 py-0.5 ${turn.feedback === r.kind ? "text-ink underline decoration-chiron underline-offset-4" : "text-muted hover:text-ink"}`}
              >
                {r.label}
              </button>
            </span>
          ))}
          <span className="px-2 text-rule">|</span>
          <button
            onClick={onExplainMore}
            disabled={busy || maxed}
            title={maxed ? "Already at the deepest level" : isLatest ? "Alt+E" : undefined}
            className="px-0.5 py-0.5 text-chiron hover:text-ink disabled:opacity-35"
          >
            Explain more
          </button>
          <button
            onClick={onFlag}
            aria-pressed={turn.flagged}
            title="Flag this as wrong"
            className={`ml-auto px-0.5 py-0.5 ${turn.flagged ? "text-oxblood" : "text-faint hover:text-oxblood"}`}
          >
            {turn.flagged ? "flagged as wrong" : "wrong?"}
          </button>
        </div>
      </div>
    </article>
  );
}
