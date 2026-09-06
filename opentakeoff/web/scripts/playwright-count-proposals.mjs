/**
 * COUNT PROPOSALS, THROUGH THE REAL UI.
 *
 * A count proposal used to be staged with `area_sf` computed from its single
 * vertex — so the Agent panel printed "· 0 SF" for a good count, the overlay
 * drew a <polygon> over one point (i.e. nothing at all), and Accept wrote
 * `computed:{area_sf:0, perimeter_lf:0}` that only totalled correctly because
 * of a `cp.count || 1` fallback in totals.js.
 *
 * This drives the actual component: upload, set a scale, stage one count and
 * one area proposal through the same entry point the agent's propose_shapes
 * uses, then read the panel row, the overlay node, and the committed shape.
 *
 *   node scripts/playwright-count-proposals.mjs
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";
const OUT = process.env.OT_COUNT_OUT || "/tmp/ot-count";
const BENCH = "/home/user/master-plan/HVAC BAS Benchmark Collection";

function findPdf() {
  const cands = [
    resolve(BENCH, "pdf/05__vol2__009__USDA_APHIS_Plant_Inspection_Station_Building_63.pdf"),
    resolve(root, "public/tarrant-county-mechanical.pdf"),
  ];
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error("no PDF to drive");
}

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({
  headless: true,
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => { console.log(`pageerror ${String(e).slice(0, 200)}`); fails.push("pageerror"); });
mkdirSync(OUT, { recursive: true });

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[name="sheet-file"]', { state: "attached", timeout: 60_000 });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(findPdf());
  await page.waitForFunction(
    () => window.__opentakeoff?.indexProgress?.()?.phase === "ready",
    { timeout: 15 * 60 * 1000 },
  );
  await page.waitForTimeout(1500);

  // A scale is required before any proposal can be accepted — set it the way
  // the agent's set_scale tool does.
  const sheet = await page.evaluate(() => {
    const k = window.__opentakeoff.probe.sheets()[0];
    const r = window.__opentakeoff.probe.setScale(k.key, `1/8" = 1'-0"`);
    if (r?.error) throw new Error(r.error);
    return k.key;
  });
  console.log(`sheet ${sheet}`);
  await page.waitForTimeout(500);

  // Two proposals through the SAME entry point propose_shapes uses.
  const staged = await page.evaluate((key) => {
    const cid = window.__opentakeoff.probe.mintCondition("VAV-1");
    return window.__opentakeoff.probe.stageProposals([
      { sheet: key, condition_id: cid, measure_role: "count",
        verts_norm: [[0.42, 0.37]], evidence: { schedule_row_tag: "VAV-1" } },
      { sheet: key, condition_id: cid, measure_role: "area",
        verts_norm: [[0.10, 0.10], [0.30, 0.10], [0.30, 0.25], [0.10, 0.25]],
        evidence: { schedule_row_tag: "VAV-1" } },
    ]);
  }, sheet);
  check("propose_shapes staged both", staged?.staged === 2, JSON.stringify(staged));
  await page.waitForTimeout(400);

  const props = await page.evaluate(() => window.__opentakeoff.probe.proposals());
  const cp = props.find((p) => p.measure_role === "count");
  const ap = props.find((p) => p.measure_role === "area");
  check("count proposal carries count:1", cp?.count === 1, JSON.stringify(cp));
  check("count proposal has NO area_sf", cp?.area_sf === undefined, `area_sf=${cp?.area_sf}`);
  check("area proposal still carries area_sf", typeof ap?.area_sf === "number" && ap.area_sf > 0, `area_sf=${ap?.area_sf}`);

  // The panel row must read the count, not "0 SF".
  await page.evaluate(() => window.__opentakeoff.openAgent());
  await page.waitForSelector('textarea[name="agent-goal"]', { timeout: 30_000 });
  await page.waitForTimeout(500);
  const rowText = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((s) => /VAV-1/.test(s.textContent || "") && / · /.test(s.textContent || ""));
    return el ? el.textContent : "";
  });
  check("panel row says EA, not 0 SF", /1 EA/.test(rowText) && !/0 SF/.test(rowText), JSON.stringify(rowText.slice(0, 80)));

  // The overlay must actually paint something for a count.
  const overlay = await page.evaluate(() => {
    const g = [...document.querySelectorAll("g")].filter((n) => /Agent proposal/.test(n.querySelector("title")?.textContent || ""));
    return g.map((n) => ({
      title: n.querySelector("title").textContent.slice(0, 60),
      shape: n.querySelector("rect") ? "rect" : n.querySelector("polygon") ? "polygon" : "none",
    }));
  });
  const cOv = overlay.find((o) => /1 EA/.test(o.title));
  const aOv = overlay.find((o) => /SF|sf|ft/.test(o.title));
  check("count overlay draws a marker", cOv?.shape === "rect", JSON.stringify(cOv));
  check("area overlay still a polygon", aOv?.shape === "polygon", JSON.stringify(aOv));

  await page.screenshot({ path: resolve(OUT, "proposals.png") });

  // Accept, then read what was actually written.
  await page.evaluate(() => window.__opentakeoff.probe.acceptAll());
  await page.waitForTimeout(600);
  const shapes = await page.evaluate(() => window.__opentakeoff.probe.shapes());
  const cs = shapes.find((s) => s.measure_role === "count");
  const as = shapes.find((s) => s.measure_role === "area");
  check("committed count has computed.count", cs?.computed?.count === 1, JSON.stringify(cs?.computed));
  check("committed count has no fake area", cs?.computed?.area_sf === undefined, JSON.stringify(cs?.computed));
  check("committed area keeps area_sf", typeof as?.computed?.area_sf === "number" && as.computed.area_sf > 0, JSON.stringify(as?.computed));
} finally {
  await browser.close();
}

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(", ")}` : "\nall checks passed");
process.exit(fails.length ? 1 : 0);
