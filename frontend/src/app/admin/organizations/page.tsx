"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Users, Plus, Loader2 } from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { useAdminContext } from "@/lib/admin/use-admin-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Org {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
}

export default function AdminOrgsPage() {
  const router = useRouter();
  const { user, checked, isPlatformAdmin } = useAdminContext();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!checked) return;
    if (!user) { router.replace("/organizer/login"); return; }
    if (!isPlatformAdmin) { router.replace("/organizer/dashboard"); return; }
  }, [checked, user, isPlatformAdmin, router]);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    apiFetch<Org[]>("/admin/organizations")
      .then(setOrgs)
      .finally(() => setLoading(false));
  }, [isPlatformAdmin]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const org = await apiFetch<Org>("/admin/organizations", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() }),
      });
      setOrgs((prev) => [org, ...prev]);
      setNewName("");
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create organization");
    } finally {
      setCreating(false);
    }
  }

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
          <Building2 className="h-4 w-4 text-accent" />
          <span className="font-display text-base font-semibold">
            Organizations {!loading && <span className="text-muted-foreground">({orgs.length})</span>}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Create org form */}
        <section className="mb-8">
          <h2 className="mb-3 font-display text-base font-semibold">New organization</h2>
          <form onSubmit={handleCreate} className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Organization name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="accent" disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">Create</span>
            </Button>
          </form>
          {createError && <p className="mt-2 text-sm text-destructive">{createError}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            You will be added as super organizer automatically.
          </p>
        </section>

        {/* Orgs list */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No organizations yet. Create one above.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {orgs.map((org) => (
              <Link
                key={org.id}
                href={`/admin/organizations/${org.id}`}
                className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
              >
                <div>
                  <p className="font-medium">{org.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(org.created_at).toLocaleDateString()}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground/60">{org.id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span>{org.member_count}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
