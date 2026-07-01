"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, Globe, Linkedin, Instagram, Mail, StickyNote, Loader2, Check, CalendarDays, Bookmark, UserCheck, Users, Sparkles, UserPlus } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { Avatar } from "@/components/brand/avatar";
import { Highlight } from "@/components/connections/search-box";
import { WhatsAppGlyph, XGlyph } from "@/components/brand/glyphs";
import { saveContact } from "@/lib/vcard";
import { whatsappHref, instagramHref, xHref, atHandle } from "@/lib/url";
import { cn } from "@/lib/utils";

/** One round-level connection row as returned by the API. */
export interface Connection {
  attendee_id: string;
  name: string;
  role: string;
  company: string | null;
  looking_for: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  phone: string | null;            // present only when the owner made it visible
  phone_dial_code: string | null;
  instagram: string | null;
  twitter: string | null;
  email: string | null;
  avatar_url: string | null;
  interests: string[];
  shared_interests: string[];
  note: string | null;
  round_number: number;
  table_number: number;
  met?: boolean;       // we actually shared a table (default true for older payloads)
  wanted?: boolean;    // I picked them pre-event ("want to meet")
  wants_me?: boolean;  // they picked me
  liked: boolean;
  mutual: boolean;
  saved: boolean;
}

/** A person, de-duplicated across the rounds you shared with them. */
export interface Person {
  attendee_id: string;
  name: string;
  role: string;
  company: string | null;
  looking_for: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  phone: string | null;
  phone_dial_code: string | null;
  instagram: string | null;
  twitter: string | null;
  email: string | null;
  avatar_url: string | null;
  interests: string[];
  shared_interests: string[];
  note: string | null;
  rounds: number[];
  met: boolean;
  wanted: boolean;
  wants_me: boolean;
  liked: boolean;
  mutual: boolean;
  saved: boolean;
  /** Which event this connection came from — shown only on the cross-event rolodex. */
  eventLabel?: string;
}

