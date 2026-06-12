"use client";

import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
    throw new Error(error.detail ?? `API error ${res.status}`);
  }
  return res.json();
}
