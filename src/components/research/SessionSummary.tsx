"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionSummary as Summary } from "@/lib/events";
import type { SessionBundle } from "@/lib/types";

type Data = SessionBundle & { summary: Summary };

const FEEDBACK_LABEL = { too_much: "too much", just_right: "just right", too_little: "too little" } as const;

export function SessionSummary({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${id}/summary`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error))))
      .then(setData, (e) => setError(e.message));
  }, [id]);

  if (error) return <p className="p-10 font-serif text-oxblood">{error}</p>;
  if (!data) return <span className="breathe m-10 inline-block h-2 w-2 rounded-full bg-chiron" />;
  const { summary: s, session } = data;

  const metrics: [string, string | number][] = [
    ["Mode", s.mode],
    ["Duration", `${s.durationMinutes} min`],
    ["Questions", s.questions],
    ["Avg / median words", `${s.avgWords} / ${s.medianWords}`],
    ["Depth per response", Object.entries(s.depthCounts).map(([k, v]) => `${k}×${v}`).join("  ") || "—"],
    ["Just right · too much · too little", `${s.feedback.just_right} · ${s.feedback.too_much} · ${s.feedback.too_little}  (${s.feedback.unrated} unrated)`],
    ["Explain more", s.explainMore],
    ["Learner-model corrections", s.learnerCorrections],
    ["Task / step corrections", s.contextCorrections],
    ["Side questions opened · closed", `${s.sideOpened} · ${s.sideClosed}`],
    ["Wrong student steps caught", s.wrongStepsCaught],
    ["Errors flagged by student", s.flaggedErrors],
    ["Responses math-verified", `${s.verifiedResponses} of ${s.responses}`],
  ];

  return (
    <main className="mx-auto max-w-[1100px] px-10 pt-14 pb-20">
      <div className="flex items-baseline gap-5">
        <Link href="/" className="font-mono text-[13px] font-medium tracking-[0.32em] text-ink">
          CHIRON
        </Link>
        <span className="label">Session summary · internal</span>
        <div className="ml-auto flex gap-5">
          <Link href={`/session/${id}`} className="label hover:text-ink">
            Back to session
          </Link>
          <a href={`/api/sessions/${id}/events`} className="label hover:text-ink">
            Event log (JSONL)
          </a>
          <Link href="/research" className="label hover:text-ink">
            All sessions
          </Link>
        </div>
      </div>

      <p className="mt-10 max-w-[60ch] font-serif text-[26px] leading-snug text-ink">{s.sentence}</p>
      <p className="mt-2 font-serif text-[15px] text-muted">
        {session.task.label} · {session.course.name} · started {new Date(session.startedAt).toLocaleString()}
      </p>

      <dl className="mt-10 grid grid-cols-2 gap-x-12 border-t border-rule md:grid-cols-3">
        {metrics.map(([k, v]) => (
          <div key={k} className="border-b border-rule-soft py-3">
            <dt className="label">{k}</dt>
            <dd className="mt-0.5 font-mono text-[14px] text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="label mt-14">Turns</h2>
      <table className="mt-3 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-ink-soft">
            {["#", "Student", "Depth / target", "Words / budget", "Rating", "Checked", "Claim", "Side", "Flag", "ms"].map((h) => (
              <th key={h} className="label py-2 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-[12px] text-ink-soft">
          {session.turns.map((t, i) => (
            <tr key={t.id} className="border-b border-rule-soft align-top">
              <td className="py-2 pr-4 text-faint">{i + 1}</td>
              <td className="max-w-[340px] py-2 pr-4 font-serif text-[14px] text-ink">
                {t.kind === "explain_more" ? <span className="label">explain more</span> : t.question}
              </td>
              <td className="py-2 pr-4">{t.depth == null ? "—" : `L${t.depth} / L${t.targetDepth}`}</td>
              <td className={`py-2 pr-4 ${t.wordBudget && t.words > t.wordBudget ? "text-oxblood" : ""}`}>
                {t.words}
                {t.wordBudget ? ` / ${t.wordBudget}` : ""}
              </td>
              <td className="py-2 pr-4">{t.feedback ? FEEDBACK_LABEL[t.feedback] : "—"}</td>
              <td className="py-2 pr-4 text-verified">{t.verified ? `✓ ${t.mathCalls.length}` : ""}</td>
              <td className={`py-2 pr-4 ${t.studentClaim?.verdict === "incorrect" ? "text-oxblood" : ""}`}>{t.studentClaim?.verdict ?? ""}</td>
              <td className="py-2 pr-4">{t.sideQuestion !== "none" ? t.sideQuestion : t.inSideQuestion ? "·" : ""}</td>
              <td className="py-2 pr-4 text-oxblood">{t.flagged ? "⚑" : ""}</td>
              <td className="py-2 pr-4 text-faint">{t.latencyMs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
