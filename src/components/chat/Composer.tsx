"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api, type ComposerMode } from "@/lib/client/api";

export interface ComposerHandle {
  focus: () => void;
  /** Put text into the input (e.g. a passage the student pointed at). */
  insert: (text: string) => void;
}

interface Props {
  mode: ComposerMode;
  busy: boolean;
  onModeChange: (mode: ComposerMode) => void;
  onSend: (input: { text: string; imageRefs: string[]; mode: ComposerMode }) => Promise<boolean>;
}

interface Attachment {
  key: string;
  url: string;
  ref: string | null;
  error?: string;
}

const PLACEHOLDER: Record<ComposerMode, string> = {
  normal: "Ask anything, or paste a problem…",
  new_problem: "Paste or type the problem…",
  my_work: "Type your line (LaTeX is fine) or paste a photo of your work…",
};
const MODE_LABEL: Partial<Record<ComposerMode, string>> = { new_problem: "New problem", my_work: "Check my work" };

/** The one always-visible input: text, pasted text, pasted images. Enter sends, Shift+Enter is a newline. */
export const Composer = forwardRef<ComposerHandle, Props>(function Composer({ mode, busy, onModeChange, onSend }, ref) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const uploading = attachments.some((a) => !a.ref && !a.error);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    insert: (snippet: string) => {
      setText((t) => (t.trim() ? `${t.trimEnd()}\n` : "") + `“${snippet}” `);
      inputRef.current?.focus();
    },
  }));

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const addImages = useCallback((files: File[]) => {
    for (const file of files.slice(0, 4)) {
      const key = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      setAttachments((a) => [...a, { key, url, ref: null }].slice(-4));
      api.uploadImage(file).then(
        ({ ref }) => setAttachments((a) => a.map((x) => (x.key === key ? { ...x, ref } : x))),
        (e: Error) => setAttachments((a) => a.map((x) => (x.key === key ? { ...x, error: e.message } : x))),
      );
    }
    inputRef.current?.focus();
  }, []);

  // Ctrl/Cmd+V anywhere: images attach here; text pasted outside an input lands here too.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const images = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (images.length) {
        e.preventDefault();
        addImages(images);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const pasted = e.clipboardData?.getData("text/plain");
      if (pasted) {
        e.preventDefault();
        setText((t) => t + pasted);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImages]);

  const send = async () => {
    const refs = attachments.filter((a) => a.ref).map((a) => a.ref!);
    if (busy || uploading || (!text.trim() && !refs.length)) return;
    const sent = { text: text.trim(), imageRefs: refs, mode };
    setText("");
    setAttachments([]);
    const ok = await onSend(sent);
    if (!ok) {
      // Keep what they wrote if it didn't go through.
      setText(sent.text);
    }
    inputRef.current?.focus();
  };

  return (
    <div className="shrink-0 border-t border-rule bg-paper px-4 pt-2.5 pb-2.5">
      {MODE_LABEL[mode] && (
        <div className="mb-1.5 flex items-baseline gap-2">
          <span className="label text-chiron">{MODE_LABEL[mode]}</span>
          <button onClick={() => onModeChange("normal")} className="label ml-auto hover:text-ink">
            Cancel
          </button>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div key={a.key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a paste */}
              <img src={a.url} alt="Pasted image" className={`h-14 w-auto max-w-[120px] border object-cover ${a.error ? "border-oxblood" : "border-rule"} ${a.ref ? "" : "opacity-60"}`} />
              <button
                onClick={() => setAttachments((x) => x.filter((y) => y.key !== a.key))}
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full border border-rule bg-paper font-mono text-[11px] leading-none text-muted hover:text-ink"
                aria-label="Remove image"
              >
                ×
              </button>
              {a.error && <span className="label absolute top-full left-0 mt-0.5 w-40 normal-case tracking-normal text-oxblood">{a.error}</span>}
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
          if (e.key === "Escape" && mode !== "normal") onModeChange("normal");
        }}
        rows={Math.min(8, Math.max(2, text.split("\n").length))}
        placeholder={PLACEHOLDER[mode]}
        className="w-full resize-none bg-transparent font-serif text-[16px] leading-snug text-ink outline-none placeholder:text-faint focus-visible:outline-none"
        aria-label={PLACEHOLDER[mode]}
      />
      <div className="mt-1 flex items-center gap-3">
        {busy ? (
          <span className="flex items-center gap-2">
            <span className="breathe inline-block h-1.5 w-1.5 rounded-full bg-chiron" />
            <span className="label normal-case tracking-normal text-faint">working…</span>
          </span>
        ) : (
          <span className="label truncate normal-case tracking-normal text-faint">Enter to send · Shift+Enter new line · Ctrl+V an image</span>
        )}
        <button
          onClick={() => void send()}
          disabled={busy || uploading || (!text.trim() && !attachments.some((a) => a.ref))}
          className="label ml-auto text-chiron hover:text-ink disabled:opacity-30"
        >
          Send
        </button>
      </div>
    </div>
  );
});
