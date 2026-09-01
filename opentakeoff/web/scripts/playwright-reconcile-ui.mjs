/**
 * WP4 UI proof: schedule↔plan reconcile via the same Agent tool path
 * (window.__opentakeoff.reconcileSchedulePlan).
 *
 * Asserts contractor-grade reconcile output on D07 bldg5406 VAV family:
 *   - CSV header row with Status column
 *   - VAV-1 MATCH with plan cites
 *   - ≥3 MATCH rows (plan-drawn VAV tags)
 *   - ≥9 schedule rows
 *
 * Usage: OT_UI_URL=http://127.0.0.1:5173/ node scripts/playwright-reconcile-ui.mjs
 */
import { chromium } from "playwright";
import {
  mkdirSync, existsSync, copyFileSync, writeFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const corpus = resolve(root, "../opentakeoff-corpus");
const pdf = resolve(corpus, "raw/bldg5406-hvac-demo-mechanical.pdf");
const artifacts = "/opt/cursor/artifacts";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";

if (!existsSync(pdf)) throw new Error(`PDF missing: ${pdf}`);
mkdirSync(artifacts, { recursive: true });
mkdirSync("/tmp/ot-pw-reconcile-videos", { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: { dir: "/tmp/ot-pw-reconcile-videos", size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(300_000);

const fail = async (msg) => {
  const shot = `${artifacts}/reconcile_ui_FAIL.png`;
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  throw new Error(`${msg} (shot ${shot})`);
};

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  console.log("upload bldg5406 PDF");
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);

  await page.waitForFunction(
    () => typeof window.__opentakeoff?.reconcileSchedulePlan === "function",
    null,
    { timeout: 180_000 },
  ).catch(() => fail("window.__opentakeoff.reconcileSchedulePlan never appeared"));
  await page.waitForTimeout(2500);

  console.log("reconcile VAV family (shared Session sweep path)");
  const reconciled = await page.evaluate(async () => {
    const out = await window.__opentakeoff.reconcileSchedulePlan({
      family: "VAV",
      familySweepAll: true,
      download: false,
    });
    return out;
  });

  if (reconciled?.error) await fail(`reconcile error: ${reconciled.error}`);
  if (reconciled.path !== "production_session") {
    await fail(`expected production_session path, got ${reconciled.path}`);
  }
  if (!Array.isArray(reconciled?.rows) || !reconciled.rows.length) {
    await fail(`empty reconcile rows: ${JSON.stringify(reconciled)?.slice(0, 400)}`);
  }

  const csv = reconciled.csv || "";
  if (!/^Tag,Family,Scheduled qty,Installed qty,Status,/m.test(csv)) {
    await fail("CSV missing contractor header row");
  }

  const summary = reconciled.summary || {};
  if ((summary.match ?? 0) < 3) {
    await fail(`summary.match=${summary.match} want ≥3`);
  }
  if (reconciled.rows.length < 9) {
    await fail(`row count=${reconciled.rows.length} want ≥9 VAV schedule rows`);
  }

  const vav1 = reconciled.rows.find((r) => r.tag === "VAV-1");
  if (!vav1 || vav1.status !== "MATCH") {
    await fail(`VAV-1 status=${vav1?.status} want MATCH`);
  }
  if (!(vav1.plan_cites?.length >= 1)) {
    await fail("VAV-1 missing plan cite(s)");
  }

  const statuses = new Set(reconciled.rows.map((r) => r.status));
  if (!statuses.has("MATCH")) await fail("no MATCH rows in reconcile table");

  await page.screenshot({ path: `${artifacts}/reconcile_ui_result.png`, fullPage: true });
  writeFileSync(`${artifacts}/reconcile_ui_result.json`, JSON.stringify({
    ok: true,
    family_filter: reconciled.family_filter,
    summary: reconciled.summary,
    sample_rows: reconciled.rows.slice(0, 5).map((r) => ({
      tag: r.tag,
      status: r.status,
      installed_qty: r.installed_qty,
      plan_sheets: (r.plan_cites || []).map((c) => c.sheet),
    })),
    vav1: {
      tag: vav1.tag,
      status: vav1.status,
      installed_qty: vav1.installed_qty,
      plan_cites: vav1.plan_cites?.length ?? 0,
    },
  }, null, 2));

  console.log(JSON.stringify({
    ok: true,
    rows: reconciled.rows.length,
    match: summary.match,
    vav1: vav1.status,
  }));
  console.log("RECONCILE_UI_PROOF_OK");
} finally {
  const vid = page.video();
  await context.close();
  await browser.close();
  if (vid) {
    const vpath = await vid.path();
    const dest = `${artifacts}/reconcile_ui_proof.webm`;
    try { copyFileSync(vpath, dest); console.log("video", dest); } catch {}
  }
}
