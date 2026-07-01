"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shield, CalendarDays, Building2, Activity, LogOut, Users, UserPlus, Trash2, Loader2 } from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { useAdminContext } from "@/lib/admin/use-admin-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AdminSummary {
  organizations_total: number;
  events_total: number;
  events_live: number;
  events_upcoming: number;
  events_completed: number;
  attendees_total: number;
  connections_total: number;
}

interface PlatformAdmin {
  user_id: string;
  email: string | null;
  created_at: string;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, context, checked, isPlatformAdmin } = useAdminContext();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!checked) return;
    if (!user) { router.replace("/organizer/login"); return; }
    if (!isPlatformAdmin) { router.replace("/organizer/dashboard"); return; }
  }, [checked, user, isPlatformAdmin, router]);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    Promise.all([
      apiFetch<AdminSummary>("/admin/summary"),
      apiFetch<PlatformAdmin[]>("/admin/platform-admins"),
    ])
      .then(([s, a]) => { setSummary(s); setAdmins(a); })
      .finally(() => setLoading(false));
  }, [isPlatformAdmin]);

  async function handleAddAdmin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const admin = await apiFetch<PlatformAdmin>("/admin/platform-admins", {
        method: "POST",
        body: JSON.stringify({ email: addEmail.trim() }),
      });
      setAdmins((prev) => [...prev, admin]);
      setAddEmail("");
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Failed to add admin");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveAdmin(userId: string) {
    try {
      await apiFetch(`/admin/platform-admins/${userId}`, { method: "DELETE" });
      setAdmins((prev) => prev.filter((a) => a.user_id !== userId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to remove admin");
    }
  }

  if (!checked || !isPlatformAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const stats = [
    { label: "Organizations", value: summary?.organizations_total ?? "—", icon: Building2 },
    { label: "Total events", value: summary?.events_total ?? "—", icon: CalendarDays },
    { label: "Live now", value: summary?.events_live ?? "—", icon: Activity },
    { label: "Upcoming", value: summary?.events_upcoming ?? "—", icon: CalendarDays },
    { label: "Attendees", value: summary?.attendees_total ?? "—", icon: Users },
    { label: "Connections", value: summary?.connections_total ?? "—", icon: Users },
  ];

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent" />
            <span className="font-display text-base font-semibold">Platform Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{context?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/organizer/login");
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-4 py-8">
        {/* Stats */}
        <section>
          <h1 className="mb-4 font-display text-2xl font-semibold">Overview</h1>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {stats.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="font-display text-2xl font-semibold">{value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Navigation links */}
        <section>
          <nav className="grid gap-3 sm:grid-cols-2">
            {[
              { href: "/admin/events", label: "All Events", icon: CalendarDays, desc: "Every event across the platform" },
              { href: "/admin/organizations", label: "Organizations", icon: Building2, desc: "Create orgs, manage members" },
            ].map(({ href, label, icon: Icon, desc }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </Link>
            ))}
          </nav>
        </section>

        {/* Platform admins management */}
        <section>
          <h2 className="mb-4 font-display text-base font-semibold">Platform admins</h2>
          <form onSubmit={handleAddAdmin} className="mb-4 flex gap-2">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="user@example.com"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="accent" disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">Grant</span>
            </Button>
          </form>
          {addError && <p className="mb-3 text-sm text-destructive">{addError}</p>}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No platform admins yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {admins.map((admin) => (
                <div
                  key={admin.user_id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4"
                >
                  <div>
                    <p className="text-sm font-medium">{admin.email ?? admin.user_id}</p>
                    <p className="text-xs text-muted-foreground">
                      Since {new Date(admin.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {admin.user_id !== context?.user_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveAdmin(admin.user_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Platform admins can create organizations, manage all members, and see all events across the platform.
          </p>
        </section>
      </main>
    </div>
  );
}
