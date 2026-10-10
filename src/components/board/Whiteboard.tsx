"use client";

import type { ClientBoard, ClientStep } from "@/lib/board/types";
import { ProblemCard } from "./ProblemCard";
import { StepView } from "./StepView";

type StepExtras = Pick<React.ComponentProps<typeof StepView>, "onTooBig" | "onTooSmall" | "onFill" | "disabled">;

export interface WhiteboardProps {
  board: ClientBoard | null;
  pageLabel?: string;
  busy: boolean;
  onActivate: (stepIndex: number) => void;
  onEditStatement: (statement: string) => Promise<void>;
  onOpenPage?: () => void;
  /** Rendered pinned at the bottom of the board (the step controls). */
  controls?: React.ReactNode;
  /** Extra content after a step (hint notes, student lines, check questions). */
  renderAfterStep?: (stepIndex: number) => React.ReactNode;
  /** Inside a step, under its math (the check question). */
  renderInStep?: (step: ClientStep) => React.ReactNode;
  stepExtras?: (step: ClientStep) => StepExtras;
  onRetryPlan?: () => void;
}

/** The working surface: the problem, then the steps revealed so far, one idea per step. */
export function Whiteboard({ board, pageLabel, onActivate, onEditStatement, onOpenPage, controls, renderAfterStep, renderInStep, stepExtras, onRetryPlan }: WhiteboardProps) {
  if (!board) {
    return (
      <section className="flex min-h-0 flex-col bg-paper" aria-label="Whiteboard">
        <div className="flex flex-1 items-center justify-center px-10">
          <div className="max-w-[44ch] text-center">
            <p className="font-serif text-[22px] leading-snug text-ink">Start with a problem.</p>
            <p className="mt-3 font-serif text-[16px] leading-relaxed text-muted">
              Paste or type it in the chat — text or a screenshot. Chiron writes the setup here, then one step at a time, only when you want it.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col bg-paper" aria-label="Whiteboard">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-8 pt-7 pb-16">
          <ProblemCard problem={board.problem} pageLabel={pageLabel} onEdit={onEditStatement} onOpenPage={onOpenPage} />
          <div className="mt-3">
            {board.steps.map((step) => (
              <div key={`${board.planVersion}-${step.index}`}>
                <StepView step={step} active={board.activeStepIndex === step.index} onActivate={() => onActivate(step.index)} {...stepExtras?.(step)}>
                  {renderInStep?.(step)}
                </StepView>
                {renderAfterStep?.(step.index)}
              </div>
            ))}
          </div>
          {board.problem.status === "planning" && (
            <p className="mt-6 flex items-center gap-2 pl-[60px] font-serif text-[15px] italic text-muted">
              <span className="breathe inline-block h-1.5 w-1.5 rounded-full bg-chiron" /> Working through the problem…
            </p>
          )}
          {board.problem.status === "failed" && (
            <div className="mt-6 pl-[60px]">
              <p className="font-serif text-[15px] text-oxblood">{board.problem.planError ?? "Chiron couldn't work this one out."}</p>
              {onRetryPlan && (
                <button onClick={onRetryPlan} className="label mt-1 text-oxblood hover:text-ink">
                  Try again
                </button>
              )}
            </div>
          )}
          {board.completed && (
            <p className="mt-6 pl-[60px] font-serif text-[15px] text-verified">
              {board.completed === "student" ? "Solved — you got there." : "That's the full solution."}
            </p>
          )}
        </div>
      </div>
      {controls}
    </section>
  );
}
