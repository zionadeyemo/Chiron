"use client";

import { useSearchParams } from "next/navigation";
import type { Mode } from "../types";

/** The hidden research toggle: ?mode=baseline. Anything else is Chiron. */
export function useMode(): Mode {
  return useSearchParams().get("mode") === "baseline" ? "baseline" : "chiron";
}

export const withMode = (href: string, mode: Mode) => (mode === "baseline" ? `${href}${href.includes("?") ? "&" : "?"}mode=baseline` : href);
