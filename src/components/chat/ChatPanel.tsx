"use client";

import { forwardRef, useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/board/types";
import type { ComposerMode } from "@/lib/client/api";
import { Markdown } from "../Markdown";
import { Composer, type ComposerHandle } from "./Composer";

export interface PendingSend {
  text: string;
  imageCount: number;
  explainMore: boolean;
}

interface Props {
  messages: ChatMessage[];
  pending: PendingSend | null;
  error: { message: string; retry: () => void } | null;
  mode: ComposerMode;
  busy: boolean;
  onModeChange: (mode: ComposerMode) => void;
  onSend: (input: { text: string; imageRefs: string[]; mode: ComposerMode }) => Promise<boolean>;
  onExplainMore: (messageId: string) => void;
  onChip: (messageId: string, answer: "yes" | "no") => void;
}

function Images({ refs }: { refs?: string[] }) {
  if (!refs?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap justify-end gap-2">
      {refs.map((r) => (
        // eslint-disable-next-line @next/next/no-img-element -- the student's own upload
        <img key={r} src={`/api/images/${r}`} alt="Attached" className="h-auto max-h-24 w-auto max-w-[240px] border border-rule bg-white object-contain" />
      ))}
    </div>
  );
}

function StudentMessage({ m, onChip, busy }: { m: ChatMessage; onChip: Props["onChip"]; busy: boolean }) {
  return (
    <div className="flex flex-col items-end pl-10 text-right">
      {m.mode && m.mode !== "normal" && <span className="label mb-0.5">{m.mode === "new_problem" ? "new problem" : "my work"}</span>}
      {m.text && <p className="font-serif text-[15.5px] leading-snug whitespace-pre-wrap text-ink-soft italic">{m.text.length > 600 ? m.text.slice(0, 600) + "…" : m.text}</p>}
      <Images refs={m.imageRefs} />
      {m.chip && !m.chip.resolved && (
        <div className="settle mt-2 flex items-baseline gap-3 border-l-2 border-chiron/40 pl-3 text-left">
          <span className="font-serif text-[15px] text-chiron">Start this as a new problem?</span>
          <button onClick={() => onChip(m.id, "yes")} disabled={busy} className="label text-chiron hover:text-ink disabled:opacity-40">
            Yes
          </button>
          <button onClick={() => onChip(m.id, "no")} disabled={busy} className="label hover:text-ink disabled:opacity-40">
            No, it&rsquo;s a question
          </button>
        </div>
      )}
    </div>
  );
}

function ChironMessage({ m, isLatestAnswer, busy, onExplainMore }: { m: ChatMessage; isLatestAnswer: boolean; busy: boolean; onExplainMore: () => void }) {
  const canDeepen = m.depth != null && m.depth < 4;
  return (
    <div className="group">
      {m.explainMoreOf && <div className="label mb-1">explain more</div>}
      <div className="border-l-2 border-chiron/60 pl-4">
        <Markdown className="prose-note">{m.text}</Markdown>
        {m.depth != null && (
          <div className={`mt-1 flex items-center gap-3 font-mono text-[11px] transition-opacity ${isLatestAnswer ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
            <button
              onClick={onExplainMore}
              disabled={busy || !canDeepen}
              title={canDeepen ? "One level deeper" : "Already at the deepest level"}
              className="text-chiron hover:text-ink disabled:opacity-35"
            >
              Explain more
            </button>
            {m.mock && <span className="text-oxblood">mock</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** The conversation about the board. Answers don't advance the whiteboard. */
export const ChatPanel = forwardRef<ComposerHandle, Props>(function ChatPanel(props, composerRef) {
  const { messages, pending, error, mode, busy } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const latestAnswer = [...messages].reverse().find((m) => m.role === "chiron" && m.depth != null)?.id;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending, error]);

  return (
    <section className="flex min-h-0 flex-col border-l border-rule bg-paper/60" aria-label="Chiron">
      <div className="flex h-11 shrink-0 items-center border-b border-rule px-4">
        <span className="label">Chiron</span>
        <button
          onClick={() => props.onModeChange(mode === "new_problem" ? "normal" : "new_problem")}
          aria-pressed={mode === "new_problem"}
          className={`ml-auto font-mono text-[11px] uppercase tracking-[0.08em] ${mode === "new_problem" ? "text-ink underline decoration-chiron underline-offset-4" : "text-chiron hover:text-ink"}`}
        >
          + New problem
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pt-5 pb-4">
        {messages.length === 0 && !pending && (
          <p className="prose-note max-w-[34ch] text-chiron-soft">Paste a problem to start, or just ask a question.</p>
        )}
        {messages.map((m) =>
          m.role === "student" ? (
            <StudentMessage key={m.id} m={m} onChip={props.onChip} busy={busy} />
          ) : (
            <ChironMessage key={m.id} m={m} isLatestAnswer={m.id === latestAnswer} busy={busy} onExplainMore={() => props.onExplainMore(m.id)} />
          ),
        )}
        {pending && (
          <div className="settle space-y-2">
            {!pending.explainMore && (pending.text || pending.imageCount > 0) && (
              <div className="flex flex-col items-end pl-10 text-right">
                {pending.text && <p className="font-serif text-[15.5px] leading-snug whitespace-pre-wrap text-ink-soft italic">{pending.text.slice(0, 600)}</p>}
                {pending.imageCount > 0 && <span className="label">{pending.imageCount === 1 ? "1 image" : `${pending.imageCount} images`}</span>}
              </div>
            )}
            <div className="flex items-center gap-2 border-l-2 border-chiron/25 py-1 pl-4">
              <span className="breathe inline-block h-1.5 w-1.5 rounded-full bg-chiron" />
            </div>
          </div>
        )}
        {error && (
          <div className="settle border-l-2 border-oxblood pl-4">
            <p className="font-serif text-[15px] text-oxblood">{error.message}</p>
            <button onClick={error.retry} className="label mt-1 text-oxblood hover:text-ink">
              Try again
            </button>
          </div>
        )}
      </div>

      <Composer ref={composerRef} mode={mode} busy={busy} onModeChange={props.onModeChange} onSend={props.onSend} />
    </section>
  );
});
