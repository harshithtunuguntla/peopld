import type { RegisterValues } from "@/components/auth/register-form";

const STORAGE_VERSION = 1;

type StoredProfileDraft = {
  v: typeof STORAGE_VERSION;
  values: Partial<RegisterValues>;
};

function storageKey(userId: string): string {
  return `peopld:user:${userId}:profile-draft:v${STORAGE_VERSION}`;
}

function cleanValues(values: Partial<RegisterValues> | null | undefined): Partial<RegisterValues> {
  return {
    name: values?.name?.trim() ?? "",
    role: values?.role?.trim() ?? "",
    company: values?.company?.trim() ?? "",
    description: values?.description?.trim() ?? "",
    looking_for: values?.looking_for?.trim() ?? "",
    linkedin_url: values?.linkedin_url?.trim() ?? "",
    website_url: values?.website_url?.trim() ?? "",
    phone: values?.phone?.trim() ?? "",
    phone_dial_code: values?.phone_dial_code?.trim() ?? "",
    phone_visible: values?.phone_visible ?? false,
    instagram: values?.instagram?.trim() ?? "",
    twitter: values?.twitter?.trim() ?? "",
    interests: Array.isArray(values?.interests) ? values.interests.filter(Boolean) : [],
  };
}

export function hasProfileDefaults(values: Partial<RegisterValues> | null | undefined): boolean {
  const cleaned = cleanValues(values);
  return Boolean(
    cleaned.name ||
      cleaned.role ||
      cleaned.company ||
      cleaned.description ||
      cleaned.looking_for ||
      cleaned.linkedin_url ||
      cleaned.website_url ||
      cleaned.phone ||
      cleaned.instagram ||
      cleaned.twitter ||
      (cleaned.interests?.length ?? 0) > 0,
  );
}

export function loadProfileDraft(userId: string): Partial<RegisterValues> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProfileDraft;
    if (parsed?.v !== STORAGE_VERSION) return null;
    const values = cleanValues(parsed.values);
    return hasProfileDefaults(values) ? values : null;
  } catch {
    return null;
  }
}

export function saveProfileDraft(userId: string, values: Partial<RegisterValues>): void {
  if (typeof window === "undefined") return;
  const payload: StoredProfileDraft = {
    v: STORAGE_VERSION,
    values: cleanValues(values),
  };
  window.localStorage.setItem(storageKey(userId), JSON.stringify(payload));
}

/**
 * Drop the in-progress draft. Call this once a registration succeeds: the draft
 * is only a recovery buffer for an *interrupted* fill (a mobile tab-switch that
 * evicts the page), NOT the long-term prefill source — that's the synced global
 * profile on the server. Clearing it means the next event prefills from the
 * fresh profile, so a later profile edit isn't shadowed by a stale draft.
 */
export function clearProfileDraft(userId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(userId));
}
