"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AtSign, ChevronDown, Contact, Loader2, MicOff, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhoneField } from "@/components/ui/phone-field";
import { SelectMenu } from "@/components/ui/select-menu";
import { VoiceOrb } from "@/components/ui/voice-orb";
import { DEFAULT_DIAL_CODE } from "@/lib/dial-codes";
import { apiFetch, ApiError } from "@/lib/api";
import { useSpeechRecognition } from "@/lib/use-speech-recognition";
import { cn } from "@/lib/utils";

/** The editable shape — also the payload we send (nulls clear a field on edit). */
export interface ManualConnectionDraft {
  manual_id?: string; // present when editing
  name: string;
  role: string;
  company: string;
  phone: string;
  phone_dial_code: string;
  email: string;
  instagram: string;
  twitter: string;
  linkedin_url: string;
  website_url: string;
  note: string;
  met_context: string;
  event_id: string; // "" = not tied to an event
}

function emptyDraft(): ManualConnectionDraft {
  return {
    name: "",
    role: "",
    company: "",
    phone: "",
    phone_dial_code: DEFAULT_DIAL_CODE,
    email: "",
    instagram: "",
    twitter: "",
    linkedin_url: "",
    website_url: "",
    note: "",
    met_context: "",
    event_id: "",
  };
}

function appendChunk(prev: string, chunk: string): string {
  if (!prev.trim()) return chunk;
  return `${prev.trim()} ${chunk}`;
}

/**
 * "Add someone you met" — a voice-first bottom sheet (mobile) / centered modal
 * (desktop). The hero is a mic: tap it and your words stream into the note live.
 * Everything but the name is optional and tucked behind a "Their details"
 * disclosure so the fast path is: talk → name → save.
 */
