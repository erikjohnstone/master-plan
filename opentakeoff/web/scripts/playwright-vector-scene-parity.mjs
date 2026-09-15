/**
 * GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 gate: "at least five real
 * PDFs show browser/MCP parity." Loads each PDF in a real Chromium browser
 * (this app's own extraction call, via window.__opentakeoff.probe.
 * vectorGeometry), separately extracts the SAME page in Node through
 * mcp/src/pdf.ts (the same path MCP/Session uses), and diffs the results
 * field by field: segs, meta, lum, primType, layerOf, layerIds, subpath
 * count/shape. Both sides call the identical, shared extractVectorGeometry
 * — this is what proves that in practice, not just by code-reading.
 *
 *   node scripts/playwright-vector-scene-parity.mjs
 */
import { chromium } from "playwright";
import { resolve } from "node:path";
import { openPdf, OPS } from "../../mcp/src/pdf.ts";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";

const BENCH = "/home/user/master-plan/HVAC BAS Benchmark Collection/pdf";
const baseUrl = process.env.OT_UI_URL || "http://127.0.0.1:5173/";

// Five real PDFs from this session's own corpus, spanning small to very
// large (the 102k-primitive sheet slice 9 already profiled) so parity is
// shown across scale, not just on one convenient case.
const CASES = [
  { pdf: `${BENCH}/01__vol2__001__Cherry_Point_Air_Traffic_Tower_and_Air_Operations.pdf`, page: 12 },
  { pdf: `${BENCH}/09__vol2__014__Missoula_Fire_Sciences_Laboratory_Mechanical_Upgrade.pdf`, page: 1 },
  { pdf: `${BENCH}/03__vol1__27__Colville_White_Sturgeon_Fish_Hatchery.pdf`, page: 6 },
  { pdf: `${BENCH}/05__vol2__009__USDA_APHIS_Plant_Inspection_Station_Building_63.pdf`, page: 1 },
  { pdf: `${BENCH}/10__vol2__040__Lovell_Federal_Health_Care_Center_Sterile_Processing_Expansion.pdf`, page: 24 },
];

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return a == null && b == null;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({ headless: true, executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });

try {
  for (const { pdf: pdfArg, page: pageNumber } of CASES) {
    const pdfPath = resolve(pdfArg);
    const label = `${pdfPath.split("/").at(-1)}#${pageNumber}`;
    console.log(`\n=== ${label} ===`);

    // Fresh page/context per case (matching playwright-sweep-review.mjs's
    // own one-case-per-load pattern) — loading a second plan set into an
    // already-loaded app is a different, untested flow; a clean reload is
    // the proven path and keeps each case fully independent.
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    page.on("pageerror", (e) => { console.log(`pageerror ${String(e).slice(0, 240)}`); fails.push("pageerror"); });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('input[name="sheet-file"]', { state: "attached", timeout: 60_000 });

    // Browser side: load the PDF as a fresh sheet, open it, read the probe.
    await page.locator('input[name="sheet-file"]').first().setInputFiles(pdfPath);
    await page.waitForFunction(() => window.__opentakeoff?.indexProgress?.()?.phase === "ready", null, { timeout: 15 * 60 * 1000 });
    const key = await page.evaluate(async (pageNo) => {
      const k = window.__opentakeoff.probe.sheets()[0]?.key || "";
      const file = k.includes("#") ? k.slice(0, k.lastIndexOf("#")) : k;
      // sheetKey.ts's own convention: no "#N" suffix means page 1. Always
      // appending "#1" would ask for a DIFFERENT string than the already-
      // open default panel's own key, which is what caused a real timeout
      // here (openSheets/segCount never found data under the "#1"-suffixed
      // string this constructed, since the real panel's key had no suffix).
      const target = pageNo <= 1 ? file : `${file}#${pageNo}`;
      if (target !== k) window.__opentakeoff.probe.openSheets([target]);
      return target;
    }, pageNumber);
    await page.waitForFunction((k) => (window.__opentakeoff.probe.segCount(k) || 0) > 0, key, { timeout: 120_000 });
    const browserGeo = await page.evaluate((k) => window.__opentakeoff.probe.vectorGeometry(k), key);
    if (!browserGeo) { check(`${label}: browser geometry available`, false, "probe returned null"); continue; }

    // Node/MCP side: the same file, same page, through the actual MCP path.
    const doc = await openPdf(pdfPath);
    const pg = await doc.page(pageNumber);
    const mcpGeo = extractVectorGeometry(await pg.operatorList(), pg.viewport.transform, OPS);
    await doc.destroy();

    check(`${label}: primitive count matches`, browserGeo.segs.length === mcpGeo.segs.length,
      `browser ${browserGeo.segs.length >> 2}, mcp ${mcpGeo.segs.length >> 2}`);
    check(`${label}: segs identical`, arraysEqual(browserGeo.segs, mcpGeo.segs));
    check(`${label}: meta identical`, arraysEqual(browserGeo.meta, Array.from(mcpGeo.meta)));
    check(`${label}: lum identical`, arraysEqual(browserGeo.lum, mcpGeo.lum ? Array.from(mcpGeo.lum) : null));
    check(`${label}: primType identical`, arraysEqual(browserGeo.primType, mcpGeo.primType ? Array.from(mcpGeo.primType) : null));
    check(`${label}: layerOf identical`, arraysEqual(browserGeo.layerOf, mcpGeo.layerOf ? Array.from(mcpGeo.layerOf) : null));
    check(`${label}: layerIds identical`, JSON.stringify(browserGeo.layerIds || []) === JSON.stringify(mcpGeo.layerIds || []));
    const bSp = browserGeo.subpaths || [], mSp = mcpGeo.subpaths || [];
    check(`${label}: subpath count matches`, bSp.length === mSp.length, `browser ${bSp.length}, mcp ${mSp.length}`);
    const subpathsMatch = bSp.length === mSp.length && bSp.every((s, i) => {
      const m = mSp[i];
      return s.i0 === m.i0 && s.i1 === m.i1 && s.closed === m.closed && s.flags === m.flags
        && s.fillLum === m.fillLum && s.dashed === m.dashed && s.formDepth === m.formDepth
        && s.lineCap === m.lineCap && s.lineJoin === m.lineJoin;
    });
    check(`${label}: subpath fields identical`, subpathsMatch);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${fails.length === 0 ? "ALL PARITY CHECKS PASSED" : `${fails.length} FAILURE(S)`}`);
if (fails.length) process.exitCode = 1;
