"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Two-step confirm button for destructive actions (end event / cancel round). */
export function ConfirmButton({
  label,
  confirmLabel,
  icon,
  busy,
  variant,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  icon: React.ReactNode;
  busy: boolean;
  variant: "danger";
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="destructive"
          size="lg"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          {confirmLabel}
        </Button>
        <Button variant="outline" size="lg" onClick={() => setArmed(false)} disabled={busy}>
          Keep
        </Button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      disabled={busy}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "danger" && "border-destructive/30 text-destructive hover:bg-destructive/10",
      )}
    >
      {icon} {label}
    </button>
  );
}
