"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Linkedin, Instagram, Mail, Check, Contact } from "lucide-react";

import { WhatsAppGlyph, XGlyph } from "@/components/brand/glyphs";
import { whatsappHref, instagramHref, xHref, atHandle } from "@/lib/url";
import { saveContact } from "@/lib/vcard";
import { cn } from "@/lib/utils";

/** The contact fields any person card needs to render its action row. */
export interface ContactPerson {
  name: string;
  role: string;
  company: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  phone: string | null; // present only when the owner made it visible
  phone_dial_code: string | null;
  instagram: string | null;
  twitter: string | null;
  email: string | null;
}

/**
 * The sleek, bare contact-action row shared by the rolodex `PersonCard` and the
 * pre-event directory card — one glyph per channel the person shared, so the icons
 * stay identical everywhere in the app. A hairline divider then small muted glyphs
 * that lift + colour to the accent on hover. Each glyph is ~18px but carries an
 * invisible ~38px hit-area so it's thumb-friendly, and is labelled (aria + tooltip)
 * so dropping the text label stays clear.
 */
export function ContactActions({
  person,
  viewerName,
  eventName,
  waMessage,
  showAddToContacts = true,
  className,
}: {
  person: ContactPerson;
  /** The caller's own name — used to prefill the WhatsApp intro. */
  viewerName?: string;
  /** The event tying the two together (WhatsApp intro + vCard note). */
  eventName?: string;
  /** Override the prefilled WhatsApp message (defaults to a "we met at…" intro). */
  waMessage?: string;
  /** Whether to show the "add to phone contacts" (vCard) action. */
  showAddToContacts?: boolean;
  className?: string;
}) {
  const whatsappNumber = person.phone
    ? `${person.phone_dial_code ?? ""}${person.phone}`.replace(/\s+/g, "")
    : null;
  const defaultMessage = viewerName
    ? `Hi, I'm ${viewerName}${eventName ? ` — we met at ${eventName}` : ""} 👋`
    : `Hi${eventName ? ` — we met at ${eventName}` : "!"} 👋`;
  const waHref = whatsappHref(person.phone_dial_code, person.phone, waMessage ?? defaultMessage);
  const igHref = instagramHref(person.instagram);
  const twHref = xHref(person.twitter);

  const hasAny =
    showAddToContacts ||
    waHref ||
    person.email ||
    igHref ||
    twHref ||
    person.linkedin_url ||
    person.website_url;
  if (!hasAny) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-1 border-t border-border/60 pt-2.5",
        className,
      )}
    >
      {showAddToContacts && (
        // The primary action — and the one that ISN'T a recognizable brand mark,
        // so it carries a visible label (mobile has no hover tooltip to lean on)
        // and a contact-card icon that reads clearly as "save a contact", distinct
        // from the person-plus "Want to meet" glyph it used to share.
        <button
          type="button"
          onClick={() =>
            saveContact(
              {
                name: person.name,
                role: person.role,
                company: person.company,
                linkedin_url: person.linkedin_url,
                website_url: person.website_url,
                phone_full: whatsappNumber,
                instagram: person.instagram,
                twitter: person.twitter,
                email: person.email,
              },
              eventName,
            )
          }
          aria-label={`Save ${person.name} to your phone's contacts`}
          title="Save to your phone's contacts"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-[color,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Contact className="h-4 w-4" aria-hidden />
          Save contact
        </button>
      )}
      {waHref && (
        <ActionIcon label={`Message ${person.name} on WhatsApp`} title="WhatsApp" href={waHref}>
          <WhatsAppGlyph className="h-[18px] w-[18px]" />
        </ActionIcon>
      )}
      {person.email && <MailAction email={person.email} name={person.name} />}
      {igHref && (
        <ActionIcon label={`${person.name} on Instagram`} title={atHandle(person.instagram, "instagram.com")} href={igHref}>
          <Instagram className="h-[18px] w-[18px]" aria-hidden />
        </ActionIcon>
      )}
      {twHref && (
        <ActionIcon label={`${person.name} on X`} title={atHandle(person.twitter, "x.com")} href={twHref}>
          <XGlyph className="h-[18px] w-[18px]" />
        </ActionIcon>
      )}
      {person.linkedin_url && (
        <ActionIcon label={`${person.name} on LinkedIn`} href={person.linkedin_url}>
          <Linkedin className="h-[18px] w-[18px]" aria-hidden />
        </ActionIcon>
      )}
      {person.website_url && (
        <ActionIcon label={`${person.name}'s website`} href={person.website_url}>
          <Globe className="h-[18px] w-[18px]" aria-hidden />
        </ActionIcon>
      )}
    </div>
  );
}

/**
 * A bare contact action glyph — renders as a link (external contact URLs) or a
 * button (vCard download). No border/background; the small icon lifts, scales and
 * brightens to the app accent on hover — one unified colour keeps the row cohesive
 * rather than a multi-brand rainbow. Padding gives it a ~38px hit-area so the tiny
 * glyph is still thumb-friendly.
 */
export function ActionIcon({
  label,
  title,
  href,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls =
    "inline-flex items-center justify-center rounded-md p-2.5 text-muted-foreground transition-[color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:scale-110 hover:text-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={title ?? label} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} title={title ?? label} className={cls}>
      {children}
    </button>
  );
}

/**
 * Email action. One tap copies the address (works everywhere, unlike a `mailto:`
 * that dead-ends on a phone with no mail app configured) and briefly flips the
 * glyph to a check.
 */
export function MailAction({ email, name }: { email: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      // Clipboard blocked (insecure context / permissions) — fall back to a prompt
      // so the address is still selectable/copyable by hand.
      window.prompt("Copy this email address:", email);
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  }

  const cls =
    "inline-flex items-center justify-center rounded-md p-2.5 text-muted-foreground transition-[color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:scale-110 hover:text-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${name}'s email copied` : `Copy ${name}'s email`}
      title={copied ? "Copied!" : email}
      className={cn(cls, copied && "text-success hover:text-success")}
    >
      {copied ? <Check className="h-[18px] w-[18px]" aria-hidden /> : <Mail className="h-[18px] w-[18px]" aria-hidden />}
    </button>
  );
}
