"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, Users, Radio, MapPin, CalendarDays, Lock, Archive, ArchiveRestore, Sparkles } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { Card, StatusChip } from "@/components/organizer/console-ui";
import { AccessCodeControl } from "@/components/organizer/access-code-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { eventColor } from "@/lib/design/event-cover";
import { cn, todayDateStr } from "@/lib/utils";

export interface OrgEvent {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  status: "upcoming" | "active" | "ended";
  requires_code: boolean;
  is_archived: boolean;
  cover_image_url: string | null;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function EventCard({ event, onChanged, index = 0 }: { event: OrgEvent; onChanged: () => void; index?: number }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const day = new Date(`${event.date}T${event.time || "00:00:00"}`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const cover = eventColor(event.id);
  const ended = event.status === "ended";

  async function setArchived(archived: boolean) {
    setBusy(true);
    try {
      await apiFetch(`/events/${event.id}/${archived ? "archive" : "unarchive"}`, { method: "POST" });
      onChanged();
    } catch {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay: index * 0.04 }}
    >
      <Card className={cn("flex h-full flex-col overflow-hidden p-0", event.is_archived && "opacity-70")}>
        {/* Cover band: image when set, else the deterministic color as a soft
            two-stop gradient (same band treatment as the attendee card). Tall enough
            to read as a banner (not a thin strip) and to let a real photo breathe. */}
        <div
          className="group/cover relative h-32 overflow-hidden sm:h-36"
          style={{
            backgroundColor: cover.bg, // solid fallback if color-mix() is unsupported
            backgroundImage: `linear-gradient(140deg, ${cover.bg} 0%, color-mix(in srgb, ${cover.bg} 70%, #000) 100%)`,
          }}
        >
          {event.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.cover_image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/cover:scale-105"
            />
          ) : (
            // Flat brand color + one clean corner bubble — same language as the KPI
            // stat tiles (metric-tile.tsx), so the color treatment is consistent app-wide.
            <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-15" style={{ background: cover.ink }} aria-hidden />
          )}
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            {event.is_archived && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
                <Archive className="h-3 w-3" aria-hidden /> Archived
              </span>
            )}
            <StatusChip status={event.status} solid />
          </div>
          {event.requires_code && (
            <Lock className="absolute bottom-3 left-4 h-3.5 w-3.5" style={{ color: cover.ink }} aria-label="Has access code" />
          )}
        </div>

        <div className="flex flex-1 flex-col p-5">
          <h2 className="truncate font-display text-xl text-foreground">{event.name}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {day} · {formatTime(event.time)}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {event.location}</span>
          </p>

          {event.is_archived ? (
            <div className="mt-4">
              <Button variant="outline" onClick={() => setArchived(false)} disabled={busy} className="w-full gap-1.5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}
                Unarchive
              </Button>
            </div>
          ) : (
            <>
              {/* Access code sits directly under the meta — no large gap. */}
              <div className="mt-4">
                <AccessCodeControl eventId={event.id} initialHasCode={event.requires_code} />
              </div>

              <div className="mt-3 flex gap-2">
                <Link href={`/organizer/event/${event.id}/people`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
                  <Users className="h-4 w-4" aria-hidden /> People
                </Link>
                {ended ? (
                  <Link href={`/organizer/event/${event.id}/live`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent py-2 text-sm font-medium text-accent-foreground transition-transform hover:-translate-y-0.5">
                    <Sparkles className="h-4 w-4" aria-hidden /> View recap
                  </Link>
                ) : (
                  <Link href={`/organizer/event/${event.id}/live`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent py-2 text-sm font-medium text-accent-foreground transition-transform hover:-translate-y-0.5">
                    <Radio className="h-4 w-4" aria-hidden /> Run event
                  </Link>
                )}
              </div>

              {/* Archive — only when not live (a running room can't be archived). */}
              {event.status !== "active" && (
                <div className="mt-3">
                  {confirming ? (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setArchived(true)} disabled={busy} className="gap-1.5 text-destructive">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                        Archive?
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden /> Archive
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

export function CreateEventForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: "",
    date: "",
    time: "",
    location: "",
    num_tables: "8",
    seats_per_table: "4",
    round_minutes: "5",
    access_code: "",
    cover_image_url: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/events", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          date: form.date,
          time: form.time.length === 5 ? `${form.time}:00` : form.time,
          location: form.location.trim(),
          num_tables: Number(form.num_tables),
          seats_per_table: Number(form.seats_per_table),
          default_round_duration_seconds: Math.max(1, Number(form.round_minutes)) * 60,
          access_code: form.access_code.trim() || null,
          cover_image_url: form.cover_image_url.trim() || null,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the event");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-card/50 p-5">
      <h2 className="font-display text-lg text-foreground">New event</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Event name" name="ev-name" required>
            {(p) => <Input {...p} required value={form.name} onChange={set("name")} placeholder="Founders & Friends Summer Mixer" />}
          </Field>
        </div>
        <Field label="Date" name="ev-date" required>
          {(p) => (
            <Input {...p} type="date" required min={todayDateStr()} max="2100-12-31" value={form.date} onChange={set("date")} />
          )}
        </Field>
        <Field label="Start time" name="ev-time" required>
          {(p) => <Input {...p} type="time" required value={form.time} onChange={set("time")} />}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Location" name="ev-location" required>
            {(p) => <Input {...p} required value={form.location} onChange={set("location")} placeholder="The Garage, Hyderabad" />}
          </Field>
        </div>
        <Field label="Tables" name="ev-tables" required>
          {(p) => <Input {...p} type="number" min={1} required value={form.num_tables} onChange={set("num_tables")} />}
        </Field>
        <Field label="Max per table" name="ev-seats" required hint="The largest a table gets (min 3). Tune the minimum later in settings.">
          {(p) => <Input {...p} type="number" min={3} required value={form.seats_per_table} onChange={set("seats_per_table")} />}
        </Field>
        <Field label="Round length (minutes)" name="ev-dur" required hint="Minutes each round runs.">
          {(p) => <Input {...p} type="number" min={1} required value={form.round_minutes} onChange={set("round_minutes")} />}
        </Field>
        <Field label="Access code" name="ev-code" hint="Optional — set once, then permanent.">
          {(p) => <Input {...p} value={form.access_code} onChange={set("access_code")} placeholder="MIXER" />}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Cover image URL" name="ev-cover" hint="Optional — paste an image link. Leave blank for an auto color.">
            {(p) => <Input {...p} type="url" value={form.cover_image_url} onChange={set("cover_image_url")} placeholder="https://…/cover.jpg" />}
          </Field>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="accent" disabled={busy} className="flex-1">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Creating…" : "Create event"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function formatTime(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
