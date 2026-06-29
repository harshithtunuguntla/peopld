"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquareText, ArrowRight, CheckCircle2 } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FormConfig } from "@/lib/feedback";

/**
 * Post-event nudge shown on the ended command center: prompts the organizer to set
 * up (or confirms they've published) a feedback form. Self-contained fetch so the
 * lean ended view stays simple. Silent if it can't load — never blocks the recap.
 */
export function FeedbackNudge({ eventId }: { eventId: string }) {
  const [form, setForm] = useState<FormConfig | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    apiFetch<FormConfig>(`/events/${eventId}/feedback-form`)
      .then(setForm)
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [eventId]);

  if (!checked) return null;

  const published = !!form?.is_published;

  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
        published ? "border-success/30 bg-success/[0.06]" : "border-accent/30 bg-accent/[0.06]",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            published ? "bg-success/15 text-success" : "bg-accent/15 text-accent",
          )}
        >
          {published ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <MessageSquareText className="h-4 w-4" aria-hidden />}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {published ? "Feedback form is live" : "Collect feedback from your guests"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {published
              ? "Guests are asked on their recap. Review what's coming in."
              : "Ask a few questions on each guest's recap — see what landed and what to improve."}
          </p>
        </div>
      </div>
      <Link
        href={`/organizer/event/${eventId}/feedback${published ? "?view=responses" : ""}`}
        className={cn(buttonVariants({ variant: published ? "outline" : "accent", size: "sm" }), "gap-1.5")}
      >
        {published ? "View responses" : "Set up form"} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
