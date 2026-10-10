"use client";

import { useState } from "react";
import type { ClientBoard, StudentLine } from "@/lib/board/types";
import { Markdown } from "../Markdown";

/** Hints sit in the margin where the next step will go — not in the chat. */
export function HintNote({ hints, nextIndex }: { hints: string[]; nextIndex: number }) {
  if (!hints.length) return null;
  return (
    <aside className="settle grid grid-cols-[48px_1fr] gap-x-3 py-2" aria-label={`Hints for step ${nextIndex}`}>
      <span className="pt-0.5 text-right font-mono text-[12px] text-faint">{nextIndex}</span>
      <div className="border-l-2 border-dashed border-chiron/40 pl-4">
        {hints.map((h, i) => (
          <div key={i} className="flex gap-3 py-0.5">
            <span className="label shrink-0 pt-[3px] text-chiron-soft">Hint {i + 1}</span>
            <Markdown className="prose-note text-[15.5px] text-chiron italic">{h}</Markdown>
          </div>
        ))}
      </div>
    </aside>
  );
}

const VERDICT: Record<NonNullable<StudentLine["verdict"]>, { mark: string; label: string; cls: string }> = {
  correct: { mark: "✓", label: "correct", cls: "text-verified" },
  incorrect: { mark: "✗", label: "not right", cls: "text-oxblood" },
  different_method: { mark: "↻", label: "your method", cls: "text-verified" },
  unclear: { mark: "?", label: "not sure", cls: "text-muted" },
};

/** Exactly what they wrote; Markdown only if it contains math (so R_B*6 isn't eaten as emphasis). */
function StudentText({ text }: { text: string }) {
  if (text.includes("$")) return <Markdown className="prose-note student-hand-text text-[16px]">{text}</Markdown>;
  return <p className="student-hand-text font-serif text-[16px] whitespace-pre-wrap">{text}</p>;
}

/** A line the student submitted, in their own hand, with Chiron's verdict. */
export function StudentLineView({ line }: { line: StudentLine }) {
  const v = line.verdict ? VERDICT[line.verdict] : null;
  return (
    <div className="settle grid grid-cols-[48px_1fr] gap-x-3 py-2" aria-label="Your line">
      <span className={`pt-0.5 text-right font-mono text-[13px] ${v?.cls ?? "text-faint"}`} title={v?.label}>
        {v?.mark ?? "·"}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="label text-student">You wrote</span>
          {v && <span className={`label normal-case tracking-normal ${v.cls}`}>{v.label}</span>}
        </div>
        <div className="mt-0.5 flex items-start gap-3">
          {line.imageRef && (
            // eslint-disable-next-line @next/next/no-img-element -- the student's own photo
            <img src={`/api/images/${line.imageRef}`} alt="Your work" className="h-auto max-h-28 w-auto max-w-[45%] border border-rule-soft bg-white object-contain" />
          )}
          <StudentText text={line.readAs ?? line.latexOrText} />
        </div>
        {line.readAs && <p className="label mt-0.5 normal-case tracking-normal text-faint">That&rsquo;s how Chiron read it — if it&rsquo;s wrong, type the line instead.</p>}
        {line.feedback && <Markdown className="prose-note mt-1 text-[15px]">{line.feedback}</Markdown>}
      </div>
    </div>
  );
}

/** A quiet, dismissible check-for-understanding question. Never blocks Next step. */
export function CheckQuestion({
  question,
  check,
  onAnswer,
  onDismiss,
}: {
  question: string;
  check: NonNullable<ClientBoard["activeCheck"]>;
  onAnswer: (answer: string) => Promise<void>;
  onDismiss: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  return (
    <div className="settle mt-2 border-l-2 border-marker pl-4" aria-label="Quick check">
      <div className="flex items-baseline gap-3">
        <span className="label">Quick check</span>
        <Markdown className="prose-note min-w-0 flex-1 text-[15px] text-ink-soft">{question}</Markdown>
        {!check.feedback && (
          <button onClick={onDismiss} className="label shrink-0 hover:text-ink">
            Dismiss
          </button>
        )}
      </div>
      {check.feedback ? (
        <div className="mt-1">
          <p className="font-serif text-[15px] text-student italic">{check.answer}</p>
          <Markdown className="prose-note text-[15px]">{check.feedback}</Markdown>
        </div>
      ) : (
        <form
          className="mt-1.5 flex items-baseline gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!answer.trim() || sending) return;
            setSending(true);
            try {
              await onAnswer(answer.trim());
            } finally {
              setSending(false);
            }
          }}
        >
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer (optional)"
            className="min-w-0 flex-1 border-b border-rule bg-transparent py-0.5 font-serif text-[15px] text-ink outline-none placeholder:text-faint focus:border-chiron"
            aria-label="Your answer"
          />
          {sending ? <span className="breathe inline-block h-1.5 w-1.5 rounded-full bg-chiron" /> : (
            <button type="submit" disabled={!answer.trim()} className="label text-chiron hover:text-ink disabled:opacity-30">
              Answer
            </button>
          )}
        </form>
      )}
    </div>
  );
}
