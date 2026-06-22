"use client";

import { use, useEffect, useRef, useState } from "react";
import { Loader2, Check, Save, KeyRound, CalendarDays, SlidersHorizontal, ListChecks, Megaphone, Plus, Trash2 } from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { ConsoleShell } from "@/components/organizer/console-shell";
import { Card, Toggle, ConsoleGate } from "@/components/organizer/console-ui";
import { EventHeader, EventAccessError, type EventStatus } from "@/components/organizer/event-header";
import { AccessCodeControl } from "@/components/organizer/access-code-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { ROUNDS, roundFor, defaultRoundName } from "@/lib/design/rounds";

const MAX_SPONSORS = 20;

/** A sponsor row being edited. `key` is a stable client id for React. */
interface SponsorDraft {
  key: string;
  name: string;
  image_url: string;
  tagline: string;
  url: string;
}
interface SponsorApi {
  id: string;
  name: string;
  image_url: string | null;
  tagline: string | null;
  url: string | null;
}
const newSponsor = (): SponsorDraft => ({
  key: crypto.randomUUID(),
  name: "",
  image_url: "",
  tagline: "",
  url: "",
});

// How many agenda rows to show when "Planned rounds" is left blank (auto-plan):
// the canonical palette length is a sensible editing surface; names cycle past it.
const DEFAULT_AGENDA_ROWS = ROUNDS.length;
const MAX_AGENDA_ROWS = 12;

interface OrgEvent {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  description: string | null;
  num_tables: number;
  seats_per_table: number;
  min_per_table: number | null;
  max_per_table: number | null;
  default_round_duration_seconds: number;
  auto_arrive_on_register: boolean;
  auto_advance: boolean;
  target_rounds: number | null;
  round_topics: string[];
  logo_url: string | null;
  cover_image_url: string | null;
  show_event_logo: boolean;
  status: EventStatus;
  requires_code: boolean;
}

