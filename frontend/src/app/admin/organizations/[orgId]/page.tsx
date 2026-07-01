"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, UserPlus, Trash2, Loader2 } from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { useAdminContext } from "@/lib/admin/use-admin-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OrgMember {
  user_id: string;
  email: string | null;
  name: string | null;
  role: "super_organizer" | "organizer";
  created_at: string;
}

interface OrgInvitation {
  id: string;
  email: string;
  role: "super_organizer" | "organizer";
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface Org {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
}

const ROLE_LABELS: Record<string, string> = {
  super_organizer: "Super Organizer",
  organizer: "Organizer",
};

export default function AdminOrgDetailPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const router = useRouter();
  const { user, context, checked, isPlatformAdmin } = useAdminContext();

  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"super_organizer" | "organizer">("organizer");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!checked) return;
    if (!user) { router.replace("/organizer/login"); return; }
    if (!isPlatformAdmin) { router.replace("/organizer/dashboard"); return; }
  }, [checked, user, isPlatformAdmin, router]);

  useEffect(() => {
    if (!isPlatformAdmin || !orgId) return;
    Promise.all([
      apiFetch<Org[]>("/admin/organizations").then((orgs) => orgs.find((o) => o.id === orgId) ?? null),
      apiFetch<OrgMember[]>(`/organizations/${orgId}/members`),
      apiFetch<OrgInvitation[]>(`/organizations/${orgId}/invitations`),
    ])
      .then(([o, m, i]) => {
        setOrg(o);
        setMembers(m);
        setInvitations(i.filter((inv) => !inv.accepted_at && !inv.revoked_at));
      })
      .finally(() => setLoading(false));
  }, [isPlatformAdmin, orgId]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const result = await apiFetch<OrgMember>(`/organizations/${orgId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      setMembers((prev) => [...prev, result]);
      setAddEmail("");
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(userId: string) {
    try {
      await apiFetch(`/organizations/${orgId}/members/${userId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to remove member");
    }
  }

  async function handleRevokeInvitation(invId: string) {
    try {
      await apiFetch(`/organizations/${orgId}/invitations/${invId}`, { method: "DELETE" });
      setInvitations((prev) => prev.filter((i) => i.id !== invId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to revoke invitation");
    }
  }

  if (!checked || !isPlatformAdmin) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/admin/organizations" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Building2 className="h-4 w-4 text-accent" />
          <span className="font-display text-base font-semibold">
            {org ? org.name : "Organization"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* Add member form */}
            <section className="mb-8">
              <h2 className="mb-4 font-display text-base font-semibold">Add member</h2>
              <form onSubmit={handleAdd} className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    required
                  />
                </div>
                {/* Role selector */}
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as "super_organizer" | "organizer")}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="organizer">Organizer</option>
                  <option value="super_organizer">Super Organizer</option>
                </select>
                <Button type="submit" variant="accent" disabled={adding}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                </Button>
              </form>
              {addError && <p className="mt-2 text-sm text-destructive">{addError}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                If the person doesn&apos;t have an account yet, they&apos;ll receive a pending invitation activated on first sign-in.
              </p>
            </section>

            {/* Members list */}
            <section className="mb-6">
              <h2 className="mb-4 font-display text-base font-semibold">
                Members <span className="text-muted-foreground">({members.length})</span>
              </h2>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {members.map((m) => (
                    <div
                      key={m.user_id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4"
                    >
                      <div>
                        <p className="text-sm font-medium">{m.name ?? m.email ?? m.user_id}</p>
                        {m.name && <p className="text-xs text-muted-foreground">{m.email}</p>}
                        <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {ROLE_LABELS[m.role] ?? m.role}
                        </span>
                      </div>
                      {m.user_id !== context?.user_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(m.user_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Pending invitations */}
            {invitations.length > 0 && (
              <section>
                <h2 className="mb-4 font-display text-base font-semibold">Pending invitations</h2>
                <div className="flex flex-col gap-2">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-dashed border-border bg-muted/30 p-4"
                    >
                      <div>
                        <p className="text-sm font-medium">{inv.email}</p>
                        <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {ROLE_LABELS[inv.role] ?? inv.role} · Pending sign-in
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleRevokeInvitation(inv.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
