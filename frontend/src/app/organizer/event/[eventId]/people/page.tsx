"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Plus, UserCheck, UserMinus, Undo2, QrCode, Download, Search, UsersRound, ArrowDownUp, Star, Pencil, X } from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { ConsoleShell } from "@/components/organizer/console-shell";
import { Card, ConsoleGate } from "@/components/organizer/console-ui";
import { EventHeader, EventAccessError, type EventStatus } from "@/components/organizer/event-header";
import { Avatar } from "@/components/brand/avatar";
import { InviteDialog } from "@/components/organizer/invite-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { inkOn } from "@/lib/design/rounds";
import { ATTENDEE_STATUS_HEX, ATTENDEE_TONE } from "@/lib/design/status";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

type Tag = "attendee" | "speaker" | "host";

interface Attendee {
  id: string;
  name: string;
  role: string;
  company: string | null;
  status: "registered" | "arrived" | "left";
  tag: Tag;
  avatar_url: string | null;
  looking_for: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  interests: string[];
}

/** Build + download a contacts CSV (Excel-friendly: BOM + CRLF + quoting). */
function exportCsv(people: Attendee[], eventName: string) {
  const headers = ["Name", "Role", "Company", "Tag", "Status", "LinkedIn", "Website", "Looking for", "Interests"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = people.map((p) =>
    [p.name, p.role, p.company, p.tag, p.status, p.linkedin_url, p.website_url, p.looking_for, (p.interests ?? []).join("; ")]
      .map(esc)
      .join(","),
  );
  const csv = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(eventName || "attendees").replace(/[^\w\- ]+/g, "").trim() || "attendees"} — attendees.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

type Filter = "all" | "arrived" | "registered" | "left";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "arrived", label: "Arrived" },
  { key: "registered", label: "Registered" },
  { key: "left", label: "Left" },
];

type Sort = "name" | "status";
// Status sort surfaces who needs attention: not-here-yet first, then in the room.
const STATUS_RANK: Record<Attendee["status"], number> = { registered: 0, arrived: 1, left: 2 };

