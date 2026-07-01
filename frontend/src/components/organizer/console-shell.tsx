"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CalendarDays,
  Settings,
  Users,
  Plus,
  Menu,
  X,
  ChevronLeft,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Avatar } from "@/components/brand/avatar";
import { LogoMark } from "./console-ui";
import { supabase } from "@/lib/supabase";
import { useOrganizer } from "@/lib/organizer/use-organizer";

type NavItem = { href: string; label: string; icon: React.ElementType; exact?: boolean };

/**
 * Console sidebar = GLOBAL navigation only. We only list routes that actually
 * exist (CLAUDE.md: build spec is law — no fake Analytics/Billing links). Per-event
 * screens (Command Center / People) are NOT here — they're reached by opening an
 * event and live as in-page tabs (see components/organizer/event-header.tsx), so
 * primary (global) and secondary (event) nav stay clearly separated.
 */
const GLOBAL_NAV: NavItem[] = [
  { href: "/organizer/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/organizer/events", label: "Events", icon: CalendarDays },
  { href: "/organizer/team", label: "Team", icon: Users },
  { href: "/organizer/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href, item.exact);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-xl border border-border bg-accent/10"
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
        />
      )}
      <Icon className="relative h-[18px] w-[18px]" style={{ color: active ? "hsl(var(--accent))" : undefined }} />
      <span className="relative">{item.label}</span>
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useOrganizer();
  const name = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Organizer";
  const email = user?.email || "";

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/organizer/dashboard"
        onClick={onNavigate}
        className="flex h-16 shrink-0 items-center gap-2.5 px-5"
      >
        <LogoMark size={32} />
        <span className="font-display text-xl tracking-tight text-foreground">Peopld</span>
        <span className="ml-1 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
          Studio
        </span>
      </Link>

      <div className="scrollbar-hide flex-1 overflow-y-auto px-3 pt-2">
        <nav className="flex flex-col gap-1">
          {GLOBAL_NAV.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </nav>
      </div>

      {/* User */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
          <Avatar name={name} seed={user?.id} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{name}</div>
            <div className="truncate text-xs text-foreground-subtle">{email}</div>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            aria-label="Sign out"
            className="text-foreground-subtle transition-colors hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConsoleShell({
  children,
  back,
}: {
  children: React.ReactNode;
  back?: { href: string; label: string };
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Fixed sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-card lg:hidden"
            >
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2"
              >
                <X className="h-4 w-4 text-foreground" />
              </button>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="flex h-full items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card lg:hidden"
            >
              <Menu className="h-4 w-4 text-foreground" />
            </button>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <Link
                href="/organizer/events?new=1"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-foreground transition-transform hover:-translate-y-0.5"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create event</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {back && (
            <Link
              href={back.href}
              className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> {back.label}
            </Link>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
