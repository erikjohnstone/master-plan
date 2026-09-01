/**
 * Dump schedule-title neighborhoods for extract-blocked zeros.
 * Usage: node --import tsx scripts/probe-title-neighborhood.mjs [id...]
 */
import path from "node:path";
import fs from "node:fs";
import { Session } from "../src/session.ts";

const BULK = "/workspace/opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets";
const REJOIN = path.join(BULK, "_rejoined");

function pdfFor(id) {
  const rejoin = path.join(REJOIN, `${id}.pdf`);
  if (fs.existsSync(rejoin)) return rejoin;
  const single = path.join(BULK, `${id}.pdf`);
  if (fs.existsSync(single)) return single;
  throw new Error("missing " + id);
}

const DEFAULTS = {
  "07_MO_MSHP_TroopB_HVAC_Boilers_Controls": [
    "SCHEDULE",
    "BOILER",
    "PUMP",
    "RTU",
  ],
  "19_CA_VistaUSD_DataCenter": ["MECHANICAL EQUIPMENT SCHEDULE", "SCHEDULE"],
  "29_TX_JPS_Hospital_CentralPlant_Chiller": [
    "MECHANICAL SCHEDULE",
    "CHILLER",
    "PUMP SCHEDULE",
  ],
  "04_NV_VA_LasVegas_CentralUtilityPlant": [
    "MECHANICAL SCHEDULE",
    "EQUIPMENT SCHEDULE",
    "CHILLER SCHEDULE",
    "BOILER SCHEDULE",
  ],
  "26_CA_TransbayTower_Mechanical_64Sheets": ["RAH", "WFU", "SOUND TRAP", "CAV"],
};

async function dump(id, needles) {
  const pdf = pdfFor(id);
  console.log("\n========", id, path.basename(pdf));
  const s = new Session();
  await s.loadPlan(pdf);
  const g = await s.graphForPipeline();
  console.log(
    `sheets=${g.sheets?.length} tables=${g.tables?.length} notes=${(g.notes || []).length}`,
  );
  // Per-sheet summary: role, span count, imageArea, schedule-ish hits
  for (const sheet of g.sheets || []) {
    const spans = sheet.spans || [];
    const schedHits = spans.filter((sp) =>
      /\bSCHEDULE\b/i.test(String(sp.text || "")),
    );
    if (!schedHits.length && !(sheet.imageArea > 0.15)) continue;
    if (schedHits.length || sheet.role === "schedule") {
      console.log(
        `  SHEET ${sheet.id} role=${sheet.role} spans=${spans.length} imageArea=${Number(sheet.imageArea || 0).toFixed(3)} schedHits=${schedHits.length} → ${schedHits
          .slice(0, 4)
          .map((h) => `"${String(h.text).slice(0, 60)}"`)
          .join(" ; ")}`,
      );
    }
  }

  let dumps = 0;
  for (const sheet of g.sheets || []) {
    const spans = sheet.spans || [];
    for (const n of needles) {
      const hits = spans.filter((sp) =>
        String(sp.text || "").toUpperCase().includes(n.toUpperCase()),
      );
      for (const h of hits) {
        // Prefer title-like hits
        const t = String(h.text || "");
        if (!/SCHEDULE|BOILER|CHILLER|PUMP|RTU|RAH|WFU|CAV|SOUND/i.test(t)) continue;
        if (dumps >= 14) break;
        dumps++;
        const y1 = h.bbox[3];
        const x0 = h.bbox[0] - 20;
        const x1 = h.bbox[2] + 400;
        const below = spans
          .filter((sp) => {
            const cy = (sp.bbox[1] + sp.bbox[3]) / 2;
            const cx = (sp.bbox[0] + sp.bbox[2]) / 2;
            return cy > y1 - 4 && cy < y1 + 280 && cx >= x0 && cx <= x1 + 200;
          })
          .sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0])
          .slice(0, 55)
          .map((sp) => String(sp.text || "").slice(0, 40));
        console.log(
          `  HIT sheet=${sheet.id} role=${sheet.role} "${t.slice(0, 100)}" y=${h.bbox[1].toFixed(0)} img=${Number(sheet.imageArea || 0).toFixed(3)}`,
        );
        console.log("    below:", below.join(" | ") || "(no spans below in band)");
      }
    }
  }
  if (!dumps) console.log("  (no neighborhood dumps)");
}

const ids = process.argv.slice(2);
const list = ids.length ? ids : Object.keys(DEFAULTS);
for (const id of list) {
  await dump(id, DEFAULTS[id] || ["SCHEDULE"]);
}
