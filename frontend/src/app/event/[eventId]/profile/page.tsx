"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, Check, Globe, Loader2, Instagram } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { LiveShell } from "@/components/live/live-screens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { PhoneField } from "@/components/ui/phone-field";
import { TagInput, INTEREST_SUGGESTIONS } from "@/components/ui/tag-input";
import { LinkedInGlyph, XGlyph, WhatsAppGlyph } from "@/components/brand/glyphs";
import { normalizeUrl } from "@/lib/url";
import { DEFAULT_DIAL_CODE, dialCodeMeta } from "@/lib/dial-codes";

interface Me {
  id: string;
  name: string;
  role: string;
  company: string | null;
  description: string | null;
  looking_for: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  phone: string | null;
  phone_dial_code: string | null;
  phone_visible: boolean;
  instagram: string | null;
  twitter: string | null;
  interests: string[];
}

export default function ProfileEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { eventId } = use(params);
  const { from } = use(searchParams);
  const eventLinkDisabled = from === "home";
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (authChecked && !user) router.replace(`/event/${eventId}/register`);
  }, [authChecked, user, eventId, router]);

  useEffect(() => {
    if (!user) return;
    apiFetch<Me>(`/events/${eventId}/attendees/me`)
      .then((m) => setMe({ ...m, interests: m.interests ?? [] }))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Couldn't load your profile";
        if (/not registered/i.test(msg)) router.replace(`/event/${eventId}/register`);
        else setError(msg);
      });
  }, [user, eventId, router]);

  if (!authChecked || !user || (!me && !error)) {
    return (
      <LiveShell>
        <Centered label="Loading your profile…" />
      </LiveShell>
    );
  }

  return (
    <LiveShell
      eventId={eventId}
      right={
        eventLinkDisabled ? (
          <Link href="/home" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
          </Link>
        ) : (
          <Link href={`/event/${eventId}/live`} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Event
          </Link>
        )
      }
    >
      <header>
        <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Your profile</p>
        <h1 className="mt-2 font-display text-3xl leading-tight tracking-[-0.02em] text-foreground">
          Edit your details
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is what tablemates see. Changes apply from your next round.
        </p>
      </header>

      {error && !me && (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {me && <ProfileForm eventId={eventId} me={me} />}
    </LiveShell>
  );
}

function ProfileForm({ eventId, me }: { eventId: string; me: Me }) {
  const [form, setForm] = useState({
    name: me.name ?? "",
    role: me.role ?? "",
    company: me.company ?? "",
    description: me.description ?? "",
    looking_for: me.looking_for ?? "",
    linkedin_url: me.linkedin_url ?? "",
    website_url: me.website_url ?? "",
    phone: me.phone ?? "",
    phone_dial_code: me.phone_dial_code || DEFAULT_DIAL_CODE,
    phone_visible: me.phone_visible ?? false,
    instagram: me.instagram ?? "",
    twitter: me.twitter ?? "",
    interests: me.interests ?? [],
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaved(false);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.role.trim()) {
      setError("Name and role can't be empty.");
      return;
    }
    // Accept a bare domain or an http/https link — normalise to a canonical URL.
    const linkedin = normalizeUrl(form.linkedin_url);
    const website = normalizeUrl(form.website_url);
    if (form.linkedin_url.trim() && !linkedin) {
      setError("That doesn't look like a link. Try linkedin.com/in/you");
      return;
    }
    if (form.website_url.trim() && !website) {
      setError("That doesn't look like a link. Try yourproduct.com");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/events/${eventId}/attendees/me`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name.trim(),
          role: form.role.trim(),
          company: form.company.trim() || null,
          description: form.description.trim() || null,
          looking_for: form.looking_for.trim() || null,
          linkedin_url: linkedin,
          website_url: website,
          phone: form.phone.replace(/\s+/g, "").trim() || null,
          phone_dial_code: form.phone_dial_code || null,
          phone_visible: form.phone_visible,
          instagram: form.instagram.trim() || null,
          twitter: form.twitter.trim() || null,
          interests: form.interests,
        }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your changes");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-5">
      <Field label="Full name" name="p-name" required>
        {(p) => <Input {...p} value={form.name} onChange={set("name")} placeholder="Maya Sharma" />}
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Role" name="p-role" required hint="What you do.">
          {(p) => <Input {...p} value={form.role} onChange={set("role")} placeholder="Founder" />}
        </Field>
        <Field label="Company" name="p-company" hint="Where you work / build.">
          {(p) => <Input {...p} value={form.company} onChange={set("company")} placeholder="Acme" />}
        </Field>
      </div>

      <Field label="What are you working on?" name="p-description" hint="A line about what you're building right now.">
        {(p) => (
          <Textarea {...p} value={form.description} onChange={set("description")} placeholder="Building an AI copilot for warehouse ops…" />
        )}
      </Field>

      <Field label="Looking for" name="p-looking" hint="Who would you love to meet?">
        {(p) => (
          <Textarea {...p} value={form.looking_for} onChange={set("looking_for")} placeholder="Investors, design partners…" />
        )}
      </Field>

      <Field label="Interests" name="p-interests" hint="Shared ones light up at the table.">
        {(p) => (
          <TagInput
            id={p.id}
            aria-describedby={p["aria-describedby"]}
            value={form.interests}
            onChange={(next) => {
              setForm((f) => ({ ...f, interests: next }));
              setSaved(false);
            }}
            suggestions={INTEREST_SUGGESTIONS}
            placeholder="AI, climate, hiring…"
          />
        )}
      </Field>

      <Field label="LinkedIn" name="p-linkedin">
        {(p) => (
          <Input {...p} type="url" inputMode="url" startIcon={<LinkedInGlyph />} value={form.linkedin_url} onChange={set("linkedin_url")} placeholder="linkedin.com/in/you" />
        )}
      </Field>

      <Field label="Website" name="p-website" hint="Your site or product link.">
        {(p) => (
          <Input {...p} type="url" inputMode="url" startIcon={<Globe className="h-4 w-4" aria-hidden />} value={form.website_url} onChange={set("website_url")} placeholder="yourproduct.com" />
        )}
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Instagram" name="p-instagram">
          {(p) => <Input {...p} startIcon={<Instagram className="h-4 w-4" aria-hidden />} value={form.instagram} onChange={set("instagram")} placeholder="@yourhandle" />}
        </Field>
        <Field label="X" name="p-twitter">
          {(p) => <Input {...p} startIcon={<XGlyph className="h-3.5 w-3.5" />} value={form.twitter} onChange={set("twitter")} placeholder="@yourhandle" />}
        </Field>
      </div>

      <Field label="WhatsApp / phone" name="p-phone" hint="People you connect with can message you here.">
        {(p) => (
          <PhoneField
            {...p}
            dialCode={form.phone_dial_code}
            phone={form.phone}
            onDialChange={(code) => { setForm((f) => ({ ...f, phone_dial_code: code })); setSaved(false); }}
            onPhoneChange={set("phone")}
          />
        )}
      </Field>

      {form.phone.trim() && (
        <label htmlFor="p-phone-visible" className="-mt-2 flex items-start justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-3.5 py-3">
          <span className="flex items-start gap-2.5">
            <WhatsAppGlyph className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-sm font-medium text-foreground">Let everyone at this event see my number</span>
              <span className="block text-xs text-muted-foreground">
                {form.phone_visible
                  ? `Anyone at the event can WhatsApp you on ${dialCodeMeta(form.phone_dial_code).code} ${form.phone.trim()}.`
                  : "Off — your number stays private and won't appear on your card."}
              </span>
            </span>
          </span>
          <Switch
            id="p-phone-visible"
            checked={form.phone_visible}
            onChange={(nextVal) => { setForm((f) => ({ ...f, phone_visible: nextVal })); setSaved(false); }}
            ariaLabel="Let everyone at this event see my phone number"
          />
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" variant="accent" size="xl" disabled={busy} className="w-full glow-ember">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
        {busy ? "Saving…" : saved ? "Saved" : "Save changes"}
      </Button>
    </form>
  );
}

function Centered({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-16 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
