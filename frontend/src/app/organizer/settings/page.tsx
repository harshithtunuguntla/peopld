"use client";

import { Sun, Moon, Monitor, User, Check, Palette } from "lucide-react";

import { useOrganizer } from "@/lib/organizer/use-organizer";
import { useTheme, type ThemePref } from "@/lib/theme/theme-provider";
import { ConsoleShell } from "@/components/organizer/console-shell";
import { PageHeader, Card, ConsoleLoading } from "@/components/organizer/console-ui";
import { Avatar } from "@/components/brand/avatar";
import { cn } from "@/lib/utils";

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
          <Icon className="h-4 w-4 text-accent" aria-hidden />
        </div>
        <div>
          <div className="font-medium text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
      {children}
    </Card>
  );
}

const THEME_OPTIONS: { value: ThemePref; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

// Our token palette (mirrors the demo's canvas/surface/surface-2/fg/brand swatches).
const SWATCHES = [
  { label: "Canvas", className: "bg-background" },
  { label: "Card", className: "bg-card" },
  { label: "Surface", className: "bg-surface-2" },
  { label: "Ink", className: "bg-foreground" },
  { label: "Accent", className: "bg-accent" },
];

export default function OrganizerSettings() {
  const { user, checked } = useOrganizer();

  if (!checked || !user) {
    return (
      <ConsoleShell>
        <ConsoleLoading />
      </ConsoleShell>
    );
  }

  const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "Organizer";
  const email = user.email || "";

  return (
    <ConsoleShell>
      <PageHeader
        eyebrow="Settings"
        title="Make it yours."
        subtitle="Your profile and how the console looks."
      />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <ProfileSection name={name} email={email} userId={user.id} />
        <AppearanceSection />
      </div>
    </ConsoleShell>
  );
}

function ProfileSection({ name, email, userId }: { name: string; email: string; userId?: string }) {
  return (
    <Section icon={User} title="Profile" desc="How you show up to your guests.">
      <div className="mb-5 flex items-center gap-4">
        <Avatar name={name} seed={userId} size={56} />
        <div className="min-w-0">
          <div className="truncate font-display text-lg text-foreground">{name}</div>
          <div className="truncate text-sm text-muted-foreground">{email}</div>
        </div>
      </div>
      <div className="space-y-3">
        {[
          { label: "Full name", value: name },
          { label: "Email", value: email },
        ].map((f) => (
          <div key={f.label}>
            <label className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">{f.label}</label>
            <div className="mt-1 flex h-11 items-center rounded-xl border border-border bg-surface-2 px-3.5 text-sm text-foreground">
              {f.value}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-foreground-subtle">
        Your identity comes from your sign-in. To change it, update your Google / email account.
      </p>
    </Section>
  );
}

function AppearanceSection() {
  const { pref, setPref } = useTheme();

  return (
    <Section
      icon={Palette}
      title="Appearance"
      desc="Switch between light and dark — or follow your system."
    >
      <div className="grid grid-cols-3 gap-3">
        {THEME_OPTIONS.map((o) => {
          const active = pref === o.value;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              onClick={() => setPref(o.value)}
              aria-pressed={active}
              className={cn(
                "relative rounded-2xl border p-4 text-left transition-colors",
                active
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface-2 hover:border-line-strong",
              )}
            >
              {active && (
                <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent">
                  <Check className="h-2.5 w-2.5 text-accent-foreground" aria-hidden />
                </span>
              )}
              <Icon className="mb-6 h-5 w-5 text-foreground" aria-hidden />
              <div className="text-sm font-medium text-foreground">{o.label}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-foreground-subtle">Tokens:</span>
        {SWATCHES.map((s) => (
          <span
            key={s.label}
            title={s.label}
            className={cn("h-6 w-6 rounded-md border border-border", s.className)}
          />
        ))}
      </div>
    </Section>
  );
}
