import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Course, Problem } from "@/lib/board/types";
import { db } from "@/lib/db";
import { readEvents } from "@/lib/events";
import {
  INTERNAL_COOKIE,
  internalAllowed,
  internalConfigured,
  passwordMatches,
  tokenFor,
} from "@/lib/internal-auth";
import { problemLine, summarize } from "@/lib/summary";

export const metadata: Metadata = {
  title: "CHIRON — validation summary",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

async function signIn(form: FormData) {
  "use server";
  if (passwordMatches(String(form.get("password") ?? ""))) {
    (await cookies()).set(INTERNAL_COOKIE, tokenFor(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/internal",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect("/internal/summary");
  }
  redirect("/internal/summary?wrong=1");
}

const fmt = (n: number | null, unit = "") => (n == null ? "—" : `${n}${unit}`);
const secs = (ms: number | null) =>
  ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="border-t border-rule py-3">
      <div className="label">{label}</div>
      <div className="mt-1 font-serif text-[26px] leading-none text-ink">
        {value}
      </div>
      {note && (
        <div className="mt-1 font-serif text-[14px] text-muted">{note}</div>
      )}
    </div>
  );
}

export default async function SummaryPage({
  searchParams,
}: PageProps<"/internal/summary">) {
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto min-h-screen max-w-[880px] px-4 pt-16 sm:px-8 pb-16">
      <div className="font-mono text-[13px] font-medium tracking-[0.32em] text-ink">
        CHIRON · INTERNAL
      </div>
      {children}
    </main>
  );

  if (!internalConfigured()) {
    return shell(
      <p className="mt-8 font-serif text-[17px] text-muted">
        Set INTERNAL_PASSWORD to enable this page.
      </p>,
    );
  }
  if (!(await internalAllowed())) {
    const { wrong } = await searchParams;
    return shell(
      <form
        action={signIn}
        className="mt-10 flex max-w-[420px] items-baseline gap-4"
      >
        <input
          type="password"
          name="password"
          autoFocus
          placeholder="Password"
          aria-label="Password"
          className="min-w-0 flex-1 border-b border-rule bg-transparent py-1.5 font-serif text-[17px] text-ink outline-none placeholder:text-faint focus:border-chiron"
        />
        <button type="submit" className="label text-chiron hover:text-ink">
          Open
        </button>
        {wrong && (
          <span className="font-serif text-[15px] text-oxblood">
            Wrong password.
          </span>
        )}
      </form>,
    );
  }

  const [events, courses, problems] = await Promise.all([
    readEvents(),
    db().list<Course>("courses"),
    db().list<Problem>("problems"),
  ]);
  const {
    problems: rows,
    sessions,
    aggregate: a,
  } = summarize(events, {
    problems: Object.fromEntries(problems.map((p) => [p.id, p.title])),
    courses: Object.fromEntries(courses.map((c) => [c.id, c.name])),
  });

  return shell(
    <>
      <h1 className="mt-6 font-serif text-[32px] leading-[1.15] font-normal text-ink">
        Validation summary
      </h1>
      <p className="mt-2 font-serif text-[16px] text-muted">
        {plural(events.length, "event")} · {plural(rows.length, "problem")} ·{" "}
        {plural(sessions.length, "session")}. Local event log only — nothing
        leaves this deployment.
      </p>

      <section className="mt-10 grid grid-cols-2 gap-x-8 sm:grid-cols-3">
        <Stat
          label='Median steps before "I got it"'
          value={fmt(a.medianRevealedBeforeGotIt)}
          note={`${a.gotItCount} of ${plural(a.problems, "problem")} pressed it`}
        />
        <Stat
          label="Hints per next step"
          value={fmt(a.hintToNextRatio)}
          note="higher = more nudges, fewer reveals"
        />
        <Stat
          label="Plans fully verified"
          value={fmt(a.plansFullyVerifiedPct, "%")}
          note={plural(a.plans, "plan")}
        />
        <Stat
          label="Completed by student"
          value={fmt(a.completedByStudentPct, "%")}
          note={`${a.completed} completed`}
        />
        <Stat
          label="Completed by full reveal"
          value={fmt(a.completedByRevealPct, "%")}
        />
        <Stat label="Wrong steps caught" value={String(a.wrongStepsCaught)} />
        <Stat label="Median time to setup" value={secs(a.medianSetupMs)} />
        <Stat label="Median time to plan" value={secs(a.medianPlanMs)} />
      </section>

      <section className="mt-12">
        <h2 className="label">Problems</h2>
        {rows.length === 0 && (
          <p className="mt-3 font-serif text-[16px] text-muted">
            No problems yet.
          </p>
        )}
        <ul className="mt-3 border-t border-rule">
          {rows.map((p) => {
            const [title, ...lines] = problemLine(p);
            const extras = [
              p.explainMore && `Explain more: ${p.explainMore}`,
              (p.stepSize.tooBig || p.stepSize.tooSmall) &&
                `Step size: ${p.stepSize.tooBig} too big, ${p.stepSize.tooSmall} too small`,
              p.checkQuestions.shown &&
                `Check questions: ${p.checkQuestions.shown} shown, ${p.checkQuestions.answered} answered, ${p.checkQuestions.dismissed} dismissed`,
              Object.keys(p.replans).length &&
                `Re-plans: ${Object.entries(p.replans)
                  .map(([r, n]) => `${n} ${r.replace(/_/g, " ")}`)
                  .join(", ")}`,
            ].filter(Boolean);
            return (
              <li key={p.problemId} className="border-b border-rule py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-serif text-[18px] text-ink">
                    {title.replace(/^Problem: /, "")}
                  </span>
                  <span className="label shrink-0">{when(p.lastAt)}</span>
                </div>
                {[...lines, ...extras].map((l) => (
                  <p
                    key={String(l)}
                    className="mt-1 font-mono text-[12.5px] leading-relaxed text-muted"
                  >
                    {l}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="label">Sessions</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-t border-rule font-mono text-[12.5px] text-muted">
            <thead>
              <tr className="text-left">
                <th className="py-2 font-normal">Started</th>
                <th className="py-2 font-normal">Course</th>
                <th className="py-2 text-right font-normal">Minutes</th>
                <th className="py-2 text-right font-normal">Problems</th>
                <th className="py-2 text-right font-normal">Events</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId} className="border-t border-rule">
                  <td className="py-2">{when(s.startedAt)}</td>
                  <td className="py-2 text-ink">{s.courseName}</td>
                  <td className="py-2 text-right">{s.minutes}</td>
                  <td className="py-2 text-right">{s.problems}</td>
                  <td className="py-2 text-right">{s.events}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>,
  );
}
