"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { useMode } from "@/lib/client/mode";

export function StartDemo() {
  const mode = useMode();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api.demo(mode).then(
      ({ courseId }) => router.replace(`/course/${courseId}`),
      (e) => setError(e.message),
    );
  }, [mode, router]);

  return (
    <main className="flex h-screen items-center justify-center">
      {error ? (
        <p className="font-serif text-oxblood">{error}</p>
      ) : (
        <p className="flex items-center gap-3 font-serif text-[16px] text-muted italic">
          <span className="breathe inline-block h-2 w-2 rounded-full bg-chiron" /> Setting up Problem 7.18…
        </p>
      )}
    </main>
  );
}
