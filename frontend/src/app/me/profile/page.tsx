"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, Check, Globe, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { isAcceptableUrl, normalizeUrl } from "@/lib/url";
import { cleanDefaults, type RegisterValues } from "@/components/auth/register-form";
import { Wordmark } from "@/components/brand/wordmark";
import { AuroraBackground } from "@/components/brand/aurora-background";
import { LinkedInGlyph } from "@/components/brand/glyphs";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TagInput, INTEREST_SUGGESTIONS } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";

// The backend's nullable columns mean any string field can come back `null`
// (e.g. a profile that's never had a company filled in) — never assume the
// API shape already matches the form's all-strings `RegisterValues`.
type MyProfile = Partial<RegisterValues> & { complete: boolean };

type Errors = Partial<Record<keyof RegisterValues, string>>;

/**
 * Your one global profile — captured once, reused as the prefill for every
 * event you join. Doubles as the mandatory first-login setup screen: arriving
 * with `?next=/home` (only ever set by the /home gate) means save-and-continue
 * routes there instead of staying on this page; visited directly (e.g. "Edit
 * profile" from the account menu) it behaves as a normal editable page.
 */
export default function PersonalProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = use(searchParams);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (authChecked && !user) router.replace("/home");
  }, [authChecked, user, router]);

  useEffect(() => {
    if (!user) return;
    apiFetch<MyProfile>("/me/profile")
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your profile"));
  }, [user]);

  if (!authChecked || !user || (!profile && !error)) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading...
      </div>
    );
  }

  const isSetup = Boolean(next);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <AuroraBackground intensity={0.35} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.12]" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-16 pt-7">
        <div className="flex items-center justify-between">
          <Link
            href="/home"
            aria-label="Go to Peopld home"
            className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Wordmark size={24} />
          </Link>
          {!isSetup && (
            <Link
              href="/home"
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Hub
            </Link>
          )}
        </div>

        <header className="mt-8">
          <p className="text-[11px] uppercase tracking-[0.3em] text-accent">
            {isSetup ? "Welcome" : "Your profile"}
          </p>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
            {isSetup ? "Tell us about yourself" : "Edit your details"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSetup
              ? "One quick profile, reused at every event you join — tweak it any time, you won't have to retype it."
              : "This becomes your starting profile when you join an event."}
          </p>
        </header>

        {error && !profile && (
          <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        {profile && <ProfileForm user={user} profile={profile} next={next} />}
      </div>
    </div>
  );
}

function ProfileForm({
  user,
  profile,
  next,
}: {
  user: User;
  profile: MyProfile;
  next?: string;
}) {
  const [form, setForm] = useState<RegisterValues>(() => {
    const defaults = cleanDefaults(profile);
    return {
      ...defaults,
      name:
        defaults.name ||
        (user.user_metadata?.full_name as string | undefined)?.trim() ||
        (user.user_metadata?.name as string | undefined)?.trim() ||
        "",
    };
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof RegisterValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [key]: e.target.value }));
    setSaved(false);
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  function validate(values: RegisterValues): Errors {
    const found: Errors = {};
    if (!values.name.trim()) found.name = "Tell us your name so tablemates know who you are.";
    if (!values.role.trim()) found.role = "A quick role helps people break the ice.";
    if (!isAcceptableUrl(values.linkedin_url)) {
      found.linkedin_url = "That doesn't look like a link. Try linkedin.com/in/you";
    }
    if (!isAcceptableUrl(values.website_url)) {
      found.website_url = "That doesn't look like a link. Try yourproduct.com";
    }
    return found;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(form);
    if (Object.keys(found).length) {
      setErrors(found);
      const firstKey = (["name", "role", "linkedin_url", "website_url"] as const).find((key) => found[key]);
      if (firstKey) document.getElementById(`draft-${firstKey}`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: form.name.trim(),
          role: form.role.trim(),
          company: form.company.trim() || null,
          description: form.description.trim() || null,
          looking_for: form.looking_for.trim() || null,
          linkedin_url: normalizeUrl(form.linkedin_url),
          website_url: normalizeUrl(form.website_url),
          interests: form.interests,
        }),
      });
      if (next) {
        window.location.href = next; // full navigation — re-resolve /home's gate cleanly
        return;
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-5">
      <Field label="Full name" name="draft-name" required error={errors.name}>
        {(p) => <Input {...p} autoComplete="name" value={form.name} onChange={set("name")} placeholder="Maya Sharma" />}
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Role" name="draft-role" required error={errors.role} hint="What you do.">
          {(p) => <Input {...p} value={form.role} onChange={set("role")} placeholder="Founder" />}
        </Field>
        <Field label="Company" name="draft-company" hint="Where you work / build.">
          {(p) => <Input {...p} value={form.company} onChange={set("company")} placeholder="Acme" />}
        </Field>
      </div>

      <Field label="What are you working on?" name="draft-description" hint="A line about what you're building right now.">
        {(p) => (
          <Textarea
            {...p}
            value={form.description}
            onChange={set("description")}
            placeholder="Building an AI copilot for warehouse ops."
          />
        )}
      </Field>

      <Field label="Looking for" name="draft-looking_for" hint="Who would you love to meet?">
        {(p) => (
          <Textarea
            {...p}
            value={form.looking_for}
            onChange={set("looking_for")}
            placeholder="Investors, design partners, fellow founders."
          />
        )}
      </Field>

      <Field label="Interests" name="draft-interests" hint="Shared ones light up at the table.">
        {(p) => (
          <TagInput
            id={p.id}
            aria-describedby={p["aria-describedby"]}
            value={form.interests}
            onChange={(tags) => {
              setForm((current) => ({ ...current, interests: tags }));
              setSaved(false);
            }}
            suggestions={INTEREST_SUGGESTIONS}
            placeholder="AI, climate, hiring"
          />
        )}
      </Field>

      <Field label="LinkedIn" name="draft-linkedin_url" error={errors.linkedin_url}>
        {(p) => (
          <Input
            {...p}
            type="url"
            inputMode="url"
            autoComplete="url"
            startIcon={<LinkedInGlyph />}
            value={form.linkedin_url}
            onChange={set("linkedin_url")}
            placeholder="linkedin.com/in/you"
          />
        )}
      </Field>

      <Field label="Website" name="draft-website_url" error={errors.website_url} hint="Your site or product link.">
        {(p) => (
          <Input
            {...p}
            type="url"
            inputMode="url"
            autoComplete="url"
            startIcon={<Globe className="h-4 w-4" aria-hidden />}
            value={form.website_url}
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
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
        {busy ? "Saving…" : saved ? "Saved" : next ? "Save & continue" : "Save profile"}
      </Button>
    </form>
  );
}