export function AddConnectionSheet({
  initial,
  events,
  onClose,
  onSaved,
}: {
  initial?: ManualConnectionDraft;
  events: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(initial?.manual_id);
  // Mounted immediately; `visible` drives the enter/exit animation. Closing sets
  // it false so AnimatePresence can play the exit before the parent unmounts us.
  const [visible, setVisible] = useState(true);
  const [draft, setDraft] = useState<ManualConnectionDraft>(initial ?? emptyDraft());
  const [detailsOpen, setDetailsOpen] = useState(
    Boolean(
      initial &&
        (initial.role ||
          initial.company ||
          initial.phone ||
          initial.email ||
          initial.met_context ||
          initial.event_id),
    ),
  );
  const [socialsOpen, setSocialsOpen] = useState(
    Boolean(initial && (initial.instagram || initial.twitter || initial.linkedin_url || initial.website_url)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();
  // Panel enter/exit: full spring normally; opacity-only under reduced motion.
  const panelMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, y: 32, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 32, scale: 0.98 },
        transition: { type: "spring" as const, stiffness: 320, damping: 30 },
      };
  // Tailor the "voice unavailable" message. Detected after mount (navigator is
  // client-only) so SSR and first hydration render the same generic copy.
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const iOS =
      /iP(hone|ad|od)/.test(ua) ||
      // iPadOS 13+ masquerades as macOS — spot it by the touch points.
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(iOS);
  }, []);

  const set = <K extends keyof ManualConnectionDraft>(key: K, value: ManualConnectionDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const { supported, listening, interim, error: voiceError, start, stop } = useSpeechRecognition({
    onFinal: (chunk) => setDraft((d) => ({ ...d, note: appendChunk(d.note, chunk) })),
  });

  async function save() {
    const name = draft.name.trim();
    if (!name) {
      setError("Add a name so you can find them later.");
      return;
    }
    stop();
    setSaving(true);
    setError(null);
    const payload = {
      name,
      role: draft.role,
      company: draft.company,
      phone: draft.phone,
      phone_dial_code: draft.phone_dial_code,
      email: draft.email,
      instagram: draft.instagram,
      twitter: draft.twitter,
      linkedin_url: draft.linkedin_url,
      website_url: draft.website_url,
      note: draft.note,
      met_context: draft.met_context,
      event_id: draft.event_id || null,
    };
    try {
      if (editing) {
        await apiFetch(`/me/connections/manual/${initial!.manual_id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/me/connections/manual`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save — try again.");
      setSaving(false);
    }
  }

  // Play the exit animation, then let AnimatePresence call onClose for real.
  function requestClose() {
    stop();
    setVisible(false);
  }

  // Escape closes the sheet (and stops any live recording).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence onExitComplete={onClose}>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Edit contact" : "Add someone you met"}
          onClick={requestClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            {...panelMotion}
          >
        <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="font-display text-lg leading-tight text-foreground">
              {editing ? "Edit contact" : "Add someone you met"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {editing ? "Update their details." : "They'll join your rolodex — searchable forever."}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Voice hero — the star of the flow when the browser supports it. */}
          {supported ? (
            <div
              className={cn(
                "flex flex-col items-center rounded-2xl border px-4 py-6 text-center transition-colors",
                listening ? "border-accent/40 bg-accent/[0.06]" : "border-border/70 bg-secondary/30",
              )}
            >
              <VoiceOrb
                listening={listening}
                reactTo={interim}
                onToggle={listening ? stop : start}
              />

              <p className="mt-5 text-sm font-medium text-foreground">
                {listening ? "Listening…" : "Tap and tell me about them"}
              </p>

              {/* Live transcript — shimmering words + a blinking caret while they stream in. */}
              {listening ? (
                <div className="mt-2 min-h-[2.75rem] max-w-xs">
                  {interim ? (
                    <p className="text-sm leading-snug">
                      <span className="voice-shimmer font-medium">{interim}</span>
                      <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-accent align-middle" aria-hidden />
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Go ahead — I&rsquo;m listening. Tap the orb to stop.</p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  e.g. &ldquo;Met Priya, a product designer at Figma, wants a hiring intro&rdquo;
                </p>
              )}
              {voiceError && <p className="mt-2 text-xs text-destructive">{voiceError}</p>}
            </div>
          ) : (
            // No in-app speech engine in this browser — say WHY, and point to the
            // voice path that DOES work here (the keyboard's own dictation mic).
            <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3.5">
              <MicOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="text-xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">Live voice isn&rsquo;t available in this browser.</p>
                {isIOS ? (
                  <p className="mt-0.5">
                    iPhone &amp; iPad browsers don&rsquo;t allow in-app dictation. Tap the{" "}
                    <span className="font-medium text-foreground">🎤 on your keyboard</span> to speak the
                    note below instead — or just type it.
                  </p>
                ) : (
                  <p className="mt-0.5">
                    It needs a recent <span className="font-medium text-foreground">Chrome or Edge</span>{" "}
                    (your browser may be older or unsupported). You can still type the note below — or use
                    your keyboard&rsquo;s mic.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 space-y-4">
            <Field label="Their name" name="mc-name" required>
              {(props) => (
                <Input
                  {...props}
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Priya Nair"
                  maxLength={120}
                  autoFocus={!editing}
                />
              )}
            </Field>

            <Field label="Note" name="mc-note" hint="What you want to remember — voice fills this in.">
              {(props) => (
                <Textarea
                  {...props}
                  value={draft.note}
                  onChange={(e) => set("note", e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Met at the coffee bar. Runs a seed fund, keen on climate…"
                />
              )}
            </Field>

            {/* Details — role/company/contact/where. Collapsed by default so the
                fast path stays: talk → name → save. */}
            <Disclosure
              open={detailsOpen}
              onToggle={() => setDetailsOpen((o) => !o)}
              icon={<Contact className="h-4 w-4 text-accent" aria-hidden />}
              label="Details"
              hint="role · phone · email · event"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Role" name="mc-role">
                  {(props) => (
                    <Input {...props} value={draft.role} onChange={(e) => set("role", e.target.value)} placeholder="Product Designer" maxLength={120} />
                  )}
                </Field>
                <Field label="Company" name="mc-company">
                  {(props) => (
                    <Input {...props} value={draft.company} onChange={(e) => set("company", e.target.value)} placeholder="Figma" maxLength={120} />
                  )}
                </Field>
              </div>

              <Field label="Phone" name="mc-phone" hint="For a WhatsApp intro + saving to your contacts.">
                {(props) => (
                  <PhoneField
                    id={props.id}
                    aria-invalid={props["aria-invalid"]}
                    aria-describedby={props["aria-describedby"]}
                    dialCode={draft.phone_dial_code}
                    phone={draft.phone}
                    onDialChange={(code) => set("phone_dial_code", code)}
                    onPhoneChange={(e) => set("phone", e.target.value)}
                  />
                )}
              </Field>

              <Field label="Email" name="mc-email">
                {(props) => (
                  <Input {...props} type="email" inputMode="email" value={draft.email} onChange={(e) => set("email", e.target.value)} placeholder="priya@example.com" maxLength={200} />
                )}
              </Field>

              <Field label="Where you met" name="mc-context">
                {(props) => (
                  <Input {...props} value={draft.met_context} onChange={(e) => set("met_context", e.target.value)} placeholder="Coffee bar · intro'd by Arjun" maxLength={200} />
                )}
              </Field>

              {events.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    At which event?
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">Optional</span>
                  </span>
                  <SelectMenu
                    value={draft.event_id}
                    onChange={(v) => set("event_id", v)}
                    ariaLabel="Event you met them at"
                    className="w-full"
                    options={[
                      { value: "", label: "No specific event" },
                      ...events.map((ev) => ({ value: ev.id, label: ev.name })),
                    ]}
                  />
                </div>
              )}
            </Disclosure>

            {/* Socials — their handles, grouped on their own. */}
            <Disclosure
              open={socialsOpen}
              onToggle={() => setSocialsOpen((o) => !o)}
              icon={<AtSign className="h-4 w-4 text-accent" aria-hidden />}
              label="Socials"
              hint="Instagram · X · LinkedIn · website"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Instagram" name="mc-ig">
                  {(props) => (
                    <Input {...props} value={draft.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="priyadraws" maxLength={120} />
                  )}
                </Field>
                <Field label="X" name="mc-x">
                  {(props) => (
                    <Input {...props} value={draft.twitter} onChange={(e) => set("twitter", e.target.value)} placeholder="priyadraws" maxLength={120} />
                  )}
                </Field>
              </div>
              <Field label="LinkedIn" name="mc-linkedin">
                {(props) => (
                  <Input {...props} value={draft.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="linkedin.com/in/…" maxLength={300} />
                )}
              </Field>
              <Field label="Website" name="mc-website">
                {(props) => (
                  <Input {...props} value={draft.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="priya.design" maxLength={300} />
                )}
              </Field>
            </Disclosure>

            {error && (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
          <Button variant="outline" onClick={requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="accent" onClick={save} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
              </>
            ) : editing ? (
              "Save changes"
            ) : (
              "Add to rolodex"
            )}
          </Button>
        </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A collapsible section: a full-width toggle button + animated reveal of its
 *  fields. Keeps the two optional groups (Details / Socials) visually identical. */
function Disclosure({
  open,
  onToggle,
  icon,
  label,
  hint,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-secondary/20 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/40"
      >
        <span className="inline-flex items-center gap-2">
          {icon} {label}
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">{hint}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div className="field-reveal mt-4 space-y-4">{children}</div>}
    </div>
  );
}