export default function PeopleDirectory({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { user, checked } = useOrganizer();
  const [eventName, setEventName] = useState<string>("");
  const [eventStatus, setEventStatus] = useState<EventStatus | undefined>(undefined);
  const [people, setPeople] = useState<Attendee[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState<null | "forbidden" | "missing">(null);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Attendee | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [checkingIn, setCheckingIn] = useState(false);

  const load = useCallback(() => {
    apiFetch<Attendee[]>(`/events/${eventId}/attendees`)
      .then((rows) => setPeople([...rows].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 403 || e.status === 401)) setDenied("forbidden");
        else if (e instanceof ApiError && e.status === 404) setDenied("missing");
        else setError(e instanceof Error ? e.message : "Couldn't load attendees");
      });
  }, [eventId]);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ name: string; status: EventStatus }>(`/events/${eventId}`)
      .then((e) => {
        setEventName(e.name);
        setEventStatus(e.status);
      })
      .catch(() => {});
    load();
  }, [user, eventId, load]);

  async function setStatus(id: string, status: Attendee["status"]) {
    setPeople((prev) => prev?.map((p) => (p.id === id ? { ...p, status } : p)) ?? prev); // optimistic
    try {
      await apiFetch(`/events/${eventId}/attendees/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch {
      load(); // revert to server truth
    }
  }

  async function setTag(id: string, tag: Tag) {
    setPeople((prev) => prev?.map((p) => (p.id === id ? { ...p, tag } : p)) ?? prev); // optimistic
    try {
      await apiFetch(`/events/${eventId}/attendees/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ tag }),
      });
    } catch {
      load(); // revert to server truth
    }
  }

  async function checkInAll() {
    setCheckingIn(true);
    try {
      await apiFetch(`/events/${eventId}/attendees/check-in-all`, { method: "POST" });
      load();
    } catch {
      load();
    } finally {
      setCheckingIn(false);
    }
  }

  const counts = useMemo(() => {
    const arrived = people?.filter((p) => p.status === "arrived").length ?? 0;
    const registered = people?.filter((p) => p.status === "registered").length ?? 0;
    return { arrived, registered, total: people?.length ?? 0 };
  }, [people]);

  const visible = useMemo(() => {
    if (!people) return null;
    const needle = q.trim().toLowerCase();
    const filtered = people.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (!needle) return true;
      return p.name.toLowerCase().includes(needle) || (p.role ?? "").toLowerCase().includes(needle);
    });
    if (sort === "status") {
      return [...filtered].sort(
        (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name),
      );
    }
    return filtered; // already name-sorted at load
  }, [people, q, filter, sort]);

  // Pre-auth / redirecting: neutral splash, never the console chrome (see ConsoleGate).
  if (!checked || !user) return <ConsoleGate />;

  if (denied) {
    return (
      <ConsoleShell>
        <EventHeader eventId={eventId} active="people" />
        <EventAccessError notFound={denied === "missing"} />
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell>
      <EventHeader
        eventId={eventId}
        name={eventName}
        status={eventStatus}
        active="people"
        actions={
          <Button variant="accent" onClick={() => setAdding((v) => !v)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Walk-in
          </Button>
        }
      />

      {/* KPI strip — real, live counts. Tapping one filters the list (chase-list). */}
      <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
        <Kpi value={counts.arrived} label="arrived" bg={ATTENDEE_STATUS_HEX.arrived} active={filter === "arrived"} onClick={() => setFilter(filter === "arrived" ? "all" : "arrived")} />
        <Kpi value={counts.registered} label="not here yet" bg={ATTENDEE_STATUS_HEX.registered} active={filter === "registered"} onClick={() => setFilter(filter === "registered" ? "all" : "registered")} />
        <Kpi value={counts.total} label="registered" bg={ATTENDEE_STATUS_HEX.total} active={filter === "all"} onClick={() => setFilter("all")} />
      </div>

      {/* Toolbar: search · filters · invite/export */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex h-11 w-full items-center gap-2 rounded-full border border-border bg-card px-3.5 lg:max-w-xs">
          <Search className="h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people…"
            aria-label="Search people"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-subtle"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={cn(
                  "h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
                  active
                    ? "border-transparent bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          <button
            type="button"
            onClick={() => setSort((s) => (s === "name" ? "status" : "name"))}
            aria-label={`Sort by ${sort === "name" ? "status" : "name"}`}
            title={`Sorted by ${sort}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowDownUp className="h-4 w-4" /> {sort === "name" ? "Name" : "Status"}
          </button>
          {counts.registered > 0 && (
            <Button variant="accent" size="sm" onClick={checkInAll} disabled={checkingIn} className="gap-1.5">
              {checkingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
              {checkingIn ? "Checking in…" : `Check in all ${counts.registered}`}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setInviting(true)} className="gap-1.5">
            <QrCode className="h-4 w-4" /> Invite
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => people && exportCsv(people, eventName)}
            disabled={!people || people.length === 0}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {inviting && <InviteDialog eventId={eventId} eventName={eventName} onClose={() => setInviting(false)} />}

      {editing && (
        <EditAttendeeDialog
          eventId={eventId}
          person={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {adding && (
        <WalkInForm
          eventId={eventId}
          onAdded={() => {
            setAdding(false);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {people === null && !error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-40 skeleton rounded-2xl border border-border" />
          ))}
        </div>
      )}

      {visible && visible.length === 0 && (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          {people && people.length > 0 ? "No one matches that search." : "No one has registered yet."}
        </p>
      )}

      {visible && visible.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p, i) => (
            <PersonCard
              key={p.id}
              person={p}
              index={i}
              onSet={(s) => setStatus(p.id, s)}
              onTag={(t) => setTag(p.id, t)}
              onEdit={() => setEditing(p)}
            />
          ))}
        </div>
      )}
    </ConsoleShell>
  );
}

/** A vivid KPI block (demo-style) — brand fill, contrast-safe ink. Tapping it
 *  filters the list to that segment (a one-tap chase-list). */
function Kpi({
  value,
  label,
  bg,
  active,
  onClick,
}: {
  value: number;
  label: string;
  bg: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const ink = inkOn(bg);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative overflow-hidden rounded-3xl p-4 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 sm:p-5",
        active && "ring-2 ring-foreground/40",
      )}
      style={{ background: bg, color: ink }}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-15" style={{ background: ink }} aria-hidden />
      <div className="relative font-display text-[clamp(28px,4vw,46px)] leading-none tracking-[-0.03em]">{value}</div>
      <div className="relative mt-1 text-xs opacity-80 sm:text-sm">{label}</div>
    </button>
  );
}

const TAG_CYCLE: Record<Tag, Tag> = { attendee: "speaker", speaker: "host", host: "attendee" };
const TAG_STYLE: Record<Exclude<Tag, "attendee">, string> = {
  speaker: "bg-gold/20 text-foreground",
  host: "bg-plasma/20 text-foreground",
};

function PersonCard({
  person,
  index,
  onSet,
  onTag,
  onEdit,
}: {
  person: Attendee;
  index: number;
  onSet: (s: Attendee["status"]) => void;
  onTag: (t: Tag) => void;
  onEdit: () => void;
}) {
  const interests = (person.interests ?? []).slice(0, 3);
  const extra = (person.interests?.length ?? 0) - interests.length;
  const roleLine = [person.role, person.company].filter(Boolean).join(" · ");
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
    >
      <Card hover className="flex h-full flex-col p-5">
        <div className="flex items-start gap-3">
          <Avatar name={person.name} seed={person.id} src={person.avatar_url} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-display text-lg leading-tight text-foreground">{person.name}</span>
              {person.tag !== "attendee" && (
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", TAG_STYLE[person.tag])}>
                  {person.tag}
                </span>
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">{roleLine}</div>
            {person.tag !== "attendee" && (
              <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-foreground-subtle">
                <Star className="h-3 w-3 text-gold" aria-hidden /> Guest · not seated in rounds
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${person.name}'s details`}
            title="Edit details"
            className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        {person.looking_for && (
          <p className="mt-3 line-clamp-2 text-sm leading-snug text-muted-foreground">“{person.looking_for}”</p>
        )}

        {interests.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {interests.map((t) => (
              <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
                {t}
              </span>
            ))}
            {extra > 0 && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-foreground-subtle">+{extra}</span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
          <StatusControls status={person.status} onSet={onSet} />
          <button
            type="button"
            onClick={() => onTag(TAG_CYCLE[person.tag])}
            title={`Tag: ${person.tag} — tap to change`}
            aria-label={`Change tag, currently ${person.tag}`}
            className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium capitalize text-muted-foreground transition-colors hover:text-foreground"
          >
            {person.tag}
          </button>
        </div>
      </Card>
    </motion.div>
  );
}

function StatusControls({ status, onSet }: { status: Attendee["status"]; onSet: (s: Attendee["status"]) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <StatusPill tone={ATTENDEE_TONE[status]} label={status} pulse={status === "arrived"} className={cn(status === "left" && "line-through")} />
      {status !== "arrived" ? (
        <IconBtn label="Mark arrived" onClick={() => onSet("arrived")}><UserCheck className="h-4 w-4" /></IconBtn>
      ) : (
        <IconBtn label="Mark left" onClick={() => onSet("left")}><UserMinus className="h-4 w-4" /></IconBtn>
      )}
      {status === "left" && (
        <IconBtn label="Undo" onClick={() => onSet("arrived")}><Undo2 className="h-4 w-4" /></IconBtn>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** Organizer edits an attendee's identity details (fix a hurried walk-in typo,
 *  etc.). Modal so it doesn't disturb the directory grid. */
function EditAttendeeDialog({
  eventId,
  person,
  onClose,
  onSaved,
}: {
  eventId: string;
  person: Attendee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState(person.role);
  const [company, setCompany] = useState(person.company ?? "");
  const [lookingFor, setLookingFor] = useState(person.looking_for ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/events/${eventId}/attendees/${person.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          company: company.trim(), // "" → backend clears it
          looking_for: lookingFor.trim(),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${person.name}`}
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <h2 className="font-display text-lg text-foreground">Edit details</h2>
        <p className="mt-1 text-sm text-muted-foreground">Fix a typo or update how this person shows up everywhere.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" name="edit-name" required>
            {(p) => <Input {...p} required value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Role" name="edit-role" required>
            {(p) => <Input {...p} required value={role} onChange={(e) => setRole(e.target.value)} placeholder="Founder at Acme" />}
          </Field>
          <Field label="Company" name="edit-company" className="sm:col-span-2">
            {(p) => <Input {...p} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Labs" />}
          </Field>
          <Field label="Looking for" name="edit-looking" className="sm:col-span-2">
            {(p) => <Input {...p} value={lookingFor} onChange={(e) => setLookingFor(e.target.value)} placeholder="investors, designers…" />}
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
            {busy ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function WalkInForm({ eventId, onAdded, onCancel }: { eventId: string; onAdded: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/events/${eventId}/attendees/walkin`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), role: role.trim() }),
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add walk-in");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-2xl border border-border bg-card/50 p-5">
      <h2 className="font-display text-lg text-foreground">Add a walk-in</h2>
      <p className="mt-1 text-sm text-muted-foreground">Someone at the door without an account — they&apos;ll be seated like everyone else.</p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" name="wi-name" required>
          {(p) => <Input {...p} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Maya Sharma" />}
        </Field>
        <Field label="Role" name="wi-role" required>
          {(p) => <Input {...p} required value={role} onChange={(e) => setRole(e.target.value)} placeholder="Founder at Acme" />}
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
          {busy ? "Adding…" : "Add walk-in"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
