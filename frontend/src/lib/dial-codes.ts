// A small, curated list of country dial codes for the phone/WhatsApp field.
// India is first (the current market) and the default. Not exhaustive — the
// common ones an attendee at a Hyderabad-hosted event is likely to need, plus
// the big English-speaking markets. Ordered India-first, then alphabetical.

export interface DialCode {
  code: string; // e.g. "+91"
  flag: string; // emoji, for the compact selector
  label: string; // country name, for the dropdown
}

export const DIAL_CODES: DialCode[] = [
  { code: "+91", flag: "🇮🇳", label: "India" },
  { code: "+1", flag: "🇺🇸", label: "USA / Canada" },
  { code: "+44", flag: "🇬🇧", label: "United Kingdom" },
  { code: "+61", flag: "🇦🇺", label: "Australia" },
  { code: "+65", flag: "🇸🇬", label: "Singapore" },
  { code: "+971", flag: "🇦🇪", label: "UAE" },
  { code: "+49", flag: "🇩🇪", label: "Germany" },
  { code: "+33", flag: "🇫🇷", label: "France" },
  { code: "+81", flag: "🇯🇵", label: "Japan" },
  { code: "+86", flag: "🇨🇳", label: "China" },
  { code: "+55", flag: "🇧🇷", label: "Brazil" },
  { code: "+27", flag: "🇿🇦", label: "South Africa" },
  { code: "+64", flag: "🇳🇿", label: "New Zealand" },
  { code: "+353", flag: "🇮🇪", label: "Ireland" },
  { code: "+92", flag: "🇵🇰", label: "Pakistan" },
  { code: "+880", flag: "🇧🇩", label: "Bangladesh" },
  { code: "+94", flag: "🇱🇰", label: "Sri Lanka" },
];

export const DEFAULT_DIAL_CODE = "+91";

export function dialCodeMeta(code: string | null | undefined): DialCode {
  return DIAL_CODES.find((d) => d.code === code) ?? DIAL_CODES[0];
}
