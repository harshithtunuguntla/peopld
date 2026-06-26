"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { SplitReveal } from "@/components/brand/split-reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/design/colors";
import { apiFetch } from "@/lib/api";

type Status = "idle" | "submitting" | "done" | "error";

/**
 * The closing "book a demo" moment — the signature coral box, now a working lead
 * form. Submits to the backend (`POST /demo-requests`, which stores the lead and
 * notifies us); on any failure it degrades to a clear "reach us on Instagram"
 * fallback so the button is never a dead end. Anchored as #book-demo so every
 * "Book a demo" CTA on the page scrolls here.
 */
export function FinalCta() {
  const [status, setStatus] = useState<Status>("idle");
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    try {
      await apiFetch("/demo-requests", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          company: form.company.trim() || null,
          message: form.message.trim() || null,
        }),
      });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section id="book-demo" className="scroll-mt-24 py-16 sm:py-24">
      <div className="mx-auto max-w-[1100px] px-6 sm:px-8">
        <div className="relative overflow-hidden rounded-[28px] bg-coral p-7 text-white sm:rounded-[36px] sm:p-16">
          <div
            className="absolute -right-20 -top-20 h-72 w-72 animate-spin-slow rounded-full"
            style={{ background: COLORS.lime }}
            aria-hidden
          />
          <div
            className="absolute -bottom-10 -left-10 h-48 w-48 animate-spin-slow rounded-full [animation-direction:reverse]"
            style={{ background: COLORS.plasma }}
            aria-hidden
          />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <h2 className="max-w-2xl text-balance font-display text-[clamp(28px,5.2vw,56px)] leading-[1.04] tracking-[-0.03em] sm:leading-[0.98]">
                <SplitReveal as="span" className="block">
                  Run your next event like
                </SplitReveal>
                <SplitReveal as="span" className="block italic" delay={0.1}>
                  someone obviously did this on purpose.
                </SplitReveal>
              </h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/80">
                Tell us about your event and we&apos;ll set you up with a live demo. We run every
                event ourselves right now — so you get a hands-on walkthrough, not a login.
              </p>
            </div>

            {/* The form card sits on the box for contrast against the coral. */}
            <div className="rounded-[22px] bg-white p-5 text-ink shadow-2xl sm:p-6">
              {status === "done" ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-coral/15 text-coral">
                    <Check className="h-6 w-6" aria-hidden />
                  </span>
                  <p className="font-display text-xl">You&apos;re on the list.</p>
                  <p className="max-w-xs text-sm text-ink/60">
                    Thanks{form.name.trim() ? `, ${form.name.trim().split(/\s+/)[0]}` : ""} — we&apos;ll
                    reach out shortly to line up your demo.
                  </p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-3">
                  <Field label="Name" required value={form.name} onChange={update("name")} placeholder="Your name" autoComplete="name" />
                  <Field label="Work email" required type="email" value={form.email} onChange={update("email")} placeholder="you@company.com" autoComplete="email" />
                  <Field label="Company" value={form.company} onChange={update("company")} placeholder="Company or community" autoComplete="organization" />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink/60" htmlFor="demo-message">
                      About your event <span className="text-ink/40">(optional)</span>
                    </label>
                    <textarea
                      id="demo-message"
                      value={form.message}
                      onChange={update("message")}
                      rows={2}
                      maxLength={500}
                      placeholder="Type, size, when…"
                      className="w-full resize-none rounded-xl border border-ink/15 bg-paper/60 px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink/35 focus:border-coral"
                    />
                  </div>

                  {status === "error" && (
                    <p role="alert" className="rounded-lg bg-coral/10 px-3 py-2 text-xs text-coral">
                      Couldn&apos;t send that just now. Reach us on{" "}
                      <a href="https://instagram.com/peopld.in" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                        Instagram
                      </a>{" "}
                      and we&apos;ll sort it out.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "submitting" || !form.name.trim() || !form.email.trim()}
                    className={cn(buttonVariants({ size: "lg" }), "w-full disabled:opacity-50")}
                  >
                    {status === "submitting" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending…
                      </>
                    ) : (
                      <>
                        Book a demo <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink/60">
        {label} {props.required && <span className="text-coral">*</span>}
      </label>
      <input
        {...props}
        className="w-full rounded-xl border border-ink/15 bg-paper/60 px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink/35 focus:border-coral"
      />
    </div>
  );
}
