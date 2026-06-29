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

/** Trigger a .vcf download — on a phone this opens "Add to contacts". */
export function downloadVCard(p: VCardPerson, metAt?: string): void {
  const blob = new Blob([buildVCard(p, metAt)], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "contact"}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}
