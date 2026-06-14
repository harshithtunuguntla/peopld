"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";

export interface RegisterValues {
  name: string;
  role: string;
  looking_for: string;
  linkedin_url: string;
  whatsapp_number: string;
}

type Errors = Partial<Record<keyof RegisterValues, string>>;

interface RegisterFormProps {
  onSubmit: (values: RegisterValues) => void | Promise<void>;
  busy?: boolean;
  /** Server-side error (e.g. event ended) surfaced above the submit button. */
  error?: string | null;
}

const EMPTY: RegisterValues = { name: "", role: "", looking_for: "", linkedin_url: "", whatsapp_number: "" };

/** Attendee profile form. Owns its field state + client validation; emits clean
 * values to the parent, which maps them to the API and handles the request. */
export function RegisterForm({ onSubmit, busy, error }: RegisterFormProps) {
  const [values, setValues] = useState<RegisterValues>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});

  const set = (key: keyof RegisterValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validate(v: RegisterValues): Errors {
    const next: Errors = {};
    if (!v.name.trim()) next.name = "Tell us your name so tablemates know who you are.";
    if (!v.role.trim()) next.role = "A quick role helps people break the ice.";
    if (v.linkedin_url.trim() && !/^https?:\/\/.+/i.test(v.linkedin_url.trim())) {
      next.linkedin_url = "Include the full link (starting with https://).";
    }
    return next;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(values);
    if (Object.keys(found).length) {
      setErrors(found);
      // Focus the first invalid field for keyboard/screen-reader users.
      const firstKey = (["name", "role", "linkedin_url"] as const).find((k) => found[k]);
      if (firstKey) document.getElementById(`reg-${firstKey}`)?.focus();
      return;
    }
    void onSubmit({
      name: values.name.trim(),
      role: values.role.trim(),
      looking_for: values.looking_for.trim(),
      linkedin_url: values.linkedin_url.trim(),
      whatsapp_number: values.whatsapp_number.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <header>
        <h2 className="font-display text-xl text-cream">Set up your profile</h2>
        <p className="mt-1 text-sm text-cream/55">This is what your tablemates will see at the event.</p>
      </header>

      <Field label="Full name" name="reg-name" required error={errors.name}>
        {(p) => (
          <Input {...p} autoComplete="name" value={values.name} onChange={set("name")} placeholder="Maya Sharma" />
        )}
      </Field>

      <Field label="Role" name="reg-role" required error={errors.role} hint="What you do, in a few words.">
        {(p) => (
          <Input {...p} value={values.role} onChange={set("role")} placeholder="Founder at Acme" />
        )}
      </Field>

      <Field label="Looking for" name="reg-looking_for" hint="Who would you love to meet?">
        {(p) => (
          <Textarea
            {...p}
            value={values.looking_for}
            onChange={set("looking_for")}
            placeholder="Investors, design partners, fellow climate founders…"
          />
        )}
      </Field>

      <Field label="LinkedIn" name="reg-linkedin_url" error={errors.linkedin_url}>
        {(p) => (
          <Input
            {...p}
            type="url"
            inputMode="url"
            autoComplete="url"
            value={values.linkedin_url}
            onChange={set("linkedin_url")}
            placeholder="https://linkedin.com/in/you"
          />
        )}
      </Field>

      <Field label="WhatsApp" name="reg-whatsapp_number" hint="Shared only with people you actually meet, after the event.">
        {(p) => (
          <Input
            {...p}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={values.whatsapp_number}
            onChange={set("whatsapp_number")}
            placeholder="+91 98765 43210"
          />
        )}
      </Field>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" variant="accent" size="xl" disabled={busy} className="w-full glow-ember">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? "Joining…" : "Join the event"}
        {!busy && <ArrowRight className="h-4 w-4" />}
      </Button>
    </form>
  );
}
