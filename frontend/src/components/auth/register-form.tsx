"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Globe,
  Loader2,
  IdCard,
  Sparkles,
  AtSign,
  ChevronDown,
  Instagram,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { PhoneField } from "@/components/ui/phone-field";
import { TagInput, INTEREST_SUGGESTIONS } from "@/components/ui/tag-input";
import { LinkedInGlyph, XGlyph, WhatsAppGlyph } from "@/components/brand/glyphs";
import { isAcceptableUrl, normalizeUrl } from "@/lib/url";
import { DEFAULT_DIAL_CODE, dialCodeMeta } from "@/lib/dial-codes";
import { cn } from "@/lib/utils";

export interface RegisterValues {
  name: string;
  role: string;
  company: string;
  description: string;
  looking_for: string;
  linkedin_url: string;
  website_url: string;
  phone: string;
  phone_dial_code: string;
  phone_visible: boolean;
  instagram: string;
  twitter: string;
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
  /** Fired (debounced) on every edit so the page can persist an in-progress draft
   *  — this is what stops a mobile tab-switch from wiping what you've typed. */
  onAutosave?: (values: RegisterValues) => void;
}

const EMPTY: RegisterValues = {
  name: "",
  role: "",
  company: "",
  description: "",
  looking_for: "",
  linkedin_url: "",
  website_url: "",
  phone: "",
  phone_dial_code: DEFAULT_DIAL_CODE,
  phone_visible: false,
  instagram: "",
  twitter: "",
  interests: [],
};

/** Attendee profile form. Owns its field state + client validation; emits clean
 * values to the parent, which maps them to the API and handles the request.
 * Grouped into sections (basics → story → links & contact) so a longer form reads
 * as a few quick steps rather than a wall of inputs. */
