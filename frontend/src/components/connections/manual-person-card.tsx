"use client";

import { useState } from "react";
import { CalendarDays, Loader2, MapPin, Pencil, Sparkles, Trash2, UserPlus } from "lucide-react";

import { Avatar } from "@/components/brand/avatar";
import { Highlight } from "@/components/connections/search-box";
import { ContactActions } from "@/components/connections/contact-actions";
import { cn } from "@/lib/utils";

/** The manual-connection fields the card renders (a subset of the rolodex card). */
export interface ManualCard {
  manual_id: string;
  name: string;
  role: string;
  company: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  phone: string | null;
  phone_dial_code: string | null;
  instagram: string | null;
  twitter: string | null;
  email: string | null;
  note: string | null;
  met_context: string | null;
  event_name: string | null;
  event_date: string | null; // YYYY-MM-DD
}

function shortDate(d: string | null): string | null {
  if (!d) return null;
  const parsed = new Date(`${d}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * A card for a person you added by hand (vs. one you were seated with). Same
 * avatar + contact-action row as {@link PersonCard}, but it wears an "Added by you"
 * badge, shows your note as the memory jog, and — since it's yours — can be edited
 * or deleted right here.
 */
export function ManualPersonCard({
  card,
  onEdit,
  onDelete,
  viewerName,
  highlight = [],
}: {
  card: ManualCard;
  onEdit: () => void;
  onDelete: () => Promise<void> | void;
  viewerName?: string;
  highlight?: string[];
}) {
  const roleLine = [card.role, card.company].filter(Boolean).join(" · ");
  const dateLabel = shortDate(card.event_date);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      // On success the card unmounts; on failure re-enable so they can retry.
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <li className="relative overflow-hidden rounded-2xl border border-border bg-card/50 p-4 transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar name={card.name} seed={card.manual_id} src={null} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-semibold text-foreground">
              <Highlight text={card.name} terms={highlight} />
            </p>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
              <UserPlus className="h-2.5 w-2.5" aria-hidden /> Added by you
            </span>
          </div>
          {roleLine && (
            <p className="truncate text-sm text-muted-foreground">
              <Highlight text={roleLine} terms={highlight} />
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {card.met_context ? (
              <MetaChip icon={<MapPin className="h-3 w-3" aria-hidden />}>
                <Highlight text={card.met_context} terms={highlight} />
              </MetaChip>
            ) : (
              <MetaChip icon={<Sparkles className="h-3 w-3" aria-hidden />}>Added by you</MetaChip>
            )}
            {card.event_name && (
              <MetaChip icon={<CalendarDays className="h-3 w-3" aria-hidden />}>
                {card.event_name}
                {dateLabel ? ` · ${dateLabel}` : ""}
              </MetaChip>
            )}
          </div>
        </div>
      </div>

      {card.note && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-secondary/40 px-3 py-2 text-sm text-foreground/90">
          <Highlight text={card.note} terms={highlight} />
        </p>
      )}

      <ContactActions person={card} viewerName={viewerName} eventName={card.event_name ?? undefined} className="mt-4" />

      <div className="mt-3 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
        {confirming ? (
          <>
            <span className="mr-auto text-xs text-muted-foreground">Remove this contact?</span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
              Delete
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${card.name}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** Same pill as PersonCard's meta row (kept local to avoid cross-import churn). */
function MetaChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/40 px-2 py-0.5 text-[11px] leading-none text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}
