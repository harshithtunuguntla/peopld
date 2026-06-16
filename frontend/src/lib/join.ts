import { apiFetch } from "@/lib/api";

/** Where the register page looks for an already-verified code (keep in sync with
 * the local copy in app/event/[eventId]/register/page.tsx). */
export const codeStorageKey = (eventId: string) => `peopld:event:${eventId}:code`;

export interface JoinResult {
  event_id: string;
  name: string;
  requires_code: boolean;
}

/**
 * Resolve an access code to its event and remember it, so the per-event
 * registration gate is already satisfied when we land there. Throws ApiError
 * (404) when no event matches.
 */
export async function resolveJoinCode(code: string): Promise<JoinResult> {
  const clean = code.trim();
  const result = await apiFetch<JoinResult>("/events/join", {
    method: "POST",
    body: JSON.stringify({ code: clean }),
  });
  try {
    sessionStorage.setItem(codeStorageKey(result.event_id), clean);
  } catch {
    /* storage blocked (private mode) — the register gate will just ask again */
  }
  return result;
}
