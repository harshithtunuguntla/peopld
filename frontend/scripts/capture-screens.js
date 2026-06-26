// One-off: log in as the demo organizer/attendee and screenshot real screens
// for the marketing Experience section. Temporary script — not part of the app.
const { chromium } = require("playwright");
const path = require("path");

const BASE = process.env.CAPTURE_BASE_URL || "http://localhost:3001";
const EMAIL = process.env.CAPTURE_ORGANIZER_EMAIL;
const PASSWORD = process.env.CAPTURE_ORGANIZER_PASSWORD;
const EVENT_ID = process.argv[2];
if (!EVENT_ID || !EMAIL || !PASSWORD) {
  console.error("Usage: CAPTURE_ORGANIZER_EMAIL=... CAPTURE_ORGANIZER_PASSWORD=... node capture-screens.js <eventId>");
  process.exit(1);
}
const OUT = path.join(__dirname, "..", "..", "captures");

async function shot(page, url, name, opts = {}) {
  await page.goto(url, { waitUntil: "networkidle" });
  if (opts.wait) await page.waitForTimeout(opts.wait);
  await page.screenshot({ path: path.join(OUT, name), fullPage: Boolean(opts.fullPage) });
  console.log("captured", name);
}

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const ctx = page.context();
  await ctx.clearCookies();

  // Sign in once via the organizer form — the resulting Supabase session in
  // this browser context works for attendee routes too (role only gates
  // organizer-only endpoints, not "is someone signed in").
  await page.goto(`${BASE}/organizer/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/organizer\/dashboard/, { timeout: 15000 });
  console.log("signed in");

  // Attendee-side live screens (390x844 = iPhone-ish viewport).
  await shot(page, `${BASE}/event/${EVENT_ID}/live`, "live-table.png", { wait: 3500 });
  await shot(page, `${BASE}/event/${EVENT_ID}/directory`, "directory.png", { wait: 1200 });
  await shot(page, `${BASE}/event/${EVENT_ID}/connections`, "connections.png", { wait: 1200 });

  // Organizer-side wide screens.
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, `${BASE}/organizer/event/${EVENT_ID}/live`, "organizer-live.png", { wait: 1500, fullPage: true });
  await shot(page, `${BASE}/organizer/event/${EVENT_ID}/run-sheet`, "run-sheet.png", { wait: 1200, fullPage: true });

  await browser.close();
  console.log("done ->", OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
