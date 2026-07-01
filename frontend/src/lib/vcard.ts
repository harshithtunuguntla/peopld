// Build + download a vCard (.vcf) so "Add to contacts" opens the phone's native
// contact editor pre-filled. Pure client-side — no dependency, no network.

export interface VCardPerson {
  name: string;
  role?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
  email?: string | null;
  /** Full international WhatsApp/phone number (dial code + local), digits ok. */
  phone_full?: string | null;
  instagram?: string | null;
  twitter?: string | null;
}

/** Escape per RFC 6350: backslash, comma, semicolon, and newlines. */
function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildVCard(p: VCardPerson, metAt?: string): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(p.name)}`];
  if (p.company) lines.push(`ORG:${esc(p.company)}`);
  if (p.role) lines.push(`TITLE:${esc(p.role)}`);
  if (p.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(p.email)}`);
  if (p.phone_full) lines.push(`TEL;TYPE=CELL:${esc(p.phone_full)}`);
  if (p.website_url) lines.push(`URL:${esc(p.website_url)}`);
  if (p.linkedin_url) lines.push(`URL;TYPE=LinkedIn:${esc(p.linkedin_url)}`);
  if (p.instagram) lines.push(`X-SOCIALPROFILE;TYPE=instagram:${esc(p.instagram)}`);
  if (p.twitter) lines.push(`X-SOCIALPROFILE;TYPE=twitter:${esc(p.twitter)}`);
  const note = metAt ? `Met at ${metAt}` : "Met via Peopld";
  lines.push(`NOTE:${esc(note)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n"); // CRLF per spec
}

/** A filesystem-safe basename for the .vcf, e.g. "asha-rao". */
function fileBase(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "contact";
}

/** Trigger a .vcf download — opening it adds the contact. Desktop / fallback path. */
export function downloadVCard(p: VCardPerson, metAt?: string): void {
  const blob = new Blob([buildVCard(p, metAt)], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBase(p.name)}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Add a person to the phone's address book. We download a .vcf — universal across
 * every iOS/Android contacts app and, crucially, it carries ALL fields (name,
 * role, company, website, LinkedIn, note). On a phone, opening the downloaded
 * file lands on the native "Add to Contacts" screen.
 *
 * Why not the Web Share API (to skip the download)? `text/vcard` is NOT on the
 * browsers' shareable-type allow-list, so `navigator.canShare({files:[vcf]})`
 * always returns false and share can never fire for a contact — confirmed against
 * the MDN/W3C list (images, pdf, audio, video, plain text only). The only way to
 * open Contacts with zero download on Android is an `intent:` link, which drops
 * the website + LinkedIn URLs — so we deliberately keep the richer vCard instead.
 */
export function saveContact(p: VCardPerson, metAt?: string): void {
  downloadVCard(p, metAt);
}
