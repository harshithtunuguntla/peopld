"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, CalendarDays, AlertTriangle, RefreshCw } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { ConsoleShell } from "@/components/organizer/console-shell";
import { PageHeader, ConsoleGate, Segmented } from "@/components/organizer/console-ui";
import { EventCard, CreateEventForm, type OrgEvent } from "@/components/organizer/event-card";
import { Button } from "@/components/ui/button";

type Filter = "all" | "active" | "upcoming" | "ended";

export default function OrganizerEventsPage() {
  return (
    <Suspense fallback={<ConsoleGate />}>
      <OrganizerEvents />
    </Suspense>
  );
}

function OrganizerEvents() {
  const { user, checked } = useOrganizer();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [events, setEvents] = useState<OrgEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = showArchived ? "?include_archived=true" : "";
    apiFetch<OrgEvent[]>(`/events/mine${qs}`)
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your events"))
      .finally(() => setLoading(false));
  }, [showArchived]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setCreating(true);
      router.replace("/organizer/events");
    }
  }, [searchParams, router]);

  // Pre-auth / redirecting: neutral splash, never the console chrome (see ConsoleGate).
  if (!checked || !user) return <ConsoleGate />;

  const filtered = (events ?? []).filter((e) => filter === "all" || e.status === filter);

  return (
    <ConsoleShell>
      <PageHeader
        eyebrow="events"
        title={<>Every room <em className="italic text-accent">you run</em></>}
        subtitle="Create, manage, and revisit your networking events."
        actions={
          <Button variant="accent" onClick={() => setCreating((v) => !v)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New event
          </Button>
        }
      />

      {creating && (
        <div className="mb-6">
          <CreateEventForm
            onCreated={() => {
              setCreating(false);
              load();
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {/* Filter + archived toggle */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="overflow-x-auto">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Live" },
              { value: "upcoming", label: "Upcoming" },
              { value: "ended", label: "Completed" },
            ]}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          aria-pressed={showArchived}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>

      {error && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
          </Button>
        </div>
      )}

      {loading && !events && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 skeleton rounded-2xl border border-border" />
          ))}
        </div>
      )}

      {events && filtered.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-4 font-display text-xl text-foreground">
            {events.length === 0 ? "No events yet" : "Nothing matches this filter"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {events.length === 0 ? "Create your first event and the room will follow." : "Try a different filter or create a new event."}
          </p>
          <Button variant="accent" onClick={() => setCreating(true)} className="mt-5 gap-1.5">
            <Plus className="h-4 w-4" /> Create event
          </Button>
        </div>
      )}

      {events && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e, i) => (
            <EventCard key={e.id} event={e} onChanged={load} index={i} />
          ))}
        </div>
      )}
    </ConsoleShell>
  );
}
