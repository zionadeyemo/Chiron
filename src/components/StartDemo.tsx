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
    api.createSession({ kind: "demo", mode }).then(
      ({ id }) => router.replace(`/session/${id}`),
      (e) => setError(e.message),
    );
  }, [mode, router]);

  return (
    <main className="flex h-screen items-center justify-center">
      {error ? <p className="font-serif text-oxblood">{error}</p> : <span className="breathe inline-block h-2 w-2 rounded-full bg-chiron" />}
    </main>
  );
}
