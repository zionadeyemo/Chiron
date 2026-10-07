"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionSummary } from "@/lib/events";

interface Row {
  id: string;
  task: string;
  course: string;
  isDemo: boolean;
  mock: boolean;
  startedAt: string;
  summary: SessionSummary;
}

function aggregate(rows: Row[]) {
  const sum = (f: (s: SessionSummary) => number) => rows.reduce((a, r) => a + f(r.summary), 0);
  const responses = sum((s) => s.responses);
  const words = rows.reduce((a, r) => a + r.summary.avgWords * r.summary.responses, 0);
  const jr = sum((s) => s.feedback.just_right);
  const tm = sum((s) => s.feedback.too_much);
  const tl = sum((s) => s.feedback.too_little);
  const rated = jr + tm + tl;
  return {
    sessions: rows.length,
    minutes: Math.round(sum((s) => s.durationMinutes)),
    questions: sum((s) => s.questions),
    avgWords: responses ? Math.round(words / responses) : 0,
    jr,
    tm,
    tl,
    justRightShare: rated ? Math.round((jr / rated) * 100) : null,
    explainMore: sum((s) => s.explainMore),
    corrections: sum((s) => s.learnerCorrections),
    caught: sum((s) => s.wrongStepsCaught),
    flagged: sum((s) => s.flaggedErrors),
  };
}

export function ResearchIndex() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [includeMock, setIncludeMock] = useState(false);

  useEffect(() => {
    fetch("/api/research")
      .then((r) => r.json())
      .then(setRows, () => setRows([]));
  }, []);

  if (!rows) return <span className="breathe m-10 inline-block h-2 w-2 rounded-full bg-chiron" />;
  const shown = rows.filter((r) => includeMock || !r.mock);
  const byMode = (["chiron", "baseline"] as const).map((m) => ({ mode: m, ...aggregate(shown.filter((r) => r.summary.mode === m && r.summary.responses > 0)) }));

  return (
    <main className="mx-auto max-w-[1180px] px-10 pt-14 pb-20">
      <div className="flex items-baseline gap-5">
        <Link href="/" className="font-mono text-[13px] font-medium tracking-[0.32em] text-ink">
          CHIRON
        </Link>
        <span className="label">Research log · internal</span>
        <label className="label ml-auto flex items-center gap-2 normal-case tracking-normal">
          <input type="checkbox" checked={includeMock} onChange={(e) => setIncludeMock(e.target.checked)} />
          include mock-tutor sessions
        </label>
      </div>

      <h1 className="mt-10 font-serif text-[30px] text-ink">Chiron vs. baseline</h1>
      <p className="mt-1 max-w-[70ch] font-serif text-[15px] text-muted">
        Success: most students prefer Chiron, &ldquo;just right&rdquo; is the most common rating, and no wrong answer goes uncorrected (check flagged
        errors below). Sessions with no responses are excluded.
      </p>
      <table className="mt-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-ink-soft">
            {["Mode", "Sessions", "Minutes", "Questions", "Avg words", "Just right", "Too much", "Too little", "JR share", "Explain more", "Corrections", "Wrong steps caught", "Flagged errors"].map((h) => (
              <th key={h} className="label py-2 pr-3 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-[13px] text-ink">
          {byMode.map((a) => (
            <tr key={a.mode} className="border-b border-rule">
              <td className="py-2.5 pr-3 font-serif text-[15px]">{a.mode}</td>
              <td className="pr-3">{a.sessions}</td>
              <td className="pr-3">{a.minutes}</td>
              <td className="pr-3">{a.questions}</td>
              <td className="pr-3">{a.avgWords}</td>
              <td className="pr-3">{a.jr}</td>
              <td className="pr-3">{a.tm}</td>
              <td className="pr-3">{a.tl}</td>
              <td className="pr-3">{a.justRightShare == null ? "—" : `${a.justRightShare}%`}</td>
              <td className="pr-3">{a.explainMore}</td>
              <td className="pr-3">{a.corrections}</td>
              <td className="pr-3">{a.caught}</td>
              <td className={`pr-3 ${a.flagged ? "text-oxblood" : ""}`}>{a.flagged}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="label mt-14">Sessions</h2>
      <ul className="mt-3">
        {shown.map((r) => (
          <li key={r.id} className="grid grid-cols-[110px_1fr_auto] items-baseline gap-4 border-b border-rule-soft py-3">
            <span className="font-mono text-[11px] text-faint">
              {new Date(r.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {r.summary.mode}
              {r.mock ? " · mock" : ""}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-serif text-[15px] text-ink">{r.task}</span>
              <span className="block font-serif text-[14px] text-muted">{r.summary.sentence}</span>
            </span>
            <span className="flex gap-4">
              <Link href={`/session/${r.id}/summary`} className="label hover:text-ink">
                Summary
              </Link>
              <Link href={`/session/${r.id}`} className="label hover:text-ink">
                Open
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
