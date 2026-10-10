"use client";

import type { ClientStep, Setup } from "@/lib/board/types";
import { Markdown } from "../Markdown";
import { Tex } from "./Tex";

function SetupBody({ setup }: { setup: Setup }) {
  const rows: [string, string[]][] = [
    ["Given", setup.given],
    ["Find", setup.find],
    ["Assumptions", setup.assumptions],
  ];
  return (
    <dl className="grid grid-cols-[92px_1fr] gap-x-4 gap-y-2">
      {rows
        .filter(([, lines]) => lines.length)
        .map(([label, lines]) => (
          <div key={label} className="contents">
            <dt className="label pt-[3px]">{label}</dt>
            <dd>
              <ul className="space-y-0.5">
                {lines.map((l, i) => (
                  <li key={i}>
                    <Markdown className="prose-note text-ink">{l}</Markdown>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
    </dl>
  );
}

interface Props {
  step: ClientStep;
  active: boolean;
  onActivate: () => void;
  /** Step-size feedback and scaffold fill-in (absent for the setup). */
  onTooBig?: () => void;
  onTooSmall?: () => void;
  onFill?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

/** One numbered step on the notebook page. Clicking makes it the step chat questions refer to. */
export function StepView({ step, active, onActivate, onTooBig, onTooSmall, onFill, disabled, children }: Props) {
  return (
    <article
      className={`reveal group relative grid grid-cols-[48px_1fr] gap-x-3 py-3 ${step.origin === "student" ? "student-hand" : ""}`}
      aria-label={`Step ${step.index}: ${step.title}`}
    >
      <button
        onClick={onActivate}
        className={`relative flex items-start justify-end self-stretch pt-[1px] font-mono text-[12px] ${active ? "text-chiron" : "text-faint hover:text-ink-soft"}`}
        aria-pressed={active}
        title="Ask about this step"
      >
        {/* The active step gets a thin accent rule in the margin. */}
        <span className={`absolute top-0 right-[-7px] bottom-0 w-[2px] rounded ${active ? "bg-chiron/70" : "bg-transparent"}`} />
        <span className="pr-1">{step.index === 0 ? "·" : step.index}</span>
      </button>
      <div className="min-w-0 cursor-text" onClick={onActivate}>
        <div className="flex items-baseline gap-3">
          <h3 className={`label normal-case tracking-[0.02em] ${active ? "text-ink-soft" : ""}`}>{step.title}</h3>
          {step.unverified && (
            <span className="label normal-case tracking-normal text-oxblood/80" title="The automatic check didn't confirm this step. Treat it with care.">
              couldn&rsquo;t verify this step
            </span>
          )}
          {step.origin === "student" && <span className="label normal-case tracking-normal text-student">your line</span>}
          {(onTooBig || onTooSmall) && (
            <span className="ml-auto flex gap-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100" onClick={(e) => e.stopPropagation()}>
              {onTooBig && (
                <button onClick={onTooBig} disabled={disabled} className="font-mono text-[10.5px] text-faint hover:text-ink disabled:opacity-40" title="Split this step into smaller ones">
                  Too big
                </button>
              )}
              {onTooSmall && (
                <button onClick={onTooSmall} disabled={disabled} className="font-mono text-[10.5px] text-faint hover:text-ink disabled:opacity-40" title="Use bigger steps from now on">
                  Too small
                </button>
              )}
            </span>
          )}
        </div>
        <div className="mt-1">
          {step.setup ? (
            <SetupBody setup={step.setup} />
          ) : step.latex ? (
            <Tex latex={step.latex} className="board-math" />
          ) : step.scaffoldLatex ? (
            <Tex latex={step.scaffoldLatex} className="board-math" />
          ) : null}
          {!step.filled && onFill && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFill();
              }}
              disabled={disabled}
              className="label mt-1 text-chiron hover:text-ink disabled:opacity-40"
            >
              Fill in the rest
            </button>
          )}
        </div>
        {children}
      </div>
    </article>
  );
}
