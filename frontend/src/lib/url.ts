/**
 * Forgiving URL handling for profile links (LinkedIn / website).
 *
 * People paste what they have: a bare domain ("linkedin.com/in/you"), a
 * www-prefixed link ("www.acme.com"), or a full http/https URL. Requiring them to
 * type "https://" was a real point of friction at the pilot, so we accept all of
 * the above and normalise to a single canonical https URL for storage. We only
 * reject input that can't be a web address at all (no dot in the host, spaces,
 * etc.) — never just because the scheme is missing.
 */

/**
 * Turn whatever the user typed into a canonical URL, or `null` if it can't be one.
 * Blank input returns `null` (the field is simply cleared). A bare domain or an
 * `http://` link is accepted; we keep an explicit `http://` as-is rather than
 * silently upgrading it, but add `https://` when there's no scheme at all.
 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    // Must be a real dotted host (e.g. "acme.com"), not "https://linkedin" or a
    // trailing-dot fragment. This is what separates a typo from a usable link.
    if (!u.hostname.includes(".") || u.hostname.startsWith(".") || u.hostname.endsWith(".")) {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

/** True when the input is blank or can be normalised to a usable web URL. */
export function isAcceptableUrl(raw: string | null | undefined): boolean {
  return (raw ?? "").trim() === "" || normalizeUrl(raw) !== null;
}

/**
 * Contact-handle helpers. People paste a handle ("@maya"), a bare
 * ("instagram.com/maya"), or a full URL — we accept all and extract the handle
 * so we can both display "@maya" and build a canonical profile link.
 */

/** Pull the handle out of whatever the user typed for a social profile. */
export function socialHandle(raw: string | null | undefined, host: string): string {
  let v = (raw ?? "").trim();
  if (!v) return "";
  // Strip a full/partial URL down to the path segment after the host.
  const m = v.match(new RegExp(`${host.replace(".", "\\.")}/([^/?#\\s]+)`, "i"));
  if (m) v = m[1];
  return v.replace(/^@+/, "").replace(/[/?#\s]+.*$/, "").trim();
}

export function instagramHref(raw: string | null | undefined): string | null {
  const h = socialHandle(raw, "instagram.com");
  return h ? `https://instagram.com/${h}` : null;
}

export function xHref(raw: string | null | undefined): string | null {
  // Accept either x.com or twitter.com input; always link to x.com.
  const h = socialHandle(raw, "x.com") || socialHandle(raw, "twitter.com");
  return h ? `https://x.com/${h}` : null;
}

/** "@maya" for display, from any accepted input. */
export function atHandle(raw: string | null | undefined, host = "instagram.com"): string {
  const h = socialHandle(raw, host) || (raw ?? "").trim().replace(/^@+/, "");
  return h ? `@${h}` : "";
}

/**
 * A wa.me deep link with a prefilled message. WhatsApp requires a full
 * international number (country code + local, digits only), which is why we
 * store a dial code alongside the number — a bare local number produces a broken
 * link. Returns null when there's no number.
 */
export function whatsappHref(
  dialCode: string | null | undefined,
  phone: string | null | undefined,
  message?: string,
): string | null {
  // Require an actual local number — a dial code alone ("+91") is NOT a contact.
  // (Manual contacts keep a default +91 even with no number, so guarding on the
  // combined string would wrongly link to wa.me/91.)
  const localDigits = `${phone ?? ""}`.replace(/\D/g, "");
  if (!localDigits) return null;
  const digits = `${dialCode ?? ""}${localDigits}`.replace(/\D/g, "");
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}