/** Group round-level rows into one card per person, matches first. */
export function groupByPerson(rows: Connection[]): Person[] {
  const map = new Map<string, Person>();
  for (const c of rows) {
    const met = c.met ?? true;
    const p = map.get(c.attendee_id);
    if (p) {
      // Only real shared rounds count toward the "met in round" list (a pick /
      // co-attendee row carries round 0 and must not show up as "round 0").
      if (met && !p.rounds.includes(c.round_number)) p.rounds.push(c.round_number);
      p.met = p.met || met;
      p.wanted = p.wanted || Boolean(c.wanted);
      p.wants_me = p.wants_me || Boolean(c.wants_me);
      p.liked = p.liked || c.liked;
      p.mutual = p.mutual || c.mutual;
      p.saved = p.saved || c.saved;
    } else {
      map.set(c.attendee_id, {
        attendee_id: c.attendee_id,
        name: c.name,
        role: c.role,
        company: c.company,
        looking_for: c.looking_for,
        linkedin_url: c.linkedin_url,
        website_url: c.website_url,
        phone: c.phone,
        phone_dial_code: c.phone_dial_code,
        instagram: c.instagram,
        twitter: c.twitter,
        email: c.email,
        avatar_url: c.avatar_url,
        interests: c.interests ?? [],
        shared_interests: c.shared_interests ?? [],
        note: c.note,
        rounds: met ? [c.round_number] : [],
        met,
        wanted: Boolean(c.wanted),
        wants_me: Boolean(c.wants_me),
        liked: c.liked,
        mutual: c.mutual,
        saved: c.saved,
      });
    }
  }
  // Matches first, then people you met, then everyone else; alpha within each tier.
  return [...map.values()].sort(
    (a, b) =>
      Number(b.mutual) - Number(a.mutual) ||
      Number(b.met) - Number(a.met) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * A single connection card: avatar, role, match state, shared/other interests,
 * contact links, and an inline private note. Used by the per-event rolodex and
 * the cross-event "My connections" page. `eventId` scopes the private note save
 * (on the cross-event page it's that connection's own event).
 */
export function PersonCard({
  person,
  eventId,
  onSavedChange,
  highlight = [],
  viewerName,
  eventName,
}: {
  person: Person;
  eventId: string;
  /** Notifies a parent (e.g. the Saved filter) when this card's saved state flips. */
  onSavedChange?: (attendeeId: string, saved: boolean) => void;
  /** Active search terms — matched substrings get highlighted in the card text. */
  highlight?: string[];
  /** The caller's own name — used to prefill the WhatsApp intro ("Hi I am …"). */
  viewerName?: string;
  /** The event these two met at — the cross-event card supplies its own via `eventLabel`. */
  eventName?: string;
}) {
  const roleLine = [person.role, person.company].filter(Boolean).join(" · ");
  const sharedSet = new Set(person.shared_interests.map((s) => s.toLowerCase()));
  const otherInterests = person.interests.filter((t) => !sharedSet.has(t.toLowerCase()));
  const rounds = [...person.rounds].sort((a, b) => a - b);

  // Contact channels. The event label (for the WhatsApp intro + vCard note) is the
  // connection's own event on the cross-event page, else the current event's name.
  const metAtLabel = person.eventLabel ?? eventName;
  const whatsappNumber = person.phone
    ? `${person.phone_dial_code ?? ""}${person.phone}`.replace(/\s+/g, "")
    : null;
  const waMessage = viewerName
    ? `Hi, I'm ${viewerName}${metAtLabel ? ` — we met at ${metAtLabel}` : ""} 👋`
    : `Hi${metAtLabel ? ` — we met at ${metAtLabel}` : "!"} 👋`;
  const waHref = whatsappHref(person.phone_dial_code, person.phone, waMessage);
  const igHref = instagramHref(person.instagram);
  const twHref = xHref(person.twitter);

  const [saved, setSaved] = useState(person.saved);
  const [saveBusy, setSaveBusy] = useState(false);

  async function toggleSave() {
    if (saveBusy) return;
    const next = !saved;
    setSaved(next); // optimistic
    onSavedChange?.(person.attendee_id, next);
    setSaveBusy(true);
    try {
      await apiFetch(`/events/${eventId}/bookmarks/${person.attendee_id}`, {
        method: next ? "PUT" : "DELETE",
      });
    } catch {
      setSaved(!next); // revert on failure
      onSavedChange?.(person.attendee_id, !next);
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md",
        person.mutual
          ? "border-accent/45 bg-gradient-to-br from-accent/[0.10] via-card/40 to-card/40 ring-1 ring-inset ring-accent/15"
          : "border-border bg-card/50 hover:border-foreground/15",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("shrink-0 rounded-full", person.mutual && "ring-2 ring-accent/40")}>
          <Avatar name={person.name} seed={person.attendee_id} src={person.avatar_url} size={48} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-semibold text-foreground">
              <Highlight text={person.name} terms={highlight} />
            </p>
            {person.mutual ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent">
                <Heart className="h-2.5 w-2.5 fill-current" aria-hidden /> Match
              </span>
            ) : person.liked ? (
              <Heart className="h-3.5 w-3.5 shrink-0 fill-accent text-accent" aria-label="You liked them" />
            ) : null}
            {person.wanted && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                <UserCheck className="h-2.5 w-2.5" aria-hidden /> {person.wants_me && !person.mutual ? "Both keen" : "You picked"}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            <Highlight text={roleLine} terms={highlight} />
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {person.met ? (
              <MetaChip icon={<Sparkles className="h-3 w-3" aria-hidden />}>
                Met in {rounds.length > 1 ? "rounds" : "round"} {rounds.join(", ")}
              </MetaChip>
            ) : person.wanted ? (
              <MetaChip icon={<UserCheck className="h-3 w-3" aria-hidden />} accent>
                You wanted to meet
              </MetaChip>
            ) : (
              <MetaChip icon={<Users className="h-3 w-3" aria-hidden />}>In the room together</MetaChip>
            )}
            {person.eventLabel && (
              <MetaChip icon={<CalendarDays className="h-3 w-3" aria-hidden />}>{person.eventLabel}</MetaChip>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${person.name} from saved` : `Save ${person.name}`}
          title={saved ? "Saved — tap to remove" : "Save contact"}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all active:scale-90 disabled:opacity-60",
            saved ? "border-accent/50 bg-accent/15 text-accent" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <Bookmark className={cn("h-4 w-4", saved && "fill-current")} aria-hidden />
        </button>
      </div>

      {person.looking_for && (
        <p className="mt-3 text-xs text-muted-foreground">
          <span className="text-muted-foreground/70">Looking for:</span>{" "}
          <Highlight text={person.looking_for} terms={highlight} />
        </p>
      )}

      {(person.shared_interests.length > 0 || otherInterests.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {person.shared_interests.map((tag) => (
            <span key={`s-${tag}`} className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent">
              <Highlight text={tag} terms={highlight} />
            </span>
          ))}
          {otherInterests.map((tag) => (
            <span key={`o-${tag}`} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
              <Highlight text={tag} terms={highlight} />
            </span>
          ))}
        </div>
      )}

      {/* Sleek, bare contact actions — a hairline divider then small muted glyphs
          that lift + colour on hover. Each glyph stays ~18px but carries an
          invisible padded hit-area (~38px) so it's still thumb-friendly on mobile,
          and is labelled (aria + desktop tooltip) so dropping the text stays clear. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-1 border-t border-border/60 pt-2.5">
        <ActionIcon
          label="Add to contacts"
          title="Save to your phone's contacts"
          onClick={() =>
            saveContact(
              {
                ...person,
                phone_full: whatsappNumber,
                instagram: person.instagram,
                twitter: person.twitter,
                email: person.email,
              },
              metAtLabel,
            )
          }
        >
          <UserPlus className="h-[18px] w-[18px]" aria-hidden />
        </ActionIcon>
        {waHref && (
          <ActionIcon label={`Message ${person.name} on WhatsApp`} title="WhatsApp" href={waHref}>
            <WhatsAppGlyph className="h-[18px] w-[18px]" />
          </ActionIcon>
        )}
        {person.email && <MailAction email={person.email} name={person.name} />}
        {igHref && (
          <ActionIcon label={`${person.name} on Instagram`} title={atHandle(person.instagram, "instagram.com")} href={igHref}>
            <Instagram className="h-[18px] w-[18px]" aria-hidden />
          </ActionIcon>
        )}
        {twHref && (
          <ActionIcon label={`${person.name} on X`} title={atHandle(person.twitter, "x.com")} href={twHref}>
            <XGlyph className="h-[18px] w-[18px]" />
          </ActionIcon>
        )}
        {person.linkedin_url && (
          <ActionIcon label={`${person.name} on LinkedIn`} href={person.linkedin_url}>
            <Linkedin className="h-[18px] w-[18px]" aria-hidden />
          </ActionIcon>
        )}
        {person.website_url && (
          <ActionIcon label={`${person.name}'s website`} href={person.website_url}>
            <Globe className="h-[18px] w-[18px]" aria-hidden />
          </ActionIcon>
        )}
      </div>

      <NoteEditor eventId={eventId} targetId={person.attendee_id} initial={person.note} />
    </li>
  );
}

/**
 * A bare contact action glyph — renders as a link (external contact URLs) or a
 * button (vCard download). No border/background; the small icon lifts, scales and
 * brightens to the app accent on hover — one unified colour keeps the row cohesive
 * rather than a multi-brand rainbow. Padding gives it a ~38px hit-area so the tiny
 * glyph is still thumb-friendly.
 */
function ActionIcon({
  label,
  title,
  href,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls =
    "inline-flex items-center justify-center rounded-md p-2.5 text-muted-foreground transition-[color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:scale-110 hover:text-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={title ?? label} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} title={title ?? label} className={cls}>
      {children}
    </button>
  );
}

/**
 * Email action. One tap copies the address (works everywhere, unlike a `mailto:`
 * that dead-ends on a phone with no mail app configured) and briefly flips the
 * glyph to a check. Right-click / long-press still gets the native "copy link"
 * on the hidden mailto for anyone who wants to compose instead.
 */
function MailAction({ email, name }: { email: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      // Clipboard blocked (insecure context / permissions) — fall back to a prompt
      // so the address is still selectable/copyable by hand.
      window.prompt("Copy this email address:", email);
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  }

  const cls =
    "inline-flex items-center justify-center rounded-md p-2.5 text-muted-foreground transition-[color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:scale-110 hover:text-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${name}'s email copied` : `Copy ${name}'s email`}
      title={copied ? "Copied!" : email}
      className={cn(cls, copied && "text-success hover:text-success")}
    >
      {copied ? <Check className="h-[18px] w-[18px]" aria-hidden /> : <Mail className="h-[18px] w-[18px]" aria-hidden />}
    </button>
  );
}

/** A small pill for the card's meta row (how you met, which event). */
function MetaChip({ icon, children, accent }: { icon: React.ReactNode; children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none",
        accent ? "border-accent/30 bg-accent/10 text-accent" : "border-border/70 bg-secondary/40 text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Inline private note — collapsed to a prompt until tapped, saves on blur. */
function NoteEditor({ eventId, targetId, initial }: { eventId: string; targetId: string; initial: string | null }) {
  const [open, setOpen] = useState(Boolean(initial));
  const [note, setNote] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [showSaved, setShowSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <StickyNote className="h-3.5 w-3.5" aria-hidden /> Add a private note
      </button>
    );
  }

  async function save() {
    if (note.trim() === saved.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/events/${eventId}/notes/${targetId}`, {
        method: "PUT",
        body: JSON.stringify({ note: note.trim() }),
      });
      setSaved(note.trim());
      setShowSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setShowSaved(false), 1000);
    } catch {
      // keep the text so the user can retry; nothing destructive happened
    } finally {
      setBusy(false);
    }
  }

  const dirty = note.trim() !== saved.trim();
  return (
    <div className="mt-3">
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <StickyNote className="h-3 w-3" aria-hidden /> Private note · only you see this
      </label>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          if (showSaved) setShowSaved(false);
        }}
        onBlur={save}
        rows={2}
        maxLength={500}
        placeholder="e.g. intro to Priya re: hiring"
        className="mt-1.5 w-full resize-none rounded-xl border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      <div className="mt-1 flex h-4 items-center justify-end text-[11px] text-muted-foreground">
        {busy ? (
          <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving…</span>
        ) : dirty ? (
          <span>Tap outside to save</span>
        ) : showSaved ? (
          <span className="inline-flex items-center gap-1 text-success"><Check className="h-3 w-3" aria-hidden /> Saved</span>
        ) : null}
      </div>
    </div>
  );
}
