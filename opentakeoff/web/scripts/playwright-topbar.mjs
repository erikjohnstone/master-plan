/**
 * THE TOP BAR MUST NOT OVERLAP ITSELF, AND NOTHING MEASURED IT.
 *
 * The bar's group captions were `position: absolute`, up to 200px wide, over
 * cluster bodies frequently much narrower — "Action"'s body is 150px and often
 * empty — so `Scale — <sheet name>` painted on top of `Action`, and `Action`'s
 * own caption floated over the TAKEOFF / Report / ⋯ buttons, which are not even
 * its children. Every screenshot-based check passed the whole time: an overlap
 * is not an error, it is just two rectangles in the same place.
 *
 * This driver measures. Two assertions, at three real widths:
 *   1. no two top-bar elements' client rects intersect
 *   2. the working deck does not overflow its own scroll box
 * Overflow is only a failure from 1440 up — below that the bar is allowed to
 * scroll, and app.css paints the shadow that says so.
 *
 *   node scripts/playwright-topbar.mjs [--widths 1280,1440,1920]
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const BENCH = "/home/user/master-plan/HVAC BAS Benchmark Collection/pdf";
const OUT = process.env.OT_TOPBAR_OUT || "/tmp/ot-topbar";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";
const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const WIDTHS = (argOf("--widths") || "1280,1440,1920").split(",").map(Number);
const doc = argOf("--doc") || "05";
/** Below this, the bar is ALLOWED to scroll — that is what the shadow is for. */
const NO_SCROLL_FROM = 1440;

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) fails.push(name);
};

function findPdf() {
  if (process.env.OT_UI_PDF) return resolve(process.env.OT_UI_PDF);
  if (!existsSync(BENCH)) return null;
  const hit = readdirSync(BENCH).find((f) => f.startsWith(`${doc}__`) && f.endsWith(".pdf"));
  return hit ? resolve(BENCH, hit) : null;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined, args: ["--no-sandbox"] });

// The overlap probe. Leaf elements only — a container legitimately contains its
// children, and a caption legitimately sits above its own controls, so compare
// only elements that have no element ancestor inside the bar besides layout
// wrappers. In practice: every element with no element children.
const OVERLAP_FN = () => {
  const bar = document.querySelector("[data-topbar]");
  if (!bar) return { error: "no [data-topbar]" };
  const leaves = [...bar.querySelectorAll("*")].filter((el) => {
    // An icon's own <path>s legitimately overlap each other inside their <svg>;
    // the icon is the leaf as far as layout is concerned.
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") return false;
    if (el.tagName.toLowerCase() !== "svg" && el.children.length) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
    // a text node's own wrapper inside a button is the button's business
    return true;
  });
  const label = (el) => {
    const t = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
    return `${el.tagName.toLowerCase()}${t ? `("${t}")` : ""}`;
  };
  const hits = [];
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], b = leaves[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      // 1px of shared edge is a border, not an overlap
      if (ox > 1 && oy > 1) hits.push({ a: label(a), b: label(b), ox: Math.round(ox), oy: Math.round(oy) });
    }
  }
  const scroll = bar.querySelector("[data-topbar-scroll]");
  return {
    leaves: leaves.length,
    hits,
    scrollWidth: scroll ? scroll.scrollWidth : 0,
    clientWidth: scroll ? scroll.clientWidth : 0,
    barHeight: Math.round(bar.getBoundingClientRect().height),
  };
};

try {
  const pdf = findPdf();
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    page.on("pageerror", (e) => { console.log(`pageerror ${String(e).slice(0, 200)}`); fails.push("pageerror"); });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-topbar]", { timeout: 60_000 });
    // Load a real set: half the bar (sheet nav, Schedules, Scale) only exists
    // once there are sheets, and an empty bar cannot overlap.
    if (pdf) {
      await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
      await page.waitForFunction(() => window.__opentakeoff?.indexProgress?.()?.phase === "ready", null, { timeout: 15 * 60 * 1000 });
    }
    await page.waitForTimeout(1200);

    const r = await page.evaluate(OVERLAP_FN);
    console.log(`\n${width}px — ${r.leaves} leaf elements, bar ${r.barHeight}px tall, deck 2 ${r.scrollWidth}/${r.clientWidth}px`);
    check(`${width}: no two top-bar elements overlap`, (r.hits || []).length === 0,
      (r.hits || []).slice(0, 6).map((h) => `${h.a} × ${h.b} (${h.ox}×${h.oy}px)`).join(" | "));
    if (width >= NO_SCROLL_FROM) {
      check(`${width}: the working deck fits without scrolling`, r.scrollWidth <= r.clientWidth + 1,
        `${r.scrollWidth} > ${r.clientWidth} by ${r.scrollWidth - r.clientWidth}px`);
    } else {
      console.log(`      (${width}px may scroll — overflow ${Math.max(0, r.scrollWidth - r.clientWidth)}px, the scroll shadow says so)`);
    }
    await page.screenshot({ path: resolve(OUT, `topbar-${width}.png`), clip: { x: 0, y: 0, width, height: Math.max(60, r.barHeight + 10) } });
    await page.close();
  }
  console.log(`\nscreenshots in ${OUT}`);
} finally {
  await browser.close();
}

console.log(fails.length ? `\n${fails.length} check(s) failed: ${fails.join(", ")}` : "\nall checks passed");
process.exit(fails.length ? 1 : 0);
