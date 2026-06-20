"use client";

import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Error carrying the HTTP status so callers can branch (e.g. 404 = "none yet"
 * vs a real failure) without re-parsing a string message. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** FastAPI returns `detail` as a plain string for our own HTTPExceptions, but as
 * an ARRAY of {loc, msg, ...} objects for request-validation (422) failures.
 * Flatten both into a human-readable line so the UI never shows "[object Object]". */
function messageFromDetail(detail: unknown, status: number): string {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((e) => {
        if (e && typeof e === "object" && "msg" in e) {
          const loc = Array.isArray((e as { loc?: unknown[] }).loc)
            ? (e as { loc: unknown[] }).loc.filter((l) => l !== "body")
            : [];
          const field = loc.length ? `${loc.join(".")}: ` : "";
          return `${field}${(e as { msg: string }).msg}`;
        }
        return null;
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return `API error ${status}`;
}

// Calls the FastAPI backend, attaching the Supabase JWT when signed in.
export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...options?.headers,
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(res.status, messageFromDetail(error.detail, res.status));
  }
  return res.json();
}