export default function EventSettings({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { user, checked } = useOrganizer();

  const [event, setEvent] = useState<OrgEvent | null>(null);
  const [denied, setDenied] = useState<null | "forbidden" | "missing">(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [description, setDescription] = useState("");
  const [tables, setTables] = useState("");
  const [seats, setSeats] = useState("");
  const [minPer, setMinPer] = useState("");
  const [minutes, setMinutes] = useState("");
  const [targetRounds, setTargetRounds] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [autoArrive, setAutoArrive] = useState(false); // off by default; overwritten with the event's real value on load
  const [autoAdvance, setAutoAdvance] = useState(true); // on by default; auto-end a round when its timer runs out
  const [logoUrl, setLogoUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [showLogo, setShowLogo] = useState(true);
  const [sponsors, setSponsors] = useState<SponsorDraft[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Hydrate the form ONCE per event. The auth listener hands us a fresh `user`
  // object whenever Supabase refreshes the token (which happens on tab refocus) —
  // without this guard, coming back to the tab would re-run the load and wipe any
  // unsaved typing (sponsor URLs, logo, etc.). Use the Refresh/reload to re-pull.
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    if (hydratedRef.current === eventId) return; // already loaded — don't clobber edits
    hydratedRef.current = eventId;
    // /events/mine is owner-scoped — if this event isn't in it, the caller
    // doesn't own it (or it's gone), so we gate access the same way live/people do.
    apiFetch<OrgEvent[]>("/events/mine")
      .then((mine) => {
        const ev = mine.find((e) => e.id === eventId);
        if (!ev) {
          setDenied("forbidden");
          return;
        }
        setEvent(ev);
        setName(ev.name);
        setLocation(ev.location);
        setDate(ev.date);
        setTime((ev.time || "").slice(0, 5));
        setDescription(ev.description ?? "");
        setTables(String(ev.num_tables));
        setSeats(String(ev.seats_per_table));
        setMinPer(ev.min_per_table ? String(ev.min_per_table) : "");
        setMinutes(String(Math.max(1, Math.round(ev.default_round_duration_seconds / 60))));
        setTargetRounds(ev.target_rounds ? String(ev.target_rounds) : "");
        setTopics(ev.round_topics ?? []);
        setAutoArrive(ev.auto_arrive_on_register);
        setAutoAdvance(ev.auto_advance ?? true);
        setLogoUrl(ev.logo_url ?? "");
        setCoverImageUrl(ev.cover_image_url ?? "");
        setShowLogo(ev.show_event_logo);
        // Sponsors live in their own table — load them separately.
        apiFetch<{ sponsors: SponsorApi[] }>(`/events/${eventId}/sponsors`)
          .then((r) =>
            setSponsors(
              (r.sponsors ?? []).map((s) => ({
                key: crypto.randomUUID(),
                name: s.name ?? "",
                image_url: s.image_url ?? "",
                tagline: s.tagline ?? "",
                url: s.url ?? "",
              })),
            ),
          )
          .catch(() => {});
      })
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setDenied("forbidden"); // terminal — leave the guard set, don't retry-loop
        } else {
          hydratedRef.current = null; // transient failure — allow a retry on the next auth tick
          setError(e instanceof Error ? e.message : "Couldn't load this event");
        }
      });
  }, [user, eventId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // Catch a min > max mix-up here, not live at round-start (reliability first).
    if (minPer.trim() && Number(seats) && Number(minPer) > Number(seats)) {
      setError(`Min per table (${minPer}) can't be larger than the max (${seats}).`);
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<OrgEvent>(`/events/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          location: location.trim(),
          date,
          time: time.length === 5 ? `${time}:00` : time,
          description: description.trim() || null,
          num_tables: Number(tables),
          // "Seats per table" is the max/ceiling; "Max per table" override is retired
          // from the UI (one ceiling, no duplication), so we never send max_per_table.
          seats_per_table: Number(seats),
          min_per_table: minPer.trim() ? Number(minPer) : null,
          default_round_duration_seconds: Math.max(1, Number(minutes)) * 60,
          auto_arrive_on_register: autoArrive,
          auto_advance: autoAdvance,
          target_rounds: targetRounds.trim() ? Number(targetRounds) : null,
          round_topics: topics.slice(0, agendaRows).map((t) => (t ?? "").trim()),
          logo_url: logoUrl.trim(), // "" clears the logo
          cover_image_url: coverImageUrl.trim(), // "" clears the cover (back to color)
          show_event_logo: showLogo,
        }),
      });
      // Sponsors live in their own table — saved as a whole-list replace. The
      // backend drops blank rows and caps the count.
      await apiFetch(`/events/${eventId}/sponsors`, {
        method: "PUT",
        body: JSON.stringify({
          sponsors: sponsors.map((s) => ({
            name: s.name.trim(),
            image_url: s.image_url.trim() || null,
            tagline: s.tagline.trim() || null,
            url: s.url.trim() || null,
          })),
        }),
      });
      setEvent((prev) => (prev ? { ...prev, ...updated } : prev));
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) setDenied("forbidden");
      else setError(err instanceof Error ? err.message : "Couldn't save — try again");
    } finally {
      setSaving(false);
    }
  }

  // Pre-auth / redirecting: neutral splash, never the console chrome (see ConsoleGate).
  if (!checked || !user) return <ConsoleGate />;

  if (denied) {
    return (
      <ConsoleShell>
        <EventHeader eventId={eventId} active="settings" />
        <EventAccessError notFound={denied === "missing"} />
      </ConsoleShell>
    );
  }

  if (!event) {
    return (
      <ConsoleShell>
        <EventHeader eventId={eventId} active="settings" />
        <div className="space-y-4">
          <div className="h-48 skeleton rounded-2xl border border-border" />
          <div className="h-64 skeleton rounded-2xl border border-border" />
        </div>
      </ConsoleShell>
    );
  }

  // Comfortable capacity = tables x max-per-table (the "Seats per table" ceiling).
  // The room can still overfill past this — the live preview warns when it does.
  const capacity = (Number(tables) || 0) * (Number(seats) || 0);
  // How many agenda rows to edit: one per planned round, else a sensible default.
  const agendaRows = Math.min(
    MAX_AGENDA_ROWS,
    targetRounds.trim() ? Math.max(1, Number(targetRounds)) : DEFAULT_AGENDA_ROWS,
  );
  const setTopicAt = (i: number, value: string) =>
    setTopics((prev) => {
      const next = [...prev];
      while (next.length <= i) next.push("");
      next[i] = value;
      return next;
    });

  const updateSponsor = (key: string, patch: Partial<SponsorDraft>) =>
    setSponsors((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const removeSponsor = (key: string) => setSponsors((prev) => prev.filter((s) => s.key !== key));
  const addSponsor = () => setSponsors((prev) => (prev.length >= MAX_SPONSORS ? prev : [...prev, newSponsor()]));

  return (
    <ConsoleShell>
      <EventHeader eventId={eventId} name={event.name} status={event.status} active="settings" />

      <form onSubmit={save} className="space-y-6">
        {/* Details */}
        <Section icon={CalendarDays} title="Details" subtitle="What attendees see on the invite and registration page.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Event name" name="s-name" required className="sm:col-span-2">
              {(p) => <Input {...p} required value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="Date" name="s-date" required>
              {(p) => <Input {...p} type="date" required max="9999-12-31" value={date} onChange={(e) => setDate(e.target.value)} />}
            </Field>
            <Field label="Start time" name="s-time" required>
              {(p) => <Input {...p} type="time" required value={time} onChange={(e) => setTime(e.target.value)} />}
            </Field>
            <Field label="Location" name="s-loc" required className="sm:col-span-2">
              {(p) => <Input {...p} required value={location} onChange={(e) => setLocation(e.target.value)} />}
            </Field>
            <Field label="Description" name="s-desc" className="sm:col-span-2">
              {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A line about the vibe, the crowd, what to expect…" />}
            </Field>
          </div>
        </Section>

        {/* Format */}
        <Section icon={SlidersHorizontal} title="Format" subtitle="How the room is seated and how rounds run.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tables" name="s-tables" required>
              {(p) => <Input {...p} type="number" min={1} required value={tables} onChange={(e) => setTables(e.target.value)} />}
            </Field>
            <Field label="Round length" name="s-min" required hint="Minutes each round runs.">
              {(p) => <Input {...p} type="number" min={1} required value={minutes} onChange={(e) => setMinutes(e.target.value)} />}
            </Field>
            <Field label="Max per table" name="s-seats" required hint="The largest a table gets — the comfortable size.">
              {(p) => <Input {...p} type="number" min={3} required value={seats} onChange={(e) => setSeats(e.target.value)} />}
            </Field>
            <Field label="Min per table" name="s-minper" hint="Optional. Blank = auto (3). Lowest is 2.">
              {(p) => <Input {...p} type="number" min={2} value={minPer} onChange={(e) => setMinPer(e.target.value)} placeholder="auto" />}
            </Field>
            <Field label="Planned rounds" name="s-rounds" hint="Leave blank to auto-plan from room size.">
              {(p) => <Input {...p} type="number" min={1} value={targetRounds} onChange={(e) => setTargetRounds(e.target.value)} />}
            </Field>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Seats up to <span className="font-medium text-foreground">{capacity || "—"}</span> people per round. Every
            table fills to the <span className="font-medium text-foreground">min</span> first, then leftover people join
            existing tables (growing toward the <span className="font-medium text-foreground">max</span>) — e.g. 22 at
            min 3 become one table of 4 and six of 3, never a table of 2. If the room can&apos;t fit everyone under the
            max, nobody&apos;s dropped: the preview overfills and warns you so you can add a table or accept the squeeze.
          </p>

          {/* Auto check-in toggle — the one that controls the People "Check in all" flow */}
          <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-border bg-background/40 p-4">
            <div>
              <div className="text-sm font-medium text-foreground">Auto check-in on registration</div>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                On: people are marked <span className="font-medium text-foreground">arrived</span> the moment they register — best when they sign up at the door.
                Off: they stay <span className="font-medium text-foreground">registered</span> until you check them in, which turns on the
                {" "}<span className="font-medium text-foreground">“Check in all”</span> button and the not-here-yet chase-list in People.
              </p>
            </div>
            <Toggle checked={autoArrive} onChange={setAutoArrive} />
          </div>

          {/* Auto-advance toggle — when a round's timer runs out, end it automatically. */}
          <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-border bg-background/40 p-4">
            <div>
              <div className="text-sm font-medium text-foreground">Auto-end rounds when the timer runs out</div>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                On: when a round&apos;s clock hits zero, the control room ends it for you (keep the
                live page open). Off: rounds run until you tap <span className="font-medium text-foreground">End round</span>.
                Either way you can <span className="font-medium text-foreground">Add time</span> or end early.
              </p>
            </div>
            <Toggle checked={autoAdvance} onChange={setAutoAdvance} />
          </div>
        </Section>

        {/* Agenda */}
        <Section
          icon={ListChecks}
          title="Round agenda"
          subtitle="Name each round's theme. It shows on attendees' phones and steers the AI icebreakers for that round."
        >
          <div className="space-y-2.5">
            {Array.from({ length: agendaRows }, (_, i) => {
              const color = roundFor(i);
              return (
                <div key={i} className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
                    style={{ background: color.bg, color: color.ink }}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <label className="sr-only" htmlFor={`topic-${i}`}>
                    Round {i + 1} theme
                  </label>
                  <Input
                    id={`topic-${i}`}
                    value={topics[i] ?? ""}
                    maxLength={80}
                    onChange={(e) => setTopicAt(i, e.target.value)}
                    placeholder={defaultRoundName(i)}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Leave a row blank to use its default name ({defaultRoundName(0)}, {defaultRoundName(1)}…).
            {targetRounds.trim()
              ? ""
              : " You haven't set a planned-round count, so themes cycle if the night runs longer."}
          </p>
        </Section>

        {/* Sponsors & branding */}
        <Section
          icon={Megaphone}
          title="Sponsors & branding"
          subtitle="Shown to attendees between rounds and in the lobby — rotating around the hourglass."
        >
          {/* Event logo + co-brand toggle */}
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-foreground">Show your event logo</div>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  On: attendees see <span className="font-medium text-foreground">your logo</span> alongside sponsors (co-branding).
                  Off: sponsors only.
                </p>
              </div>
              <Toggle checked={showLogo} onChange={setShowLogo} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Logo image URL" name="logo-url" hint="Paste a hosted image link (PNG/SVG/JPG).">
                {(p) => (
                  <Input
                    {...p}
                    type="url"
                    inputMode="url"
                    placeholder="https://…/logo.png"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                  />
                )}
              </Field>
              <LogoPreview url={logoUrl} />
            </div>
            <div className="mt-4">
              <Field label="Cover image URL" name="cover-url" hint="Optional — the hero image on this event's card. Blank = an auto color.">
                {(p) => (
                  <Input
                    {...p}
                    type="url"
                    inputMode="url"
                    placeholder="https://…/cover.jpg"
                    value={coverImageUrl}
                    onChange={(e) => setCoverImageUrl(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>

          {/* Sponsor list */}
          <div className="mt-5 space-y-4">
            {sponsors.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-background/30 px-4 py-6 text-center text-sm text-muted-foreground">
                No sponsors yet. Add one to fill the between-rounds screen.
              </p>
            ) : (
              sponsors.map((s, idx) => (
                <div key={s.key} className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Sponsor {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSponsor(s.key)}
                      aria-label={`Remove sponsor ${idx + 1}`}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Name" name={`sp-name-${s.key}`}>
                      {(p) => <Input {...p} value={s.name} maxLength={80} onChange={(e) => updateSponsor(s.key, { name: e.target.value })} placeholder="Acme Corp" />}
                    </Field>
                    <Field label="Website (optional)" name={`sp-url-${s.key}`}>
                      {(p) => <Input {...p} type="url" inputMode="url" value={s.url} onChange={(e) => updateSponsor(s.key, { url: e.target.value })} placeholder="https://acme.com" />}
                    </Field>
                    <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <Field label="Logo image URL" name={`sp-img-${s.key}`}>
                        {(p) => <Input {...p} type="url" inputMode="url" value={s.image_url} onChange={(e) => updateSponsor(s.key, { image_url: e.target.value })} placeholder="https://…/acme.png" />}
                      </Field>
                      <LogoPreview url={s.image_url} />
                    </div>
                    <Field label="Tagline (optional)" name={`sp-tag-${s.key}`} className="sm:col-span-2">
                      {(p) => <Input {...p} value={s.tagline} maxLength={160} onChange={(e) => updateSponsor(s.key, { tagline: e.target.value })} placeholder="Backing bold founders since 2019" />}
                    </Field>
                  </div>
                </div>
              ))
            )}
            {sponsors.length < MAX_SPONSORS && (
              <Button type="button" variant="outline" onClick={addSponsor} className="gap-2">
                <Plus className="h-4 w-4" aria-hidden /> Add sponsor
              </Button>
            )}
          </div>
        </Section>

        {/* Access */}
        <Section icon={KeyRound} title="Access code" subtitle="Attendees enter this to join. Share it in person — never link the code.">
          <AccessCodeControl eventId={eventId} initialHasCode={event.requires_code} />
        </Section>

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Sticky save bar */}
        <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-2xl border border-border bg-card/90 p-3 backdrop-blur-xl">
          <Button type="submit" variant="accent" size="lg" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
          </Button>
          {saved && <span className="text-sm text-success">Your changes are live.</span>}
        </div>
      </form>
    </ConsoleShell>
  );
}

/** Small live thumbnail of a pasted image URL; falls back to a placeholder. */
function LogoPreview({ url }: { url: string }) {
  const trimmed = url.trim();
  return (
    <div className="flex h-[42px] w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
      {trimmed ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL
        <img src={trimmed} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
      ) : (
        <span className="text-[10px] text-muted-foreground">preview</span>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-lg leading-tight text-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}
