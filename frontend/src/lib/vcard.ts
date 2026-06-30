// Build + download a vCard (.vcf) so "Add to contacts" opens the phone's native
// contact editor pre-filled. Pure client-side — no dependency, no network.

export interface VCardPerson {
  name: string;
  role?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
}

/** Escape per RFC 6350: backslash, comma, semicolon, and newlines. */
function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildVCard(p: VCardPerson, metAt?: string): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(p.name)}`];
  if (p.company) lines.push(`ORG:${esc(p.company)}`);
  if (p.role) lines.push(`TITLE:${esc(p.role)}`);
  if (p.website_url) lines.push(`URL:${esc(p.website_url)}`);
  if (p.linkedin_url) lines.push(`URL;TYPE=LinkedIn:${esc(p.linkedin_url)}`);
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
 * Add a person to the phone's address book with the most native experience the
 * browser allows. On modern phones (iOS 15+ Safari, Android Chrome) we share the
 * vCard as a file, so the OS shows its own "Add to Contacts" sheet directly — no
 * file dropped in Downloads. Everywhere else (desktop, older browsers) we fall
 * back to a .vcf download, which still imports on every contacts app.
 *
 * Note: no web API can write a contact silently — the OS must mediate (a privacy
 * boundary), so the closest "open contacts directly" is this native share sheet.
 */
export async function saveContact(p: VCardPerson, metAt?: string): Promise<void> {
  const text = buildVCard(p, metAt);
  try {
    const file = new File([text], `${fileBase(p.name)}.vcf`, { type: "text/vcard" });
    if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: p.name });
      return;
    }
  } catch (err) {
    // User dismissed the share sheet — respect that, don't also download.
    if (err instanceof DOMException && err.name === "AbortError") return;
    // Any other failure: fall through to the download path below.
  }
  downloadVCard(p, metAt);
}
