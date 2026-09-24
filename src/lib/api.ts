/**
 * The browser's only way to read or write book data. Every call carries the
 * session cookie; a 401 sends the user to sign in and back to where they were.
 * The Supabase anon client (`./supabase`) remains for realtime channels only.
 */
import type { Book, Comment, Document, Version } from "./supabase";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Role = "owner" | "editor" | "viewer";
export type User = { uid: string; email: string; name: string; color: string };
export type Member = { email: string; role: Role; accepted_at: string | null; created_at: string };
export type BookWithRole = Book & { role: Role; chapters: number; words: number; owner_email?: string };
export type BookDetail = { book: Book & { owner_email?: string; share_token?: string | null; share_role?: Role }; documents: Document[]; members: Member[]; role: Role };

export async function api<T>(path: string, init?: { method?: string; body?: unknown; noRedirect?: boolean }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method || "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401 && !init?.noRedirect && typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
    throw new ApiError(401, "Sign in to continue");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data as T;
}

export const auth = {
  me: () => api<{ user: User }>("/api/auth/me", { noRedirect: true }).then((r) => r.user).catch(() => null),
  request: (email: string, redirect?: string) => api<{ ok: true }>("/api/auth/request", { method: "POST", body: { email, redirect } }),
  verify: (token: string) => api<{ ok: true; redirect: string; needsName: boolean; user: User }>("/api/auth/verify", { method: "POST", body: { token } }),
  signout: () => api<{ ok: true }>("/api/auth/signout", { method: "POST" }),
  update: (patch: { name?: string; color?: string }) => api<{ user: User }>("/api/auth/me", { method: "PATCH", body: patch }).then((r) => r.user),
};

export const books = {
  list: () => api<{ books: BookWithRole[] }>("/api/books").then((r) => r.books),
  create: (title: string, chapters?: { title: string; html: string; chapter_number: number | null }[]) =>
    api<{ book: { id: string; title: string } }>("/api/books", { method: "POST", body: { title, chapters } }).then((r) => r.book),
  get: (id: string) => api<BookDetail>(`/api/books/${id}`),
  update: (id: string, patch: { title?: string; share_enabled?: boolean; share_role?: Role; rotate?: boolean }) =>
    api<{ book: BookDetail["book"] }>(`/api/books/${id}`, { method: "PATCH", body: patch }).then((r) => r.book),
  remove: (id: string) => api<{ ok: true }>(`/api/books/${id}`, { method: "DELETE" }),
  addDocument: (id: string, doc: { title?: string; content?: string; chapter_number?: number | null; part_number?: number | null }) =>
    api<{ document: Document }>(`/api/books/${id}/documents`, { method: "POST", body: doc }).then((r) => r.document),
  invite: (id: string, email: string, role: Role) => api<{ ok: true }>(`/api/books/${id}/members`, { method: "POST", body: { email, role } }),
  removeMember: (id: string, email: string) => api<{ ok: true }>(`/api/books/${id}/members`, { method: "DELETE", body: { email } }),
  verdicts: (id: string) => api<{ verdicts: Record<string, unknown>[]; openComments: Record<string, number> }>(`/api/books/${id}/verdicts`),
  join: (token: string) => api<{ bookId: string; title: string }>(`/api/join/${token}`, { method: "POST" }),
  peekJoin: (token: string) => api<{ title: string; role: Role }>(`/api/join/${token}`, { noRedirect: true }),
};

export const documents = {
  get: (id: string) => api<{ document: Document; role: Role }>(`/api/documents/${id}`),
  save: (id: string, patch: { content?: string; title?: string }) =>
    api<{ document: { id: string; updated_at: string } }>(`/api/documents/${id}`, { method: "PATCH", body: patch }),
  remove: (id: string) => api<{ ok: true }>(`/api/documents/${id}`, { method: "DELETE" }),
  versions: (id: string) => api<{ versions: Version[] }>(`/api/documents/${id}/versions`).then((r) => r.versions),
  saveVersion: (id: string, v: { content: string; title?: string | null; message?: string | null }) =>
    api<{ version: Version }>(`/api/documents/${id}/versions`, { method: "POST", body: v }).then((r) => r.version),
  comments: (id: string) => api<{ comments: Comment[] }>(`/api/documents/${id}/comments`).then((r) => r.comments),
  addComment: (id: string, c: { content: string; from_pos: number; to_pos: number; quote: string | null }) =>
    api<{ comment: Comment }>(`/api/documents/${id}/comments`, { method: "POST", body: c }).then((r) => r.comment),
  logSuggestion: (id: string, entry: Record<string, unknown>) =>
    api<{ ok: true }>(`/api/documents/${id}/suggestion-log`, { method: "POST", body: entry }),
};

export const comments = {
  setResolved: (id: string, resolved: boolean) => api<{ ok: true }>(`/api/comments/${id}`, { method: "PATCH", body: { resolved } }),
  remove: (id: string) => api<{ ok: true }>(`/api/comments/${id}`, { method: "DELETE" }),
};
