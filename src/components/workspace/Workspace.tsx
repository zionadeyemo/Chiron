"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientStep, WorkspaceView } from "@/lib/board/types";
import { api, ApiError, type BoardActionInput, type ComposerMode } from "@/lib/client/api";
import { addPdf, withTimeout } from "@/lib/client/material";
import { ensurePageUploaded } from "@/lib/client/pdf";
import { BoardControls } from "../board/BoardControls";
import { CheckQuestion, HintNote, StudentLineView } from "../board/BoardNotes";
import { Whiteboard } from "../board/Whiteboard";
import { ChatPanel, type PendingSend } from "../chat/ChatPanel";
import type { ComposerHandle } from "../chat/Composer";
import { MaterialPane, pageLabel, type MaterialLocation } from "../material/MaterialPane";
import { AssumesPanel } from "./AssumesPanel";
import { ProblemMenu } from "./ProblemMenu";

const WORKING: Partial<Record<BoardActionInput["type"], string>> = {
  next: "Writing the next step…",
  hint: "Finding a hint…",
  too_big: "Splitting that step…",
  answer_check: "Reading your answer…",
};

export function Workspace({ courseId }: { courseId: string }) {
  const [view, setView] = useState<WorkspaceView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingSend | null>(null);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const [mode, setMode] = useState<ComposerMode>("normal");
  const [notice, setNotice] = useState<string | null>(null);
  const [tutor, setTutor] = useState<"live" | "mock" | "no_key" | null>(null);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [location, setLocation] = useState<MaterialLocation | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [assumesOpen, setAssumesOpen] = useState(false);
  const composer = useRef<ComposerHandle>(null);
  const planRequested = useRef(new Set<string>());
  const sessionId = view?.sessionId ?? "";

  useEffect(() => {
    api.open(courseId).then(
      (v) => {
        setView(v);
        const pdf = v.board?.problem.pdfRef;
        if (pdf) {
          setLocation({ documentId: pdf.docId, page: pdf.page });
          setMaterialOpen(true);
        } else if (v.documents.length) {
          setLocation({ documentId: v.documents[0].id, page: 1 });
        }
      },
      (e) => setLoadError(e.message),
    );
    api.status().then((s) => setTutor(s.tutor), () => undefined);
  }, [courseId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Requests that change state run one at a time, in order.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(fn, fn);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  /** A request that talks to the tutor: shows the working state, offers retry on failure. */
  async function converse(fn: () => Promise<WorkspaceView>, shown: PendingSend): Promise<boolean> {
    setError(null);
    setPending(shown);
    try {
      setView(await enqueue(fn));
      return true;
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Something went wrong reaching Chiron.";
      setError({
        message,
        retry: () => {
          setError(null);
          void converse(fn, shown);
        },
      });
      return false;
    } finally {
      setPending(null);
      composer.current?.focus();
    }
  }

  const quiet = useCallback(
    async (fn: () => Promise<WorkspaceView>) => {
      try {
        setView(await enqueue(fn));
      } catch (e) {
        setNotice((e as Error).message);
      }
    },
    [enqueue],
  );

  // Plan as soon as a problem needs one. Runs outside the queue: the student can keep asking
  // questions about the setup while the whole solution is worked out and checked.
  const board = view?.board ?? null;
  const planKey = board ? `${board.problem.id}:${board.planVersion}` : null;
  const needsPlan = board?.problem.status === "planning";
  const startPlan = useCallback(
    (problemId: string, key: string) => {
      planRequested.current.add(key);
      api
        .plan(problemId, sessionId)
        .then(() => enqueue(() => api.view(courseId, sessionId)))
        .then(setView, (e: Error) => setNotice(e.message))
        .finally(() => planRequested.current.delete(key));
    },
    [courseId, sessionId, enqueue],
  );
  useEffect(() => {
    if (board && needsPlan && planKey && sessionId && !planRequested.current.has(planKey)) startPlan(board.problem.id, planKey);
  }, [board, needsPlan, planKey, sessionId, startPlan]);

  const act = useCallback(
    async (action: BoardActionInput) => {
      if (!board) return;
      setWorking(WORKING[action.type] ?? null);
      try {
        setView(await enqueue(() => api.action(board.problem.id, { sessionId, action })));
        if (action.type === "too_small") setNotice("Noted — bigger steps from now on.");
      } catch (e) {
        setNotice((e as Error).message);
      } finally {
        setWorking(null);
      }
    },
    [board, enqueue, sessionId],
  );

  const checkWork = useCallback(() => {
    setMode("my_work");
    composer.current?.focus();
  }, []);

  // H / N / G when the student isn't typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
      if (!board || board.problem.status !== "ready" || pending || working) return;
      const key = e.key.toLowerCase();
      if (board.studentMode !== "guided") return;
      if (key === "h" && board.hasNextStep) void act({ type: "hint" });
      else if (key === "n" && board.hasNextStep) void act({ type: "next" });
      else if (key === "g") void act({ type: "got_it" });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [board, pending, working, act]);

  const send = async (input: { text: string; imageRefs: string[]; mode: ComposerMode }) => {
    const ok = await converse(() => api.send(courseId, { sessionId, ...input }), { text: input.text, imageCount: input.imageRefs.length, explainMore: false });
    if (ok && input.mode !== "normal") setMode("normal");
    return ok;
  };

  const markProblem = async ({ docId, page, text }: { docId: string; page: number; text?: string }) => {
    // Make sure the model can see the page (PDFs render in the browser); never block on it.
    const doc = view?.documents.find((d) => d.id === docId);
    if (doc?.kind === "pdf") await withTimeout(ensurePageUploaded(docId, page).catch(() => undefined), 8000);
    await converse(() => api.markProblem(courseId, { sessionId, pdf: { docId, page }, text }), {
      text: text ? `Problem on ${pageLabel(doc, page)}: ${text}` : `Problem on ${pageLabel(doc, page)}`,
      imageCount: 0,
      explainMore: false,
    });
  };

  const onAddPdf = async (file: File) => {
    setNotice("Opening your PDF…");
    try {
      const doc = await addPdf(file);
      await quiet(() => api.attachDocument(courseId, { sessionId, documentId: doc.id }));
      setLocation({ documentId: doc.id, page: 1 });
      setMaterialOpen(true);
      setNotice("Added. Mark the problem you're on when you find it.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  if (loadError) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="font-serif text-lg text-oxblood">{loadError}</p>
        <Link href="/" className="label hover:text-ink">
          Back to courses
        </Link>
      </main>
    );
  }
  if (!view) {
    return (
      <main className="flex h-screen items-center justify-center">
        <span className="breathe inline-block h-2 w-2 rounded-full bg-chiron" />
      </main>
    );
  }

  const pdfRef = board?.problem.pdfRef;
  const pdfDoc = pdfRef ? view.documents.find((d) => d.id === pdfRef.docId) : undefined;
  const busy = !!pending;
  const lastRevealed = board ? board.steps.length - 1 : 0;
  const ready = board?.problem.status === "ready" && board.planStatus != null;

  const renderAfterStep = (index: number) => {
    if (!board) return null;
    return (
      <>
        {board.studentLines
          .filter((l) => !l.absorbed && Math.min(l.afterStepIndex, lastRevealed) === index)
          .map((l) => (
            <StudentLineView key={l.id} line={l} />
          ))}
        {index === lastRevealed && board.studentMode === "guided" && <HintNote hints={board.hints} nextIndex={index + 1} />}
      </>
    );
  };

  const renderInStep = (step: ClientStep) =>
    board?.activeCheck && board.activeCheck.stepIndex === step.index && step.checkQuestion ? (
      <CheckQuestion question={step.checkQuestion} check={board.activeCheck} onAnswer={(answer) => act({ type: "answer_check", answer })} onDismiss={() => void act({ type: "dismiss_check" })} />
    ) : null;

  const stepExtras = (step: ClientStep) =>
    step.index === 0 || !ready
      ? {}
      : {
          disabled: !!working,
          onTooBig: () => void act({ type: "too_big", stepIndex: step.index }),
          onTooSmall: () => void act({ type: "too_small", stepIndex: step.index }),
          onFill: step.kind === "scaffold" && !step.filled ? () => void act({ type: "fill", stepIndex: step.index }) : undefined,
        };

  return (
    <div className="flex h-screen min-w-[1180px] flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-rule bg-paper px-5">
        <Link href="/" className="font-mono text-[13px] font-medium tracking-[0.28em] text-ink">
          CHIRON
        </Link>
        <span className="h-4 w-px bg-rule" />
        <span className="max-w-[28ch] truncate font-serif text-[16px] text-ink-soft">{view.course.name}</span>
        <ProblemMenu
          problems={view.problems}
          activeId={board?.problem.id ?? null}
          onSelect={(problemId) => quiet(() => api.select(courseId, { sessionId, problemId }))}
          onNew={() => {
            setMode("new_problem");
            composer.current?.focus();
          }}
        />
        {view.course.mode === "baseline" && <span className="inline-block h-1.5 w-1.5 rounded-full border border-chiron" title="b" />}
        {tutor === "no_key" && <span className="label normal-case tracking-normal text-oxblood">No API key — add LLM_API_KEY to .env.local and restart</span>}
        {tutor === "mock" && <span className="label normal-case tracking-normal text-oxblood">Offline mock tutor (LLM_MOCK=1)</span>}
        {notice && <span className="settle label normal-case tracking-normal text-chiron">{notice}</span>}
        <nav className="ml-auto flex items-center gap-5">
          {view.course.mode === "chiron" && (
            <button onClick={() => setAssumesOpen(true)} className="label hover:text-ink">
              What Chiron assumes
            </button>
          )}
          <button onClick={() => setMaterialOpen((o) => !o)} aria-pressed={materialOpen} className={`label hover:text-ink ${materialOpen ? "text-ink" : ""}`}>
            Material
          </button>
        </nav>
      </header>

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: materialOpen ? "minmax(300px, 30%) minmax(0, 1fr) minmax(360px, 400px)" : "minmax(0, 1fr) minmax(360px, 400px)" }}
      >
        {materialOpen && (
          <MaterialPane
            documents={view.documents}
            location={location}
            onNavigate={setLocation}
            onMarkProblem={(p) => void markProblem(p)}
            onPointAt={(text) => composer.current?.insert(text)}
            onAddPdf={(f) => void onAddPdf(f)}
            onClose={() => setMaterialOpen(false)}
          />
        )}
        <Whiteboard
          board={board}
          busy={busy}
          pageLabel={pdfRef ? pageLabel(pdfDoc, pdfRef.page) : undefined}
          onActivate={(stepIndex) => {
            if (board && board.activeStepIndex !== stepIndex) void quiet(() => api.action(board.problem.id, { sessionId, action: { type: "activate", stepIndex } }));
          }}
          onEditStatement={async (statement) => {
            if (!board) return;
            await quiet(() => api.editStatement(board.problem.id, { sessionId, statement }));
          }}
          onOpenPage={
            pdfRef
              ? () => {
                  setLocation({ documentId: pdfRef.docId, page: pdfRef.page });
                  setMaterialOpen(true);
                }
              : undefined
          }
          onRetryPlan={board && planKey ? () => startPlan(board.problem.id, `${planKey}:retry${Date.now()}`) : undefined}
          renderAfterStep={renderAfterStep}
          renderInStep={renderInStep}
          stepExtras={stepExtras}
          controls={
            board && view.course.mode === "chiron" ? (
              <BoardControls
                board={board}
                working={working}
                onHint={() => void act({ type: "hint" })}
                onNext={() => void act({ type: "next" })}
                onGotIt={() => void act({ type: "got_it" })}
                onResume={() => void act({ type: "resume" })}
                onCheckWork={checkWork}
              />
            ) : null
          }
        />
        <ChatPanel
          ref={composer}
          messages={view.messages}
          pending={pending}
          error={error}
          mode={mode}
          busy={busy}
          onModeChange={setMode}
          onSend={send}
          onExplainMore={(messageId) =>
            void converse(() => api.send(courseId, { sessionId, text: "", imageRefs: [], mode: "normal", explainMoreOf: messageId }), { text: "", imageCount: 0, explainMore: true })
          }
          onChip={(messageId, answer) => void converse(() => api.chip(courseId, { sessionId, messageId, answer }), { text: "", imageCount: 0, explainMore: true })}
        />
      </div>

      {assumesOpen && (
        <AssumesPanel
          view={view}
          onClose={() => setAssumesOpen(false)}
          onEditConcept={(concept, state) => void quiet(() => api.editConcept(courseId, { sessionId, concept, state }))}
          onSetStyle={(depthStyle) => void quiet(() => api.setDepthStyle(courseId, { sessionId, depthStyle }))}
          onTogglePersonalize={(personalize) => void quiet(() => api.updateCourse(courseId, { sessionId, personalize }))}
        />
      )}
    </div>
  );
}
