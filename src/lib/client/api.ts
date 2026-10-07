"use client";

import type { ConceptState, DepthStyle, DocumentMeta, FeedbackKind, Location, SessionBundle, UserProfile } from "../types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  return data as T;
}

export const api = {
  status: () => call<{ tutor: "live" | "mock" | "no_key"; provider?: string; model?: string }>("/api/status"),

  createSession: (body: { kind: "demo" | "material"; mode: "chiron" | "baseline"; documentId?: string }) =>
    call<{ id: string }>("/api/sessions", { method: "POST", json: body }),

  listSessions: () =>
    call<
      { id: string; mode: string; isDemo: boolean; course: string; task: string; turns: number; startedAt: string; lastActiveAt: string }[]
    >("/api/sessions"),

  getSession: (id: string) => call<SessionBundle>(`/api/sessions/${id}`),

  ask: (id: string, body: { question?: string; pointingAt?: string; explainMoreOf?: string }) =>
    call<SessionBundle>(`/api/sessions/${id}/ask`, { method: "POST", json: body }),

  feedback: (id: string, turnId: string, kind: FeedbackKind | "flag") =>
    call<SessionBundle>(`/api/sessions/${id}/feedback`, { method: "POST", json: { turnId, kind } }),

  patch: (
    id: string,
    body: {
      location?: Location;
      task?: { label: string; text?: string; documentId?: string; page?: number };
      step?: string;
      closeSideQuestion?: boolean;
      addDocument?: string;
    },
  ) => call<SessionBundle>(`/api/sessions/${id}`, { method: "PATCH", json: body }),

  editConcept: (id: string, concept: string, state: ConceptState | null) =>
    call<SessionBundle>(`/api/sessions/${id}/concepts`, { method: "POST", json: { concept, state } }),

  setDepthStyle: (id: string, depthStyle: DepthStyle) =>
    call<SessionBundle>(`/api/sessions/${id}/concepts`, { method: "POST", json: { depthStyle } }),

  getProfile: () => call<{ profile: UserProfile | null }>("/api/profile"),

  saveProfile: (body: { major: string; year: string; course: string; previousCourses: string; comfortableWith: string; style: DepthStyle }) =>
    call<{ profile: UserProfile }>("/api/profile", { method: "PUT", json: body }),

  upload: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call<{ document: DocumentMeta }>("/api/documents", { method: "POST", body: form });
  },

  patchDocument: (id: string, body: { pageCount?: number; pageLabels?: string[] }) =>
    call<{ document: DocumentMeta }>(`/api/documents/${id}`, { method: "PATCH", json: body }),

  pageCached: (id: string, page: number) => call<{ cached: boolean }>(`/api/documents/${id}/pages/${page}`),

  putPage: (id: string, page: number, image: string, text: string) =>
    call<{ ok: boolean }>(`/api/documents/${id}/pages/${page}`, { method: "PUT", json: { image, text } }),
};
