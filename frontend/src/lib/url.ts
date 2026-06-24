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
export function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
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
export function isAcceptableUrl(raw: string): boolean {
  return raw.trim() === "" || normalizeUrl(raw) !== null;
}
