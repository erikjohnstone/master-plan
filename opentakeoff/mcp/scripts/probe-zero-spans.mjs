/**
 * Use Session live spans (not graph) to classify extract zeros.
 * node --import tsx scripts/probe-zero-spans.mjs
 */
import path from "node:path";
import fs from "node:fs";
import { Session } from "../src/session.ts";
import { textSpans } from "../src/pdf.ts";

const BULK = "/workspace/opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets";
const REJOIN = path.join(BULK, "_rejoined");

function pdfFor(id) {
  const rejoin = path.join(REJOIN, `${id}.pdf`);
  if (fs.existsSync(rejoin)) return rejoin;
  const single = path.join(BULK, `${id}.pdf`);
  if (fs.existsSync(single)) return single;
  throw new Error("missing " + id);
}

const IDS = [
  "07_MO_MSHP_TroopB_HVAC_Boilers_Controls",
  "19_CA_VistaUSD_DataCenter",
  "29_TX_JPS_Hospital_CentralPlant_Chiller",
  "04_NV_VA_LasVegas_CentralUtilityPlant",
  "26_CA_TransbayTower_Mechanical_64Sheets",
];

async function probe(id) {
  const pdf = pdfFor(id);
  console.log("\n========", id);
  const s = new Session();
  await s.loadPlan(pdf);
  const sheets = s.sheetList();
  console.log("sessionSheets=", sheets.length);
  // Build graph for roles/tables/imageArea
  const g = await s.graphForPipeline();
  console.log("graphSheets=", g.sheets?.length, "tables=", g.tables?.length);

  let scheduleTitleHits = 0;
  for (const sh of sheets) {
    const state = s.sheets?.get?.(sh.key) || s._sheets?.get?.(sh.key);
    // Access via public API used elsewhere
  }

  // Prefer iterating session internals the same way findText does
  for (let i = 0; i < Math.min(sheets.length, 80); i++) {
    const meta = sheets[i];
    const pageState = s.getSheet?.(meta.key) || null;
    // Fall back: positioned search
  }

  // Use findText-like: session method
  if (typeof s.findText === "function") {
    for (const needle of [
      "MECHANICAL EQUIPMENT SCHEDULE",
      "MECHANICAL SCHEDULES",
      "BOILER SCHEDULE",
      "CHILLER SCHEDULE",
      "PUMP SCHEDULE",
      "RTU SCHEDULE",
      "EQUIPMENT SCHEDULE",
      "SOUND TRAP",
      "SINGLE DUCT CAV",
      "RAH-",
      "WFU-",
    ]) {
      const hits = await Promise.resolve(s.findText(needle, { limit: 8 }));
      const list = Array.isArray(hits) ? hits : hits?.matches || hits?.hits || [];
      if (!list?.length) continue;
      scheduleTitleHits += list.length;
      console.log(`  findText "${needle}" → ${list.length}`);
      for (const h of list.slice(0, 3)) {
        console.log(
          "   ",
          h.sheet || h.sheet_id || h.key,
          JSON.stringify(String(h.text || h.str || "").slice(0, 100)),
        );
      }
    }
  }

  // Direct span dump via ensuring spans on first N sheets that mention SCHEDULE
  // Mirror session.ensureSpans pattern from sheet_context
  const internalSheets = [...(s.docs?.values?.() || [])];
  // Try known private maps
  const mapKeys = ["sheetStates", "sheetsByKey", "_sheetMap", "planSheets"];
  for (const k of mapKeys) {
    if (s[k]) console.log("  has", k, typeof s[k]);
  }

  // Walk sheetList + textSpans via page handles if exposed
  for (const meta of sheets.slice(0, sheets.length)) {
    let spans = null;
    try {
      // session.ts pattern: this.sheets is Map
      const sh = s.sheets?.get?.(meta.key);
      if (sh) {
        if (!sh.spans) sh.spans = textSpans(sh.page);
        spans = sh.spans;
      }
    } catch (e) {
      /* ignore */
    }
    if (!spans) continue;
    const sched = spans.filter((sp) =>
      /SCHEDULE/i.test(String(sp.str || sp.text || "")),
    );
    if (!sched.length) continue;
    for (const h of sched.slice(0, 3)) {
      const text = String(h.str || h.text || "");
      if (!/EQUIPMENT|MECHANICAL|BOILER|CHILLER|PUMP|RTU|AHU|FAN|SOUND|CAV|VALVE|TERMINAL/i.test(text)
        && !/^.*SCHEDULE/i.test(text)) {
        continue;
      }
      scheduleTitleHits++;
      const y1 = h.y1 ?? h.bbox?.[3];
      const y0 = h.y0 ?? h.bbox?.[1];
      const below = spans
        .filter((sp) => {
          const cy = ((sp.y0 ?? sp.bbox?.[1]) + (sp.y1 ?? sp.bbox?.[3])) / 2;
          return cy > y1 - 2 && cy < y1 + 250;
        })
        .sort(
          (a, b) =>
            (a.y0 ?? a.bbox?.[1]) - (b.y0 ?? b.bbox?.[1]) ||
            (a.x0 ?? a.bbox?.[0]) - (b.x0 ?? b.bbox?.[0]),
        )
        .slice(0, 40)
        .map((sp) => String(sp.str || sp.text || "").slice(0, 36));
      const gSheet = (g.sheets || []).find(
        (x) => x.key === meta.key || x.id === meta.key || x.sheet === meta.key,
      );
      console.log(
        `  SPAN sheet=${meta.key} role=${gSheet?.role} img=${Number(gSheet?.imageArea || 0).toFixed(3)} nSpans=${spans.length}`,
      );
      console.log(`    title="${text.slice(0, 90)}"`);
      console.log(`    below(${below.length}):`, below.join(" | ") || "(EMPTY — likely raster/outline body)");
    }
  }
  console.log("  scheduleTitleHits=", scheduleTitleHits);
}

for (const id of IDS) {
  try {
    await probe(id);
  } catch (e) {
    console.error("FAIL", id, e.stack || e.message);
  }
}

// Peek Session shape once
{
  const s = new Session();
  await s.loadPlan(pdfFor("19_CA_VistaUSD_DataCenter"));
  console.log("\nSession keys:", Object.keys(s).slice(0, 40));
  console.log("sheets type", s.sheets?.constructor?.name, "size", s.sheets?.size);
}
