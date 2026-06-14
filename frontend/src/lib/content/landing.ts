/**
 * Landing + marketing-preview content — copy and structured data, separated from
 * presentation. Colors are referenced by brand token (never raw hex).
 * See docs/design/DESIGN_SYSTEM.md §1.
 */
import { BRAND } from "@/lib/design/palette";
import type { Fill } from "@/lib/design/palette";
import type { StackPerson } from "@/components/brand/avatar-stack";

export type Attendee = StackPerson & { role: string; tag: string };

/** Sample attendees for hero faces + the marketing preview scenes. Demo data. */
export const ATTENDEES: Attendee[] = [
  { id: 1, name: "Maya Chen", role: "Founder, Lumen AI", tag: "Voice agents that do not suck", color: BRAND.coral },
  { id: 2, name: "Jordan Reyes", role: "Design Lead, Stripe", tag: "Obsessed with brutalist UI", color: BRAND.chlorine },
  { id: 3, name: "Priya Kapoor", role: "Partner, Index Ventures", tag: "Seed-stage devtools investor", color: BRAND.plasma },
  { id: 4, name: "Sam Ellison", role: "Eng @ Anthropic", tag: "Agent evals and long context", color: BRAND.gold },
  { id: 5, name: "Noor Haddad", role: "CPO, Linear", tag: "Speed is the only feature", color: BRAND.ice },
  { id: 6, name: "Daniel Park", role: "Indie SaaS founder", tag: "$42k MRR, solo, 3 months", color: BRAND.coral },
  { id: 7, name: "Lina Brooks", role: "Storyteller @ Figma", tag: "Writes docs people read", color: BRAND.chlorine },
  { id: 8, name: "Theo Walker", role: "Robotics, ex-Tesla", tag: "Humanoid hands", color: BRAND.plasma },
];

export const HERO = {
  subcopy:
    "Peopld runs structured networking at your live event. AI seats your guests at the right table, hands them a question worth answering, and gives you a one-button command center to orchestrate the night.",
  proofCount: 12400,
  proofSuffix: "+ connections made last month",
  passIcebreaker: "What is a tool you used this week that felt suspiciously like magic?",
  giftIcebreaker: "What unpopular bet are you making now?",
  giftMeta: "Round 3 · Table 12",
};

/** The full icebreaker shown in preview scenes (multi-sentence). */
export const SAMPLE_ICEBREAKER =
  "Maya builds voice agents, Jordan obsesses over brutalist UI, and Priya backs devtools. What is a tool you used this week that felt suspiciously like magic?";

export const LOGOS = [
  "On Deck",
  "Y Combinator",
  "a16z",
  "Stripe Sessions",
  "Founders Inc",
  "The Browser Co",
  "Figma Config",
  "Vercel Ship",
  "Cerebral Valley",
];

export const PROBLEM = {
  copy:
    "The same five friends huddle. Introverts retreat to the snack table. “What do you do?” gets asked 47 times. The right two people never meet.",
  stats: [
    { value: "73%", label: "never meet anyone useful", fill: "rose" as Fill },
    { value: "8s", label: "before phones come out", fill: "lime" as Fill },
    { value: "1.4", label: "real intros per event", fill: "ice" as Fill },
    { value: "$0", label: "follow-up revenue", fill: "gold" as Fill },
  ],
};

export const STEPS: { n: string; title: string; desc: string; accent: "coral" | "plasma" | "chlorine" }[] = [
  { n: "01", title: "Guests scan a QR", desc: "They tap their name and a one-liner. 8 seconds. No app to download.", accent: "coral" },
  { n: "02", title: "You press Start Round", desc: "Peopld assigns every guest a table. Every phone in the room lights up.", accent: "plasma" },
  { n: "03", title: "AI hands the table a question", desc: "A prompt tuned to the exact humans seated. Conversations land.", accent: "chlorine" },
];

/** A 90-minute event arc. Each step's color comes from the round palette. */
export const TIMELINE: { t: string; label: string; desc: string; color: string }[] = [
  { t: "0:00", label: "Doors open", desc: "Guests scan the QR. Their bio lands in your dashboard live.", color: BRAND.coral },
  { t: "0:15", label: "Round 1 · Origins", desc: "Forty phones light up. The room re-arranges itself.", color: BRAND.plasma },
  { t: "0:25", label: "Mid-event spike", desc: "Hearts fly. AI re-tunes the next icebreaker based on what landed.", color: BRAND.chlorine },
  { t: "0:55", label: "Round 4 · Help wanted", desc: "The asks get specific. The room gets useful.", color: BRAND.gold },
  { t: "1:30", label: "Curtain call", desc: "Every guest leaves with a curated list. You leave with the data.", color: BRAND.ice },
];

export const TIMELINE_GRADIENT = [BRAND.coral, BRAND.plasma, BRAND.chlorine, BRAND.gold, BRAND.ice];

export const FOOTER_LINKS = [
  { label: "Manifesto", href: "#" },
  { label: "Hosts", href: "#" },
  { label: "Changelog", href: "#" },
  { label: "Twitter", href: "#" },
];

/** Where the marketing CTAs point in the real app. */
export const ROUTES = {
  host: "/organizer/login",
};
