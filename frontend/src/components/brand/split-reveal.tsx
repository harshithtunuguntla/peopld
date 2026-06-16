"use client";

import { useEffect, useRef, type CSSProperties, type ElementType, type Ref } from "react";
import { gsap } from "gsap";
import { prefersReducedMotion } from "@/lib/design/motion";

type Props = {
  children: string;
  className?: string;
  as?: ElementType;
  delay?: number;
  splitBy?: "word" | "char";
  /** Play on scroll-in (true) or immediately on mount (false). */
  trigger?: boolean;
  style?: CSSProperties;
};

/** Headline that rises line/word into view. Reduced-motion: renders static.
 * See docs/design/DESIGN_SYSTEM.md §5. */
export function SplitReveal({
  children,
  className = "",
  as = "span",
  delay = 0,
  splitBy = "word",
  trigger = true,
  style,
}: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const parts = splitBy === "word" ? children.split(" ") : children.split("");
    el.innerHTML = parts
      .map(
        (p) =>
          `<span class="inline-block overflow-hidden align-baseline"><span class="split-inner inline-block">${
            p === " " ? "&nbsp;" : p
          }</span></span>${splitBy === "word" ? " " : ""}`,
      )
      .join("");

    const inners = el.querySelectorAll<HTMLElement>(".split-inner");
    gsap.set(inners, { yPercent: 110 });
    const play = () =>
      gsap.to(inners, { yPercent: 0, duration: 0.95, ease: "expo.out", stagger: 0.045, delay });

    if (!trigger) {
      play();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            play();
            io.disconnect();
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [children, delay, splitBy, trigger]);

  const Tag = as as ElementType;
  return (
    // ref typing across arbitrary elements is loose; safe at runtime
    <Tag ref={ref as Ref<HTMLElement>} className={className} style={style}>
      {children}
    </Tag>
  );
}
