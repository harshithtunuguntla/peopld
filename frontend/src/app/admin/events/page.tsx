"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { useAdminContext } from "@/lib/admin/use-admin-context";

interface AdminEvent {
  id: string;
  name: string;
  date: string;
  location: string;
  status: "upcoming" | "active" | "ended";
  organizer_id: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Live",
  upcoming: "Upcoming",
  ended: "Ended",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-700",
  upcoming: "bg-blue-500/15 text-blue-700",
  ended: "bg-muted text-muted-foreground",
};

export default function AdminEventsPage() {
  const router = useRouter();
  const { user, checked, isPlatformAdmin } = useAdminContext();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!checked) return;
    if (!user) { router.replace("/organizer/login"); return; }
    if (!isPlatformAdmin) { router.replace("/organizer/dashboard"); return; }
  }, [checked, user, isPlatformAdmin, router]);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    apiFetch<AdminEvent[]>("/admin/events")
      .then(setEvents)
      .finally(() => setLoading(false));
  }, [isPlatformAdmin]);

  if (!checked || !isPlatformAdmin) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <CalendarDays className="h-4 w-4 text-accent" />
          <span className="font-display text-base font-semibold">
            All Events {!loading && <span className="text-muted-foreground">({events.length})</span>}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events found.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/organizer/event/${event.id}/live`}
                className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
              >
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(event.date).toLocaleDateString()} · {event.location}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[event.status] ?? ""}`}
                >
                  {STATUS_LABELS[event.status] ?? event.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
