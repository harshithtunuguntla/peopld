const { chromium } = require("playwright");
const path = require("path");

const BASE = process.env.CAPTURE_BASE_URL || "http://localhost:3001";
const EMAIL = process.env.CAPTURE_ORGANIZER_EMAIL;
const PASSWORD = process.env.CAPTURE_ORGANIZER_PASSWORD;
const EVENT_ID = process.argv[2];
if (!EVENT_ID || !EMAIL || !PASSWORD) {
  console.error("Usage: CAPTURE_ORGANIZER_EMAIL=... CAPTURE_ORGANIZER_PASSWORD=... node capture-waiting.js <eventId>");
  process.exit(1);
}
const OUT = path.join(__dirname, "..", "..", "captures");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/organizer/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/organizer\/dashboard/, { timeout: 15000 });

  await page.goto(`${BASE}/event/${EVENT_ID}/live`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "waiting-room.png") });
  console.log("captured waiting-room.png");

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
