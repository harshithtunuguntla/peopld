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
