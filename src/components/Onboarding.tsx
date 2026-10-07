"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { useMode, withMode } from "@/lib/client/mode";
import { addMaterial } from "@/lib/client/material";
import type { DepthStyle, DocumentMeta } from "@/lib/types";

const YEARS = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"];
const STYLES: { style: DepthStyle; label: string; hint: string }[] = [
  { style: "hints", label: "Short hints", hint: "Just enough to get unstuck" },
  { style: "steps", label: "Step-by-step", hint: "One step at a time" },
  { style: "full", label: "Full explanations", hint: "The whole picture first" },
];

export function Onboarding() {
  const mode = useMode();
  const router = useRouter();
  const [screen, setScreen] = useState<1 | 2>(1);
  const [doc, setDoc] = useState<DocumentMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    major: "",
    year: "Junior",
    course: "",
    previousCourses: "",
    comfortableWith: "",
    style: "steps" as DepthStyle,
  });

  useEffect(() => {
    api.getProfile().then(({ profile }) => {
      if (profile)
        setForm({
          major: profile.major,
          year: profile.year || "Junior",
          course: profile.course,
          previousCourses: profile.previousCourses.join(", "),
          comfortableWith: profile.comfortableWith,
          style: profile.depth.style,
        });
    }, () => undefined);
  }, []);

  const take = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setDoc(await addMaterial(file));
    } catch (e) {
      setError((e as Error).message || "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (screen !== 1) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void take(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [screen, take]);

  const start = async () => {
    if (!doc) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveProfile(form);
      const { id } = await api.createSession({ kind: "material", mode, documentId: doc.id });
      router.push(`/session/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-[680px] flex-col px-8 pt-20 pb-16">
      <div className="flex items-baseline justify-between">
        <Link href={withMode("/", mode)} className="font-mono text-[13px] font-medium tracking-[0.32em] text-ink">
          CHIRON
        </Link>
        <span className="label">{screen} / 2</span>
      </div>

      {screen === 1 ? (
        <section className="settle mt-14">
          <h1 className="font-serif text-[34px] leading-tight text-ink">What are you working on?</h1>
          <p className="mt-2 font-serif text-[17px] text-muted">A PDF of your problem set or notes, or a screenshot of the problem.</p>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void take(e.dataTransfer.files[0]);
            }}
            className={`mt-8 flex w-full flex-col items-center justify-center gap-2 border border-dashed px-6 py-14 text-center transition-colors ${dragging ? "border-chiron bg-paper" : "border-faint/60 hover:border-chiron hover:bg-paper/60"}`}
          >
            {busy ? (
              <span className="breathe inline-block h-2 w-2 rounded-full bg-chiron" />
            ) : doc ? (
              <>
                <span className="font-serif text-[19px] text-ink">{doc.title}</span>
                <span className="label normal-case tracking-normal">
                  {doc.kind === "pdf" ? `${doc.pageCount} pages` : "screenshot"} · click to replace
                </span>
              </>
            ) : (
              <>
                <span className="font-serif text-[19px] text-ink">Drop a PDF here, or click to choose</span>
                <span className="label normal-case tracking-normal">or press Ctrl+V to paste a screenshot</span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void take(e.target.files?.[0])}
          />
          {error && <p className="mt-3 font-serif text-[15px] text-oxblood">{error}</p>}

          <div className="mt-10 flex items-center justify-between">
            <Link href={withMode("/demo", mode)} className="label hover:text-ink">
              or try the demo problem
            </Link>
            <button onClick={() => setScreen(2)} disabled={!doc || busy} className="label text-chiron hover:text-ink disabled:opacity-30">
              Continue →
            </button>
          </div>
        </section>
      ) : (
        <form
          className="settle mt-14"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <h1 className="font-serif text-[34px] leading-tight text-ink">Tell Chiron enough to teach you well.</h1>
          <p className="mt-2 font-serif text-[17px] text-muted">So it can skip what you know and go deeper where you need it.</p>

          <div className="mt-9 grid grid-cols-[1fr_160px] gap-x-6 gap-y-6">
            <Field label="Major">
              <input required value={form.major} onChange={(e) => setForm({ ...form, major: e.target.value })} placeholder="Aerospace Engineering" className={inputCls} />
            </Field>
            <Field label="Year">
              <select value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className={inputCls}>
                {YEARS.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </Field>
            <Field label="Current course" wide>
              <input required value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} placeholder="Structural Mechanics" className={inputCls} />
            </Field>
            <Field label="Previous relevant courses" wide>
              <input
                value={form.previousCourses}
                onChange={(e) => setForm({ ...form, previousCourses: e.target.value })}
                placeholder="Statics, Mechanics of Materials, Linear Algebra"
                className={inputCls}
              />
            </Field>
            <Field label="Comfortable with (optional)" wide>
              <input
                value={form.comfortableWith}
                onChange={(e) => setForm({ ...form, comfortableWith: e.target.value })}
                placeholder="Free-body diagrams, integration, matrix algebra"
                className={inputCls}
              />
            </Field>
          </div>

          <fieldset className="mt-8">
            <legend className="label">I usually want</legend>
            <div className="mt-2 grid grid-cols-3 border-t border-rule">
              {STYLES.map((s) => (
                <button
                  key={s.style}
                  type="button"
                  onClick={() => setForm({ ...form, style: s.style })}
                  aria-pressed={form.style === s.style}
                  className={`border-b-2 px-1 py-3 text-left transition-colors ${form.style === s.style ? "border-chiron" : "border-transparent hover:border-rule"}`}
                >
                  <span className={`block font-serif text-[17px] ${form.style === s.style ? "text-ink" : "text-ink-soft"}`}>{s.label}</span>
                  <span className="block font-serif text-[14px] text-muted">{s.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {error && <p className="mt-4 font-serif text-[15px] text-oxblood">{error}</p>}

          <div className="mt-10 flex items-center justify-between">
            <button type="button" onClick={() => setScreen(1)} className="label hover:text-ink">
              ← Back
            </button>
            <button
              type="submit"
              disabled={busy || !form.major.trim() || !form.course.trim()}
              className="border border-chiron px-5 py-2.5 font-mono text-[12px] tracking-[0.14em] text-chiron uppercase transition-colors hover:bg-chiron hover:text-paper disabled:opacity-30"
            >
              {busy ? "Starting…" : "Start session"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

const inputCls = "w-full border-b border-rule bg-transparent py-1.5 font-serif text-[17px] text-ink outline-none placeholder:text-faint focus:border-chiron";

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

