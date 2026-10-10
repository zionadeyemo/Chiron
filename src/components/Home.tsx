"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CourseSummary } from "@/lib/board/types";
import { api } from "@/lib/client/api";
import { useMode, withMode } from "@/lib/client/mode";

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function statusLine(s: CourseSummary) {
  if (!s.problemCount) return "no problems yet";
  const parts = [s.status.in_progress && `${s.status.in_progress} in progress`, s.status.independent && `${s.status.independent} on your own`, s.status.solved && `${s.status.solved} solved`];
  return parts.filter(Boolean).join(" · ");
}

function CourseRow({ summary, onRename, onArchive }: { summary: CourseSummary; onRename: (name: string) => void; onArchive: (archived: boolean) => void }) {
  const { course } = summary;
  const [editing, setEditing] = useState<string | null>(null);

  if (editing !== null) {
    return (
      <li className="border-b border-rule py-3">
        <form
          className="flex items-baseline gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (editing.trim()) onRename(editing.trim());
            setEditing(null);
          }}
        >
          <input
            autoFocus
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
            className="min-w-0 flex-1 border-b border-chiron bg-transparent py-1 font-serif text-[20px] text-ink outline-none"
            aria-label="Course name"
          />
          <button type="button" onClick={() => setEditing(null)} className="label hover:text-ink">
            Cancel
          </button>
          <button type="submit" className="label text-chiron hover:text-ink">
            Save
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="group flex items-baseline gap-4 border-b border-rule">
      <Link href={`/course/${course.id}`} className={`flex min-w-0 flex-1 items-baseline gap-4 py-4 ${course.archived ? "opacity-60" : ""}`}>
        <span className="min-w-0 flex-1 truncate font-serif text-[20px] text-ink group-hover:text-chiron">{course.name}</span>
        <span className="shrink-0 font-mono text-[11px] text-faint">
          {statusLine(summary)} · {when(summary.lastActivity)}
        </span>
      </Link>
      <span className="flex shrink-0 gap-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button onClick={() => setEditing(course.name)} className="label hover:text-ink">
          Rename
        </button>
        <button onClick={() => onArchive(!course.archived)} className="label hover:text-ink">
          {course.archived ? "Restore" : "Archive"}
        </button>
      </span>
    </li>
  );
}

/** Home: the student's courses. Nothing else. */
export function Home() {
  const mode = useMode();
  const router = useRouter();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.status>> | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => api.listCourses().then(setCourses, () => setCourses([]));
  useEffect(() => {
    void reload();
    api.status().then(setStatus, () => undefined);
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const { course } = await api.createCourse(name.trim(), mode);
      router.push(`/course/${course.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  const update = async (id: string, patch: { name?: string; archived?: boolean }) => {
    try {
      await api.updateCourse(id, patch);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const active = courses?.filter((c) => !c.course.archived) ?? [];
  const archived = courses?.filter((c) => c.course.archived) ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col px-8 pt-20 pb-16">
      <div className="font-mono text-[13px] font-medium tracking-[0.32em] text-ink">CHIRON</div>
      <h1 className="mt-6 max-w-[24ch] font-serif text-[36px] leading-[1.15] font-normal tracking-[-0.01em] text-ink">One step at a time, only as much as you need.</h1>

      <section className="mt-12">
        <h2 className="label">Your courses</h2>
        <ul className="mt-3 border-t border-rule">
          {active.map((s) => (
            <CourseRow key={s.course.id} summary={s} onRename={(n) => update(s.course.id, { name: n })} onArchive={(a) => update(s.course.id, { archived: a })} />
          ))}
        </ul>
        <form onSubmit={create} className="mt-4 flex items-baseline gap-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={active.length ? "Add a course, e.g. AERO 304 — Structural Analysis" : "Name your course, e.g. AERO 304 — Structural Analysis"}
            className="min-w-0 flex-1 border-b border-rule bg-transparent py-1.5 font-serif text-[17px] text-ink outline-none placeholder:text-faint focus:border-chiron"
            aria-label="New course name"
          />
          <button type="submit" disabled={!name.trim() || creating} className="label text-chiron hover:text-ink disabled:opacity-30">
            {creating ? "Creating…" : "Create course"}
          </button>
        </form>
        {error && <p className="mt-2 font-serif text-[15px] text-oxblood">{error}</p>}

        {archived.length > 0 && (
          <div className="mt-8">
            <button onClick={() => setShowArchived((v) => !v)} className="label hover:text-ink" aria-expanded={showArchived}>
              {showArchived ? "Hide" : "Show"} archived ({archived.length})
            </button>
            {showArchived && (
              <ul className="mt-2 border-t border-rule">
                {archived.map((s) => (
                  <CourseRow key={s.course.id} summary={s} onRename={(n) => update(s.course.id, { name: n })} onArchive={(a) => update(s.course.id, { archived: a })} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <p className="mt-12 font-serif text-[16px] text-muted">
        Or see it work first:{" "}
        <Link href={withMode("/demo", mode)} className="text-chiron underline decoration-rule underline-offset-4 hover:decoration-chiron">
          the demo problem
        </Link>{" "}
        — a propped cantilever in Structural Mechanics.
      </p>

      {status?.tutor === "no_key" && (
        <p className="mt-6 border-l-2 border-oxblood pl-4 font-serif text-[15px] text-oxblood">
          No API key found. Add <code className="font-mono text-[13px]">LLM_API_KEY=…</code> to <code className="font-mono text-[13px]">.env.local</code> and restart the dev server.
        </p>
      )}
      {status?.tutor === "live" && status.models && (
        <p className="label mt-auto pt-16 normal-case tracking-normal text-faint">
          {status.provider} · planner {status.models.strong} · chat {status.models.fast}
        </p>
      )}
    </main>
  );
}
