/**
 * SYMBOL SWEEP REVIEW, WITH PICTURES.
 *
 * Review used to be a 150px text list: "84% · CD-1". You cannot judge "is that
 * the same device?" from a percentage. Each row now carries a thumbnail drawn
 * from the sheet's OWN linework under that placement.
 *
 * Driven with the project's frozen symbol-sweep ground truth — real seed rects
 * on real sheets, with hand-reviewed instance counts — so the fixture is a
 * device an estimator actually swept, not a synthetic square.
 *
 *   node scripts/playwright-sweep-review.mjs [--case 01-cherry-mh111-cd1]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BENCH = "/home/user/master-plan/HVAC BAS Benchmark Collection";
const GT = resolve(BENCH, "ground_truth/symbol_sweep/cases.json");
const OUT = process.env.OT_SWEEP_OUT || "/tmp/ot-sweep";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";
const args = process.argv.slice(2);
const want = args.indexOf("--case") >= 0 ? args[args.indexOf("--case") + 1] : "01-cherry-mh111-cd1";

const doc = JSON.parse(readFileSync(GT, "utf8"));
const cases = Array.isArray(doc) ? doc : doc.cases;
const c = cases.find((x) => x.id === want) || cases[0];
const pdf = resolve(BENCH, c.source_pdf);
if (!existsSync(pdf)) throw new Error(`missing ${pdf}`);

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) fails.push(name);
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on("pageerror", (e) => { console.log(`pageerror ${String(e).slice(0, 240)}`); fails.push("pageerror"); });

try {
  console.log(`case ${c.id}: ${c.source_pdf.split("/").pop()} p.${c.page}, seed ${JSON.stringify(c.seed_rect)}, ${c.instances.length} known instances`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[name="sheet-file"]', { state: "attached", timeout: 60_000 });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => window.__opentakeoff?.indexProgress?.()?.phase === "ready", null, { timeout: 15 * 60 * 1000 });

  // Open the sheet the case is on, and wait for its linework to be extracted.
  const key = await page.evaluate(async (pageNo) => {
    const k = window.__opentakeoff.probe.sheets()[0]?.key || "";
    const file = k.includes("#") ? k.slice(0, k.lastIndexOf("#")) : k;
    const target = `${file}#${pageNo}`;
    window.__opentakeoff.probe.openSheets([target]);
    return target;
  }, c.page);
  await page.waitForFunction((k) => (window.__opentakeoff.probe.segCount(k) || 0) > 0, key, { timeout: 120_000 });
  const segs = await page.evaluate((k) => window.__opentakeoff.probe.segCount(k), key);
  console.log(`sheet ${key}: ${segs.toLocaleString()} segments`);

  const res = await page.evaluate(({ k, rect }) => window.__opentakeoff.probe.sweepRect(k, rect), { k: key, rect: c.seed_rect });
  check("the sweep ran from the corpus seed rect", !res?.error, JSON.stringify(res));
  await page.waitForTimeout(1200);

  const sweep = await page.evaluate(() => {
    const s = window.__opentakeoff.probe.sweep();
    return s && { matches: s.matches.length, questions: s.questions.length, rect: s.seed.rect, key: s.key };
  });
  check("a review is open", !!sweep, JSON.stringify(sweep));
  console.log(`   found ${sweep?.matches} matches, ${sweep?.questions} questions (truth: ${c.instances.length} instances)`);

  // THE FIX: seed.rect was permanently undefined, so there was no footprint.
  check("sweep.seed.rect is a real footprint", !!sweep?.rect && sweep.rect.w > 0 && sweep.rect.h > 0, JSON.stringify(sweep?.rect));
  const [sa, sb] = c.seed_rect;
  check("and it is the marquee that was drawn", Math.abs(sweep.rect.w - Math.abs(sb[0] - sa[0])) < 2 && Math.abs(sweep.rect.h - Math.abs(sb[1] - sa[1])) < 2,
    `${sweep.rect.w}x${sweep.rect.h} vs ${Math.abs(sb[0] - sa[0])}x${Math.abs(sb[1] - sa[1])}`);

  // Thumbnails: one <svg> per rendered tile, each with real <line> children.
  const panel = page.locator("[data-sweep-review]");
  check("the review panel rendered", await panel.count() === 1);
  const tiles = panel.locator("svg");
  const n = await tiles.count();
  check("tiles were drawn", n > 0, `${n} tiles`);
  const inked = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll("[data-sweep-review] svg")];
    return svgs.map((s) => s.querySelectorAll("line").length);
  });
  check("every tile carries real linework", inked.length > 0 && inked.every((x) => x > 0), JSON.stringify(inked.slice(0, 14)));
  check("tiles differ (not one glyph repeated)", new Set(inked).size > 1 || inked.length === 1, JSON.stringify(inked.slice(0, 14)));

  await page.screenshot({ path: resolve(OUT, `${c.id}.png`) });
  const box = await panel.boundingBox();
  if (box) await page.screenshot({ path: resolve(OUT, `${c.id}-panel.png`), clip: box });
} finally {
  await browser.close();
}

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(", ")}` : "\nall checks passed");
process.exit(fails.length ? 1 : 0);
