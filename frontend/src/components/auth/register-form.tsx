"use client";

import { useState } from "react";
import { ArrowRight, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { TagInput, INTEREST_SUGGESTIONS } from "@/components/ui/tag-input";
import { LinkedInGlyph } from "@/components/brand/glyphs";
import { isAcceptableUrl, normalizeUrl } from "@/lib/url";

export interface RegisterValues {
  name: string;
  role: string;
  company: string;
  description: string;
  looking_for: string;
  linkedin_url: string;
  website_url: string;
  interests: string[];
}

type Errors = Partial<Record<keyof RegisterValues, string>>;

interface RegisterFormProps {
  onSubmit: (values: RegisterValues) => void | Promise<void>;
  busy?: boolean;
  /** Server-side error (e.g. event ended) surfaced above the submit button. */
  error?: string | null;
  /** Reusable profile fields from a previous event registration. */
  defaultValues?: Partial<RegisterValues> | null;
  /** Fallback name (e.g. from the Google identity) when no profile default exists. */
  defaultName?: string;
}

const EMPTY: RegisterValues = {
  name: "",
  role: "",
  company: "",
  description: "",
  looking_for: "",
  linkedin_url: "",
  website_url: "",
  interests: [],
};

/** Attendee profile form. Owns its field state + client validation; emits clean
 * values to the parent, which maps them to the API and handles the request. */
export function RegisterForm({ onSubmit, busy, error, defaultValues, defaultName }: RegisterFormProps) {
  const [values, setValues] = useState<RegisterValues>(() => {
    const defaults = cleanDefaults(defaultValues);
    return {
      ...EMPTY,
      ...defaults,
      name: defaults.name || defaultName?.trim() || "",
    };
  });
  const [errors, setErrors] = useState<Errors>({});

  const set = (key: keyof RegisterValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validate(v: RegisterValues): Errors {
    const next: Errors = {};
    if (!v.name.trim()) next.name = "Tell us your name so tablemates know who you are.";
    if (!v.role.trim()) next.role = "A quick role helps people break the ice.";
    // A bare domain ("linkedin.com/in/you") or an http/https link is fine.
    if (!isAcceptableUrl(v.linkedin_url)) {
      next.linkedin_url = "That doesn't look like a link. Try linkedin.com/in/you";
    }
    if (!isAcceptableUrl(v.website_url)) {
      next.website_url = "That doesn't look like a link. Try yourproduct.com";
    }
    return next;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(values);
    if (Object.keys(found).length) {
      setErrors(found);
      // Focus the first invalid field for keyboard/screen-reader users.
      const firstKey = (["name", "role", "linkedin_url", "website_url"] as const).find((k) => found[k]);
      if (firstKey) document.getElementById(`reg-${firstKey}`)?.focus();
      return;
    }
    void onSubmit({
      name: values.name.trim(),
      role: values.role.trim(),
      company: values.company.trim(),
      description: values.description.trim(),
      looking_for: values.looking_for.trim(),
      linkedin_url: normalizeUrl(values.linkedin_url) ?? "",
      website_url: normalizeUrl(values.website_url) ?? "",
      interests: values.interests,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <header>
        <h2 className="font-display text-xl text-foreground">Set up your profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">This is what everyone at the event — and on the guest list — will see.</p>
      </header>

      <Field label="Full name" name="reg-name" required error={errors.name}>
        {(p) => (
          <Input {...p} autoComplete="name" value={values.name} onChange={set("name")} placeholder="Maya Sharma" />
        )}
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Role" name="reg-role" required error={errors.role} hint="What you do.">
          {(p) => (
            <Input {...p} value={values.role} onChange={set("role")} placeholder="Founder" />
          )}
        </Field>

        <Field label="Company" name="reg-company" hint="Where you work / build.">
          {(p) => (
            <Input {...p} value={values.company} onChange={set("company")} placeholder="Acme" />
          )}
        </Field>
      </div>

      <Field label="What are you working on?" name="reg-description" hint="A line about what you're building right now.">
        {(p) => (
          <Textarea
            {...p}
            value={values.description}
            onChange={set("description")}
            placeholder="Building an AI copilot for warehouse ops — just shipped our first pilot."
          />
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

      <Field label="Interests" name="reg-interests" hint="A few topics you love — shared ones light up at the table.">
        {(p) => (
          <TagInput
            id={p.id}
            aria-describedby={p["aria-describedby"]}
            value={values.interests}
            onChange={(next) => setValues((v) => ({ ...v, interests: next }))}
            suggestions={INTEREST_SUGGESTIONS}
            placeholder="AI, climate, hiring…"
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
            startIcon={<LinkedInGlyph />}
            value={values.linkedin_url}
            onChange={set("linkedin_url")}
            placeholder="linkedin.com/in/you"
          />
        )}
      </Field>

      <Field label="Website" name="reg-website_url" error={errors.website_url} hint="Your site or product link.">
        {(p) => (
          <Input
            {...p}
            type="url"
            inputMode="url"
            autoComplete="url"
            startIcon={<Globe className="h-4 w-4" aria-hidden />}
            value={values.website_url}
            onChange={set("website_url")}
            placeholder="yourproduct.com"
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

function cleanDefaults(defaults?: Partial<RegisterValues> | null): RegisterValues {
  return {
    name: defaults?.name?.trim() ?? "",
    role: defaults?.role?.trim() ?? "",
    company: defaults?.company?.trim() ?? "",
    description: defaults?.description?.trim() ?? "",
    looking_for: defaults?.looking_for?.trim() ?? "",
    linkedin_url: defaults?.linkedin_url?.trim() ?? "",
    website_url: defaults?.website_url?.trim() ?? "",
    interests: defaults?.interests ?? [],
  };
}
