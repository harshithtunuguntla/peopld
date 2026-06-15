"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Loader2, Plus, UserCheck, UserMinus, Undo2, QrCode, Download } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { OrgShell } from "@/components/organizer/shell";
import { Avatar } from "@/components/brand/avatar";
import { InviteDialog } from "@/components/organizer/invite-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface Attendee {
  id: string;
  name: string;
  role: string;
  status: "registered" | "arrived" | "left";
  avatar_url: string | null;
  looking_for: string | null;
  linkedin_url: string | null;
  whatsapp_number: string | null;
  interests: string[];
}

/** Build + download a contacts CSV (Excel-friendly: BOM + CRLF + quoting). */
function exportCsv(people: Attendee[], eventName: string) {
  const headers = ["Name", "Role", "Status", "WhatsApp", "LinkedIn", "Looking for", "Interests"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = people.map((p) =>
    [p.name, p.role, p.status, p.whatsapp_number, p.linkedin_url, p.looking_for, (p.interests ?? []).join("; ")]
      .map(esc)
      .join(","),
  );
  const csv = "﻿" + [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(eventName || "attendees").replace(/[^\w\- ]+/g, "").trim() || "attendees"} — attendees.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PeopleDirectory({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { user, checked } = useOrganizer();
  const [eventName, setEventName] = useState<string>("");
  const [people, setPeople] = useState<Attendee[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(() => {
    apiFetch<Attendee[]>(`/events/${eventId}/attendees`)
      .then((rows) => setPeople([...rows].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load attendees"));
  }, [eventId]);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ name: string }>(`/events/${eventId}`).then((e) => setEventName(e.name)).catch(() => {});
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

  if (!checked || !user) {
    return (
      <OrgShell back={{ href: "/organizer/dashboard", label: "All events" }}>
        <Centered label="Loading…" />
      </OrgShell>
    );
  }

  const arrived = people?.filter((p) => p.status === "arrived").length ?? 0;
  const total = people?.length ?? 0;

  return (
    <OrgShell back={{ href: "/organizer/dashboard", label: "All events" }}>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl tracking-[-0.02em] text-foreground">People</h1>
          {eventName && <p className="truncate text-sm text-muted-foreground">{eventName}</p>}
        </div>
        <Button variant="accent" onClick={() => setAdding((v) => !v)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Walk-in
        </Button>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{arrived}</span> arrived ·{" "}
        <span className="font-medium text-foreground">{total}</span> registered
      </p>

      <div className="mt-4 flex gap-2">
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
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {inviting && <InviteDialog eventId={eventId} eventName={eventName} onClose={() => setInviting(false)} />}

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
        <div className="mt-6 space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl border border-border bg-card/40" />
          ))}
        </div>
      )}

      {people && people.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">No one has registered yet.</p>
      )}

      {people && people.length > 0 && (
        <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 p-3">
              <Avatar name={p.name} seed={p.id} src={p.avatar_url} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{p.name}</p>
                <p className="truncate text-sm text-muted-foreground">{p.role}</p>
              </div>
              <StatusControls status={p.status} onSet={(s) => setStatus(p.id, s)} />
            </li>
          ))}
        </ul>
      )}
    </OrgShell>
  );
}

function StatusControls({ status, onSet }: { status: Attendee["status"]; onSet: (s: Attendee["status"]) => void }) {
  const badge = {
    registered: "bg-muted text-muted-foreground",
    arrived: "bg-success/15 text-success",
    left: "bg-muted text-muted-foreground line-through",
  }[status];
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", badge)}>{status}</span>
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

function Centered({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-16 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
