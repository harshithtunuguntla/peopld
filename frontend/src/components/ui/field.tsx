import * as React from "react";
import { cn } from "@/lib/utils";

interface ControlProps {
  id: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
}

interface FieldProps {
  label: string;
  /** Stable id base. Auto-generated if omitted. */
  name?: string;
  required?: boolean;
  /** Persistent helper text below the label (not a placeholder). */
  hint?: string;
  /** Error message — shown below, announced to screen readers, flips aria-invalid. */
  error?: string;
  className?: string;
  /** Render the control, spreading the accessibility props onto it. */
  children: (props: ControlProps) => React.ReactNode;
}

/**
 * Form field wrapper: visible label, optional hint, error placement directly
 * below the field, and wired ARIA (id ↔ label, aria-invalid, aria-describedby,
 * role="alert"). Use with {@link Input}/{@link Textarea}. See DESIGN_SYSTEM §6.
 */
export function Field({ label, name, required, hint, error, className, children }: FieldProps) {
  const reactId = React.useId();
  const id = name ?? reactId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        {!required && <span className="ml-1.5 text-xs font-normal text-muted-foreground">Optional</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
