import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely (clsx + tailwind-merge). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Today as a local "YYYY-MM-DD" string — matches `<input type="date">` and how
 * events store their date. Used as a `min` bound so the native date picker can't
 * easily produce a stray-keystroke year (e.g. "2026" typed into a field that
 * collapses to "0206"). */
export function todayDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
