"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { X } from "lucide-react";

import { AccessCodeGate } from "@/components/auth";
import { ApiError } from "@/lib/api";
import { resolveJoinCode } from "@/lib/join";

/**
 * Hub "Join via access code": the attendee types the code the organizer read out;
 * we resolve it to an event and route to that event's registration / waiting room.
 * Reuses the same AccessCodeGate field used on the per-event register page.
 */
export function JoinByCodeDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  const onVerify = useCallback(
    async (code: string) => {
      try {
        const { event_id } = await resolveJoinCode(code);
        router.push(`/event/${event_id}/register`);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return false; // wrong code
        throw err; // real failure → gate shows the message
      }
    },
    [router],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Join via access code"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <AccessCodeGate onVerify={onVerify} />
      </div>
    </div>
  );
}
