"use client";

import type { ClientBoard } from "@/lib/board/types";

interface Props {
  board: ClientBoard;
  working: string | null;
  onHint: () => void;
  onNext: () => void;
  onGotIt: () => void;
  onResume: () => void;
  onCheckWork: () => void;
}

function Key({ k }: { k: string }) {
  return <kbd className="ml-1.5 rounded-[3px] border border-rule px-1 font-mono text-[9.5px] text-faint">{k}</kbd>;
}

/** Pinned under the board: the student controls progression. */
export function BoardControls({ board, working, onHint, onNext, onGotIt, onResume, onCheckWork }: Props) {
  const planning = board.problem.status !== "ready" || board.planStatus == null;
  const done = !board.hasNextStep;
  const hintsSpent = board.hintLevel >= 2;
  const btn = "flex items-center font-mono text-[11.5px] uppercase tracking-[0.08em] disabled:opacity-30";

  return (
    <div className="flex h-12 shrink-0 items-center gap-6 border-t border-rule bg-paper px-8" role="toolbar" aria-label="Whiteboard controls">
      {board.studentMode === "guided" ? (
        <>
          <button onClick={onHint} disabled={planning || done || !!working} className={`${btn} text-chiron hover:text-ink`} title={hintsSpent ? "Both hints shown" : "A nudge toward the next step (H)"}>
            Hint
            <Key k="H" />
          </button>
          <button
            onClick={onNext}
            disabled={planning || done || !!working}
            className={`${btn} ${hintsSpent && !done ? "text-ink underline decoration-chiron underline-offset-4" : "text-chiron hover:text-ink"}`}
            title="Write exactly one more step (N)"
          >
            Next step
            <Key k="N" />
          </button>
          <button onClick={onGotIt} disabled={!!working} className={`${btn} text-chiron hover:text-ink`} title="Go on alone; check your work when you want (G)">
            I got it
            <Key k="G" />
          </button>
        </>
      ) : (
        <>
          <span className="font-serif text-[15px] text-muted italic">On your own from here.</span>
          <button onClick={onResume} disabled={!!working} className={`${btn} text-chiron hover:text-ink`}>
            Resume guidance
          </button>
        </>
      )}
      <span className="ml-auto flex items-center gap-4">
        {working && (
          <span className="flex items-center gap-2 font-serif text-[14px] text-muted italic">
            <span className="breathe inline-block h-1.5 w-1.5 rounded-full bg-chiron" />
            {working}
          </span>
        )}
        {!working && planning && board.problem.status === "planning" && <span className="font-serif text-[14px] text-faint italic">Next step and Hint unlock when the solution is checked.</span>}
        {!working && hintsSpent && !done && board.studentMode === "guided" && <span className="font-serif text-[14px] text-muted italic">Both hints are out — Next step writes it.</span>}
        <button onClick={onCheckWork} disabled={planning} className={`${btn} text-ink hover:text-chiron`} title="Check a line of your own work">
          Check my work
        </button>
      </span>
    </div>
  );
}