export function RegisterForm({ onSubmit, busy, error, defaultValues, defaultName, onAutosave }: RegisterFormProps) {
  const [values, setValues] = useState<RegisterValues>(() => {
    const defaults = cleanDefaults(defaultValues);
    return {
      ...defaults,
      name: defaults.name || defaultName?.trim() || "",
    };
  });
  const [errors, setErrors] = useState<Errors>({});
  // Open the contact section up front if the person already has anything in it
  // (a returning attendee) so prefilled links aren't hidden behind a collapsed row.
  const [contactOpen, setContactOpen] = useState(
    () =>
      Boolean(
        values.linkedin_url || values.website_url || values.phone || values.instagram || values.twitter,
      ),
  );

  // Debounced autosave — persist the in-progress draft as they type so switching
  // apps to copy a link (which can evict the page on mobile) doesn't lose it.
  // Only after a REAL edit: seeding the form on mount must not write a draft, or
  // just *visiting* the page would create one that shadows a later profile edit.
  const autosaveRef = useRef(onAutosave);
  autosaveRef.current = onAutosave;
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!autosaveRef.current || !dirtyRef.current) return;
    const t = setTimeout(() => autosaveRef.current?.(values), 500);
    return () => clearTimeout(t);
  }, [values]);

  /** Update fields AND mark the form dirty (so autosave starts). Every edit path
   *  routes through here so nothing silently skips the draft. */
  const patch = (partial: Partial<RegisterValues>) => {
    dirtyRef.current = true;
    setValues((v) => ({ ...v, ...partial }));
  };

  const set = (key: keyof RegisterValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    patch({ [key]: e.target.value });
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
    // Phone is optional; if given, it must have enough digits to be a real number.
    if (v.phone.trim() && v.phone.replace(/\D/g, "").length < 6) {
      next.phone = "That number looks too short.";
    }
    return next;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(values);
    if (Object.keys(found).length) {
      setErrors(found);
      // If the invalid field is in the collapsed section, open it before focusing.
      if (found.linkedin_url || found.website_url || found.phone) setContactOpen(true);
      const firstKey = (["name", "role", "linkedin_url", "website_url", "phone"] as const).find((k) => found[k]);
      if (firstKey) requestAnimationFrame(() => document.getElementById(`reg-${firstKey}`)?.focus());
      return;
    }
    void onSubmit({
      ...values,
      name: values.name.trim(),
      role: values.role.trim(),
      company: values.company.trim(),
      description: values.description.trim(),
      looking_for: values.looking_for.trim(),
      linkedin_url: normalizeUrl(values.linkedin_url) ?? "",
      website_url: normalizeUrl(values.website_url) ?? "",
      phone: values.phone.replace(/\s+/g, "").trim(),
      instagram: values.instagram.trim(),
      twitter: values.twitter.trim(),
    });
  }

  const dial = dialCodeMeta(values.phone_dial_code);

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <header>
        <h2 className="font-display text-xl text-foreground">Set up your profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is what everyone at the event — and on the guest list — will see. Only{" "}
          <span className="font-medium text-foreground">name &amp; role</span> are required; the rest just helps people connect.
        </p>
      </header>

      {/* ── The basics ─────────────────────────────────────────────── */}
      <Section icon={<IdCard className="h-4 w-4" />} title="The basics">
        <Field label="Full name" name="reg-name" required error={errors.name}>
          {(p) => <Input {...p} autoComplete="name" value={values.name} onChange={set("name")} placeholder="Maya Sharma" />}
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Role" name="reg-role" required error={errors.role} hint="What you do.">
            {(p) => <Input {...p} value={values.role} onChange={set("role")} placeholder="Founder" />}
          </Field>
          <Field label="Company" name="reg-company" hint="Where you work / build.">
            {(p) => <Input {...p} value={values.company} onChange={set("company")} placeholder="Acme" />}
          </Field>
        </div>
      </Section>

      {/* ── Your story ─────────────────────────────────────────────── */}
      <Section icon={<Sparkles className="h-4 w-4" />} title="Your story" subtitle="Give people a reason to say hi.">
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
              onChange={(next) => patch({ interests: next })}
              suggestions={INTEREST_SUGGESTIONS}
              placeholder="AI, climate, hiring…"
            />
          )}
        </Field>
      </Section>

      {/* ── Links & contact (collapsible) ──────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card/40">
        <button
          type="button"
          onClick={() => setContactOpen((o) => !o)}
          aria-expanded={contactOpen}
          className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left"
        >
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">
              <AtSign className="h-4 w-4" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-medium text-foreground">Links &amp; contact</span>
              <span className="block text-xs text-muted-foreground">LinkedIn, socials, WhatsApp — all optional.</span>
            </span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", contactOpen && "rotate-180")} aria-hidden />
        </button>

        {contactOpen && (
          <div className="flex flex-col gap-5 border-t border-border/70 p-4">
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

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Instagram" name="reg-instagram">
                {(p) => (
                  <Input
                    {...p}
                    startIcon={<Instagram className="h-4 w-4" aria-hidden />}
                    value={values.instagram}
                    onChange={set("instagram")}
                    placeholder="@yourhandle"
                  />
                )}
              </Field>
              <Field label="X" name="reg-twitter">
                {(p) => (
                  <Input
                    {...p}
                    startIcon={<XGlyph className="h-3.5 w-3.5" />}
                    value={values.twitter}
                    onChange={set("twitter")}
                    placeholder="@yourhandle"
                  />
                )}
              </Field>
            </div>

            {/* WhatsApp / phone — country code + number, then a per-attendee opt-in
                that governs whether the number is shown to everyone at the event. */}
            <Field label="WhatsApp / phone" name="reg-phone" error={errors.phone} hint="People you connect with can message you here.">
              {(p) => (
                <PhoneField
                  {...p}
                  dialCode={values.phone_dial_code}
                  phone={values.phone}
                  onDialChange={(code) => patch({ phone_dial_code: code })}
                  onPhoneChange={set("phone")}
                />
              )}
            </Field>

            {values.phone.trim() && (
              <label
                htmlFor="reg-phone-visible"
                className="-mt-2 flex items-start justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-3.5 py-3"
              >
                <span className="flex items-start gap-2.5">
                  <WhatsAppGlyph className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block text-sm font-medium text-foreground">Let everyone at this event see my number</span>
                    <span className="block text-xs text-muted-foreground">
                      {values.phone_visible
                        ? `Anyone at the event can WhatsApp you on ${dial.code} ${values.phone.trim()}.`
                        : "Off — your number stays private and won't appear on your card."}
                    </span>
                  </span>
                </span>
                <Switch
                  id="reg-phone-visible"
                  checked={values.phone_visible}
                  onChange={(next) => patch({ phone_visible: next })}
                  ariaLabel="Let everyone at this event see my phone number"
                />
              </label>
            )}
          </div>
        )}
      </div>

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

/** A labelled group of fields — a small icon + title (+ optional subtitle) above a
 *  column of inputs, so the form reads as a few quick sections. */
function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">{icon}</span>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Coerce a possibly-null/partial API profile (the global profile, or a prior
 * event's prefill) into a fully-stringed `RegisterValues` — controlled inputs
 * must never receive `null`, only "" for "not set". Shared by every form that
 * seeds its state from a profile-defaults response. */
export function cleanDefaults(defaults?: Partial<RegisterValues> | null): RegisterValues {
  return {
    name: defaults?.name?.trim() ?? "",
    role: defaults?.role?.trim() ?? "",
    company: defaults?.company?.trim() ?? "",
    description: defaults?.description?.trim() ?? "",
    looking_for: defaults?.looking_for?.trim() ?? "",
    linkedin_url: defaults?.linkedin_url?.trim() ?? "",
    website_url: defaults?.website_url?.trim() ?? "",
    phone: defaults?.phone?.trim() ?? "",
    phone_dial_code: defaults?.phone_dial_code?.trim() || DEFAULT_DIAL_CODE,
    phone_visible: defaults?.phone_visible ?? false,
    instagram: defaults?.instagram?.trim() ?? "",
    twitter: defaults?.twitter?.trim() ?? "",
    interests: defaults?.interests ?? [],
  };
}
