"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Users, Radio, MapPin, CalendarDays, Lock } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { OrgShell } from "@/components/organizer/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface OrgEvent {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  status: "upcoming" | "active" | "ended";
  requires_code: boolean;
}

export default function OrganizerDashboard() {
  const { user, checked } = useOrganizer();
  const [events, setEvents] = useState<OrgEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    apiFetch<OrgEvent[]>("/events/mine")
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load events"));
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!checked || !user) {
    return (
      <OrgShell>
        <Centered label="Loading…" />
      </OrgShell>
    );
  }

  return (
    <OrgShell>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-[-0.02em] text-foreground">Your events</h1>
        <Button variant="accent" onClick={() => setCreating((v) => !v)} className="gap-1.5">
          <Plus className="h-4 w-4" /> New event
        </Button>
      </div>

      {creating && (
        <CreateEventForm
          onCreated={() => {
            setCreating(false);
            load();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {events === null && !error && (
        <div className="mt-6 space-y-3">
          <div className="h-24 animate-pulse rounded-2xl border border-border bg-card/40" />
          <div className="h-24 animate-pulse rounded-2xl border border-border bg-card/40" />
        </div>
      )}

      {events && events.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
          <CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-display text-lg text-foreground">No events yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create your first event to get started.</p>
        </div>
      )}

      {events && events.length > 0 && (
        <ul className="mt-6 space-y-3">
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </OrgShell>
  );
}

function EventRow({ event }: { event: OrgEvent }) {
  const status = {
    upcoming: "bg-ice/15 text-ice",
    active: "bg-ember/15 text-ember",
    ended: "bg-muted text-muted-foreground",
  }[event.status];
  const day = new Date(`${event.date}T${event.time || "00:00:00"}`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return (
    <li className="rounded-2xl border border-border bg-card/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide", status)}>
              {event.status === "active" ? "Live" : event.status}
            </span>
            {event.requires_code && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Has access code" />}
          </div>
          <h2 className="mt-2 truncate font-display text-lg text-foreground">{event.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {day} · {formatTime(event.time)}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {event.location}</span>
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex gap-2">
        <Link href={`/organizer/event/${event.id}/people`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
          <Users className="h-4 w-4" aria-hidden /> People
        </Link>
        <Link href={`/organizer/event/${event.id}/live`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90">
          <Radio className="h-4 w-4" aria-hidden /> Run event
        </Link>
      </div>
    </li>
  );
}

function CreateEventForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: "",
    date: "",
    time: "",
    location: "",
    num_tables: "8",
    seats_per_table: "4",
    default_round_duration_seconds: "300",
    access_code: "",
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
          default_round_duration_seconds: Number(form.default_round_duration_seconds),
          access_code: form.access_code.trim() || null,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the event");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-2xl border border-border bg-card/50 p-5">
      <h2 className="font-display text-lg text-foreground">New event</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Event name" name="ev-name" required>
            {(p) => <Input {...p} required value={form.name} onChange={set("name")} placeholder="Founders & Friends Summer Mixer" />}
          </Field>
        </div>
        <Field label="Date" name="ev-date" required>
          {(p) => <Input {...p} type="date" required value={form.date} onChange={set("date")} />}
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
        <Field label="Seats per table" name="ev-seats" required hint="Minimum 3.">
          {(p) => <Input {...p} type="number" min={3} required value={form.seats_per_table} onChange={set("seats_per_table")} />}
        </Field>
        <Field label="Round length (seconds)" name="ev-dur" required>
          {(p) => <Input {...p} type="number" min={30} required value={form.default_round_duration_seconds} onChange={set("default_round_duration_seconds")} />}
        </Field>
        <Field label="Access code" name="ev-code" hint="Optional — attendees enter it to register.">
          {(p) => <Input {...p} value={form.access_code} onChange={set("access_code")} placeholder="MIXER" />}
        </Field>
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

function formatTime(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function Centered({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-16 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
