/**
 * Diagnose extract-blocked bulk zeros (title neighborhoods + compile).
 * Usage: node --import tsx scripts/probe-extract-zeros.mjs
 */
import path from "node:path";
import fs from "node:fs";
import { Session } from "../src/session.ts";
import {
  compileHvacTakeoff,
  compileBasTakeoff,
  compileControlValveTakeoff,
} from "../../web/src/lib/corpusTakeoff.mjs";

const BULK = "/workspace/opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets";
const REJOIN = path.join(BULK, "_rejoined");

function pdfFor(id) {
  const rejoin = path.join(REJOIN, `${id}.pdf`);
  if (fs.existsSync(rejoin)) return rejoin;
  const single = path.join(BULK, `${id}.pdf`);
  if (fs.existsSync(single)) return single;
  throw new Error("missing " + id);
}

async function compileOne(id) {
  const pdf = pdfFor(id);
  const s = new Session();
  await s.loadPlan(pdf);
  const g = await s.graphForPipeline();
  const hvac = compileHvacTakeoff(s, g);
  const bas = compileBasTakeoff(s, g);
  const valve = compileControlValveTakeoff(s, g);
  const cats = Object.entries(hvac.categories || {})
    .filter(([, v]) => v?.count > 0)
    .map(([k, v]) => `${k}:${v.count}`)
    .join("|");
  console.log(
    JSON.stringify(
      {
        id,
        sheets: g.sheets?.length,
        tables: g.tables?.length,
        hvac: hvac.totals?.items ?? 0,
        bas: bas.totals?.items ?? 0,
        valve: valve.totals?.items ?? 0,
        cats,
        titles: (g.tables || []).map((t) => ({
          kind: t.kind,
          title: t.title?.text || "",
          n: t.rows?.length || 0,
          keys: (t.rows || []).slice(0, 6).map((r) => r.key),
        })),
        notes: (g.notes || [])
          .filter(Boolean)
          .slice(0, 16)
          .map((n) => (typeof n === "string" ? n : JSON.stringify(n)).slice(0, 200)),
      },
      null,
      2,
    ),
  );
}

async function dumpTitleNeighborhood(id, needles) {
  const pdf = pdfFor(id);
  console.log("\n=== NEIGHBOR", id);
  const s = new Session();
  await s.loadPlan(pdf);
  const g = await s.graphForPipeline();
  let dumpCount = 0;
  for (const sheet of g.sheets || []) {
    const spans = sheet.spans || [];
    for (const n of needles) {
      const hits = spans.filter((sp) =>
        String(sp.text || "").toUpperCase().includes(n),
      );
      for (const h of hits.slice(0, 1)) {
        if (dumpCount >= 10) break;
        dumpCount++;
        const y1 = h.bbox[3];
        const below = spans
          .filter((sp) => {
            const cy = (sp.bbox[1] + sp.bbox[3]) / 2;
            return cy > y1 - 2 && cy < y1 + 240;
          })
          .sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0])
          .slice(0, 50)
          .map((sp) => String(sp.text || "").slice(0, 48));
        console.log(
          `  sheet=${sheet.id} role=${sheet.role} hit="${String(h.text).slice(0, 90)}" imageArea=${sheet.imageArea ?? "?"} nSpans=${spans.length}`,
        );
        console.log("   below:", below.join(" | "));
      }
    }
  }
  console.log("  tables=", g.tables?.length);
}

const targets = process.argv.slice(2);
const ids = targets.length
  ? targets
  : [
      "26_CA_TransbayTower_Mechanical_64Sheets",
      "07_MO_MSHP_TroopB_HVAC_Boilers_Controls",
      "19_CA_VistaUSD_DataCenter",
      "29_TX_JPS_Hospital_CentralPlant_Chiller",
      "04_NV_VA_LasVegas_CentralUtilityPlant",
    ];

for (const id of ids) {
  try {
    await compileOne(id);
  } catch (e) {
    console.error("FAIL", id, e.stack || e.message);
  }
}

if (!targets.length) {
  await dumpTitleNeighborhood("19_CA_VistaUSD_DataCenter", [
    "MECHANICAL EQUIPMENT SCHEDULE",
  ]);
  await dumpTitleNeighborhood("07_MO_MSHP_TroopB_HVAC_Boilers_Controls", [
    "EQUIPMENT SCHEDULE",
    "BOILER SCHEDULE",
    "PUMP SCHEDULE",
    "RTU SCHEDULE",
  ]);
  await dumpTitleNeighborhood("29_TX_JPS_Hospital_CentralPlant_Chiller", [
    "MECHANICAL SCHEDULES",
    "CHILLER SCHEDULE",
    "PUMP SCHEDULE",
  ]);
  await dumpTitleNeighborhood("04_NV_VA_LasVegas_CentralUtilityPlant", [
    "MECHANICAL SCHEDULES",
    "EQUIPMENT SCHEDULE",
    "CHILLER SCHEDULE",
    "BOILER SCHEDULE",
  ]);
}
