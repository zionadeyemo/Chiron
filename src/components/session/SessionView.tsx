"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { addMaterial } from "@/lib/client/material";
import { ensurePageUploaded } from "@/lib/client/pdf";
import { UNMARKED_TASK, type ConceptState, type DepthStyle, type FeedbackKind, type Location, type SessionBundle } from "@/lib/types";
import { ChironMargin, type Pending } from "../chiron/ChironMargin";
import { MaterialPane } from "../material/MaterialPane";
import { LearnerDrawer } from "./LearnerDrawer";
import { StateStrip } from "./StateStrip";

export function taskShortName(label: string) {
  if (label === UNMARKED_TASK) return "this page";
  const num = label.match(/\b\d+\.\d+[a-z]?\b/i)?.[0];
  if (num) return num;
  return label.length > 28 ? label.slice(0, 26) + "…" : label;
}

export function SessionView({ id }: { id: string }) {
  const [bundle, setBundle] = useState<SessionBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const [pointingAt, setPointingAt] = useState<string | null>(null);
  const [learnerOpen, setLearnerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tutor, setTutor] = useState<"live" | "mock" | "no_key" | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getSession(id).then(setBundle, (e) => setLoadError(e.message));
    api.status().then((s) => setTutor(s.tutor), () => undefined);
  }, [id]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // Ratings, navigation and edits are applied in order, and a question waits for them:
  // a "Too much" tapped just before asking must shape that very next answer.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const run = useCallback((fn: () => Promise<SessionBundle>) => {
    const next = queue.current.then(async () => {
      try {
        setBundle(await fn());
      } catch (e) {
        setNotice((e as Error).message);
      }
    });
    queue.current = next;
    return next;
  }, []);

  /** Make sure the model can see the pages we'll reference (PDFs are rendered client-side). */
  const preparePages = useCallback(async (b: SessionBundle) => {
    const pdfIds = new Set(b.documents.filter((d) => d.kind === "pdf").map((d) => d.id));
    const jobs: Promise<void>[] = [];
    if (pdfIds.has(b.session.location.documentId)) jobs.push(ensurePageUploaded(b.session.location.documentId, b.session.location.page));
    const t = b.session.task;
    if (t.documentId && t.page && pdfIds.has(t.documentId)) jobs.push(ensurePageUploaded(t.documentId, t.page));
    await Promise.all(jobs).catch(() => undefined); // the tutor still gets the page text/label
  }, []);

  const send = useCallback(
    async (body: { question?: string; explainMoreOf?: string }, pointing?: string) => {
      if (!bundle || pending) return;
      setError(null);
      setPending({ question: body.question ?? "", pointingAt: pointing, explainMore: !!body.explainMoreOf });
      const attempt = async () => {
        try {
          await queue.current;
          await preparePages(bundle);
          setBundle(await api.ask(id, { ...body, pointingAt: pointing }));
          setError(null);
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : "Something went wrong reaching Chiron.";
          setError({
            message: msg,
            retry: () => {
              setError(null);
              setPending({ question: body.question ?? "", pointingAt: pointing, explainMore: !!body.explainMoreOf });
              void attempt();
            },
          });
        } finally {
          setPending(null);
        }
      };
      await attempt();
    },
    [bundle, pending, id, preparePages],
  );

  const ask = (question: string) => {
    const p = pointingAt ?? undefined;
    setPointingAt(null);
    void send({ question }, p);
  };

  const rate = (turnId: string, kind: FeedbackKind) => {
    // Optimistic: the tap should feel instant.
    setBundle((b) =>
      b && {
        ...b,
        session: {
          ...b.session,
          turns: b.session.turns.map((t) => (t.id === turnId ? { ...t, feedback: t.feedback === kind ? null : kind } : t)),
        },
      },
    );
    void run(() => api.feedback(id, turnId, kind));
  };

  const navigate = (location: Location) => {
    setBundle((b) => b && { ...b, session: { ...b.session, location } });
    void run(() => api.patch(id, { location }));
  };

  // A pasted or added screenshot becomes the current problem; a PDF just opens.
  const screenshotCount = bundle?.documents.filter((d) => d.kind === "screenshot").length ?? 0;
  const addFile = useCallback(
    (file: File) =>
      run(async () => {
        const isImage = file.type.startsWith("image/");
        setNotice(isImage ? "Adding your screenshot…" : "Opening your PDF…");
        const doc = await addMaterial(file);
        await api.patch(id, { addDocument: doc.id });
        const next = await api.patch(id, { location: { documentId: doc.id, page: 1 } });
        if (doc.kind !== "screenshot") {
          setNotice("Added. Mark the problem you're on when you find it.");
          return next;
        }
        setNotice("Screenshot is now your current problem.");
        inputRef.current?.focus();
        return api.patch(id, { task: { label: `Pasted problem ${screenshotCount + 1}`, documentId: doc.id, page: 1 } });
      }),
    [run, id, screenshotCount],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      void addFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFile]);

  if (loadError) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="font-serif text-lg text-oxblood">{loadError}</p>
        <Link href="/" className="label hover:text-ink">
          Back to start
        </Link>
      </main>
    );
  }
  if (!bundle) {
    return (
      <main className="flex h-screen items-center justify-center">
        <span className="breathe inline-block h-2 w-2 rounded-full bg-chiron" />
      </main>
    );
  }

  const { session, profile, documents } = bundle;
  const taskShort = taskShortName(session.task.label);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-rule bg-paper px-5">
        <Link href="/" className="font-mono text-[13px] font-medium tracking-[0.28em] text-ink">
          CHIRON
        </Link>
        <span className="h-4 w-px bg-rule" />
        <span className="font-serif text-[16px] text-ink-soft">{session.course.name}</span>
        <span className="label normal-case tracking-normal text-faint">session</span>
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${session.mode === "chiron" ? "bg-chiron" : "border border-chiron"}`}
          title={session.mode === "chiron" ? undefined : "b"}
        />
        {tutor === "no_key" && (
          <span className="label ml-4 normal-case tracking-normal text-oxblood">No API key — add LLM_API_KEY to .env.local and restart</span>
        )}
        {tutor === "mock" && <span className="label ml-4 normal-case tracking-normal text-oxblood">Offline mock tutor (LLM_MOCK=1)</span>}
        {notice && <span className="settle label ml-4 normal-case tracking-normal text-chiron">{notice}</span>}
        <nav className="ml-auto flex items-center gap-5">
          <button onClick={() => setLearnerOpen(true)} className="label hover:text-ink">
            Learner model
          </button>
          <Link href={`/session/${id}/summary`} className="label hover:text-ink">
            Summary
          </Link>
        </nav>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(380px,34%)]">
        <MaterialPane
          documents={documents}
          location={session.location}
          task={session.task}
          onNavigate={navigate}
          onAddFile={addFile}
          onMarkProblem={(task) => run(() => api.patch(id, { task }))}
          onPointAt={(text) => {
            setPointingAt(text);
            inputRef.current?.focus();
          }}
        />
        <ChironMargin
          mode={session.mode}
          turns={session.turns}
          pending={pending}
          error={error}
          taskShort={taskShort}
          sideQuestion={session.sideQuestion}
          pointingAt={pointingAt}
          inputRef={inputRef}
          onClearPointing={() => setPointingAt(null)}
          onAsk={ask}
          onExplainMore={(turnId) => void send({ explainMoreOf: turnId })}
          onRate={rate}
          onFlag={(turnId) => run(() => api.feedback(id, turnId, "flag"))}
          onCloseSide={() => run(() => api.patch(id, { closeSideQuestion: true }))}
        />
      </div>

      <StateStrip
        session={session}
        profile={profile}
        onEditTask={(label) => run(() => api.patch(id, { task: { label, text: session.task.text } }))}
        onEditStep={(step) => run(() => api.patch(id, { step }))}
        onEditConcept={(concept: string, state: ConceptState | null) => run(() => api.editConcept(id, concept, state))}
        onOpenLearner={() => setLearnerOpen(true)}
      />

      {learnerOpen && (
        <LearnerDrawer
          profile={profile}
          onClose={() => setLearnerOpen(false)}
          onEditConcept={(concept, state) => run(() => api.editConcept(id, concept, state))}
          onSetStyle={(style: DepthStyle) => run(() => api.setDepthStyle(id, style))}
        />
      )}
    </div>
  );
}
