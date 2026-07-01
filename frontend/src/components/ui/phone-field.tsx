"use client";

import * as React from "react";
import { ChevronDown, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DIAL_CODES } from "@/lib/dial-codes";
import { cn } from "@/lib/utils";

/**
 * Country dial code + local number, as one aligned group. The dial code is a
 * native <select> (great on mobile — the OS wheel picker) styled to match the
 * app Input's height/border so the two read as a single control. WhatsApp needs
 * the full international number, which is why we keep the code explicit rather
 * than trusting a free-typed one.
 */
export function PhoneField({
  dialCode,
  phone,
  onDialChange,
  onPhoneChange,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": describedBy,
}: {
  dialCode: string;
  phone: string;
  onDialChange: (code: string) => void;
  onPhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="relative shrink-0">
        <select
          value={dialCode}
          onChange={(e) => onDialChange(e.target.value)}
          aria-label="Country dial code"
          className={cn(
            "h-12 appearance-none rounded-xl border border-input bg-secondary/50 pl-3.5 pr-8 text-base text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          {DIAL_CODES.map((d) => (
            <option key={d.code} value={d.code}>
              {d.flag} {d.code}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex-1">
        <Input
          id={id}
          aria-invalid={ariaInvalid}
          aria-describedby={describedBy}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          startIcon={<Phone className="h-4 w-4" aria-hidden />}
          value={phone}
          onChange={onPhoneChange}
          placeholder="98765 43210"
          className="w-full"
        />
      </div>
    </div>
  );
}
