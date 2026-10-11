"use client";

import type { CourseSummary, WorkspaceView } from "../board/types";
import type { ConceptState, DepthStyle, DocumentMeta, Mode } from "../types";

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
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check that it's running.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  return data as T;
}

/** PUT a file to a signed storage upload URL (the URL itself is the permission; no keys). */
async function putDirect(url: string, file: File, contentType = file.type) {
  let res: Response;
  try {
    res = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType, "x-upsert": "false" }, body: file });
  } catch {
    throw new ApiError("Couldn't upload the file. Check your connection and try again.", 0);
  }
  if (!res.ok) throw new ApiError(res.status === 413 ? "That file is too large." : `Upload failed (${res.status}).`, res.status);
}

export type BoardActionInput =
  | { type: "activate" | "fill" | "too_big" | "too_small"; stepIndex: number }
  | { type: "next" | "hint" | "got_it" | "resume" | "dismiss_check" }
  | { type: "answer_check"; answer: string };

export type ComposerMode = "normal" | "new_problem" | "my_work";

export const api = {
  status: () => call<{ tutor: "live" | "mock" | "no_key"; help?: string; provider?: string; models?: { strong: string; fast: string } }>("/api/status"),

  listCourses: () => call<CourseSummary[]>("/api/courses"),
  createCourse: (name: string, mode: Mode) => call<{ course: CourseSummary["course"] }>("/api/courses", { method: "POST", json: { name, mode } }),
  demo: (mode: Mode) => call<{ courseId: string }>("/api/demo", { method: "POST", json: { mode } }),

  updateCourse: (courseId: string, body: { sessionId?: string; name?: string; archived?: boolean; personalize?: boolean }) =>
    call<WorkspaceView & { course: CourseSummary["course"] }>(`/api/courses/${courseId}`, { method: "PATCH", json: body }),
  editConcept: (courseId: string, body: { sessionId: string; concept: string; state: ConceptState | null }) =>
    call<WorkspaceView>(`/api/courses/${courseId}/concepts`, { method: "POST", json: body }),
  setDepthStyle: (courseId: string, body: { sessionId: string; depthStyle: DepthStyle }) =>
    call<WorkspaceView>(`/api/courses/${courseId}/concepts`, { method: "POST", json: body }),

  open: (courseId: string) => call<WorkspaceView>(`/api/courses/${courseId}/open`, { method: "POST" }),
  view: (courseId: string, sessionId: string) => call<WorkspaceView>(`/api/courses/${courseId}?sessionId=${encodeURIComponent(sessionId)}`),

  send: (courseId: string, body: { sessionId: string; text: string; imageRefs: string[]; mode: ComposerMode; explainMoreOf?: string }) =>
    call<WorkspaceView>(`/api/courses/${courseId}/messages`, { method: "POST", json: body }),
  markProblem: (courseId: string, body: { sessionId: string; pdf: { docId: string; page: number }; text?: string }) =>
    call<WorkspaceView>(`/api/courses/${courseId}/problems`, { method: "POST", json: body }),
  chip: (courseId: string, body: { sessionId: string; messageId: string; answer: "yes" | "no" }) =>
    call<WorkspaceView>(`/api/courses/${courseId}/chip`, { method: "POST", json: body }),
  select: (courseId: string, body: { sessionId: string; problemId: string }) =>
    call<WorkspaceView>(`/api/courses/${courseId}/select`, { method: "POST", json: body }),
  attachDocument: (courseId: string, body: { sessionId: string; documentId: string }) =>
    call<WorkspaceView>(`/api/courses/${courseId}/documents`, { method: "POST", json: body }),
  action: (problemId: string, body: { sessionId: string; action: BoardActionInput }) =>
    call<WorkspaceView>(`/api/problems/${problemId}/actions`, { method: "POST", json: body }),
  plan: (problemId: string, sessionId: string) => call<WorkspaceView>(`/api/problems/${problemId}/plan`, { method: "POST", json: { sessionId } }),
  editStatement: (problemId: string, body: { sessionId: string; statement: string }) =>
    call<WorkspaceView>(`/api/problems/${problemId}`, { method: "PATCH", json: body }),

  // Uploads: ask the server for a signed URL and send the file straight to storage (deployed);
  // with no URL (local files), send it through the API as before.
  uploadImage: async (file: File) => {
    const { id, uploadUrl } = await call<{ id: string; uploadUrl: string | null }>("/api/uploads/sign", {
      method: "POST",
      json: { kind: "image", contentType: file.type, size: file.size },
    });
    if (uploadUrl) {
      await putDirect(uploadUrl, file);
      return { ref: id };
    }
    const form = new FormData();
    form.append("file", file);
    return call<{ ref: string }>("/api/uploads", { method: "POST", body: form });
  },
  uploadPdf: async (file: File) => {
    const { id, uploadUrl } = await call<{ id: string; uploadUrl: string | null }>("/api/uploads/sign", {
      method: "POST",
      json: { kind: "pdf", size: file.size },
    });
    if (uploadUrl) {
      await putDirect(uploadUrl, file, "application/pdf");
      return call<{ document: DocumentMeta }>("/api/documents", { method: "POST", json: { id, name: file.name } });
    }
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
