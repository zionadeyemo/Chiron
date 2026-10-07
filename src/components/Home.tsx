"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useMode, withMode } from "@/lib/client/mode";

type SessionRow = Awaited<ReturnType<typeof api.listSessions>>[number];

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function Home() {
  const mode = useMode();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.status>> | null>(null);
  const tutor = status?.tutor ?? null;

  useEffect(() => {
    api.listSessions().then(setSessions, () => setSessions([]));
    api.status().then(setStatus, () => undefined);
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-[760px] flex-col px-8 pt-24 pb-16">
      <div className="font-mono text-[13px] font-medium tracking-[0.32em] text-ink">CHIRON</div>
      <h1 className="mt-6 max-w-[22ch] font-serif text-[40px] leading-[1.12] font-normal tracking-[-0.01em] text-ink">
        The smallest correct step that gets you moving again.
      </h1>
      <p className="mt-5 max-w-[52ch] font-serif text-[18px] leading-relaxed text-muted">
        A tutor that sits in the margin of your coursework. It knows the problem you&rsquo;re on, answers the thing you&rsquo;re actually stuck on, checks
        its math, and tells you when you&rsquo;re wrong.
      </p>

      <div className="mt-12 flex flex-col border-t border-rule">
        <Link href={withMode("/demo", mode)} className="group flex items-baseline gap-4 border-b border-rule py-5 hover:bg-paper/70">
          <span className="label w-20 shrink-0">Demo</span>
          <span className="flex-1 font-serif text-[20px] text-ink">
            Problem 7.18 — a propped cantilever
            <span className="mt-0.5 block text-[15px] text-muted">Aerospace junior, Structural Mechanics. Seeded and ready.</span>
          </span>
          <span className="font-mono text-sm text-chiron transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
        <Link href={withMode("/start", mode)} className="group flex items-baseline gap-4 border-b border-rule py-5 hover:bg-paper/70">
          <span className="label w-20 shrink-0">Your work</span>
          <span className="flex-1 font-serif text-[20px] text-ink">
            Start a session on your own material
            <span className="mt-0.5 block text-[15px] text-muted">Upload a PDF or paste a screenshot of the problem.</span>
          </span>
          <span className="font-mono text-sm text-chiron transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      </div>

      {tutor === "no_key" && (
        <p className="mt-6 border-l-2 border-oxblood pl-4 font-serif text-[15px] text-oxblood">
          No API key found. Add <code className="font-mono text-[13px]">LLM_API_KEY=…</code> to <code className="font-mono text-[13px]">.env.local</code> and restart
          the dev server.
        </p>
      )}

      {status?.tutor === "live" && (
        <p className="label mt-6 normal-case tracking-normal text-faint">
          Tutor: {status.provider} · {status.model}
        </p>
      )}

      {sessions && sessions.length > 0 && (
        <section className="mt-16">
          <div className="flex items-baseline justify-between">
            <h2 className="label">Recent sessions</h2>
            <Link href="/research" className="label hover:text-ink">
              Research log →
            </Link>
          </div>
          <ul className="mt-3">
            {sessions.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-baseline gap-4 border-b border-rule-soft py-2.5">
                <Link href={`/session/${s.id}`} className="min-w-0 flex-1 truncate font-serif text-[16px] text-ink hover:text-chiron">
                  {s.task}
                </Link>
                <span className="font-mono text-[11px] text-faint">{s.turns} notes</span>
                <span className="w-32 text-right font-mono text-[11px] text-faint">{when(s.lastActiveAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
