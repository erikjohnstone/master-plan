#!/usr/bin/env node
/**
 * Scans the entire corpus (both volumes, same doc list as
 * web/scripts/playwright-corpus-table-audit.mjs) for real raster-embedded
 * schedule signals via Session.sheetGraph()'s own rasterScheduleNotes —
 * the SAME production diagnostic the agent/UI already surface, not a
 * reimplementation. Deliberately does NOT use production-graph-cli.mjs's
 * --mode graph (that calls session.graphForPipeline(), which bypasses
 * rasterScheduleNotes entirely — a real, previously-learned trap this
 * session's own notes already document).
 */
import { readdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { Session } from "../src/session.ts";

const CORPUS = "/home/user/master-plan/opentakeoff-corpus";
const VOL1_DIR = `${CORPUS}/bulk/HVAC_BAS_Plan_Sets`;
const VOL2_DIR = `${CORPUS}/bulk/HVAC_BAS_Plan_Sets_Vol2`;

const globVolume = (dir, vol) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"))
    .map((e) => ({ id: e.name.replace(/\.pdf$/i, ""), pdf: resolve(dir, e.name), vol }));

const EXTRA_DOCS = [
  { id: "weld-county-permit", pdf: `${CORPUS}/raw/weld-county-mechanical-permit.pdf`, vol: "extra" },
  { id: "itd-d1-lab", pdf: `${CORPUS}/raw/itd-d1-lab-mechanical.pdf`, vol: "extra" },
  { id: "federal-mech", pdf: `${CORPUS}/raw/federal-attachment4-mechanical.pdf`, vol: "extra" },
  { id: "baker-county-eoc", pdf: `${CORPUS}/raw/baker-county-eoc-bidset.pdf`, vol: "extra" },
  { id: "bessemer", pdf: `/home/user/master-plan/opentakeoff/samples/bessemer-mechanical-bidset.pdf`, vol: "extra" },
  { id: "navfac-cherry-point-atc", pdf: `${CORPUS}/raw/navfac-cherry-point-atc-mechanical.pdf`, vol: "extra" },
];

const DOCS = [...globVolume(VOL1_DIR, "vol1"), ...globVolume(VOL2_DIR, "vol2"), ...EXTRA_DOCS]
  .filter((d) => existsSync(d.pdf));

console.log(`${DOCS.length} documents to scan\n`);

const hits = [];
let i = 0;
for (const doc of DOCS) {
  i++;
  const t0 = Date.now();
  try {
    const session = new Session();
    await session.loadPlan(doc.pdf);
    const g = await session.sheetGraph();
    const rasterNotes = (g.notes || []).filter(
      (n) => /embedded raster image content|single embedded picture covering/.test(n),
    );
    const ms = Date.now() - t0;
    if (rasterNotes.length) {
      hits.push({ id: doc.id, vol: doc.vol, notes: rasterNotes });
      console.log(`[${i}/${DOCS.length}] ${doc.id} (${doc.vol}) — ${rasterNotes.length} raster-schedule note(s), ${ms}ms`);
      for (const n of rasterNotes) console.log(`    ${n}`);
    } else {
      console.log(`[${i}/${DOCS.length}] ${doc.id} (${doc.vol}) — clean, ${ms}ms`);
    }
  } catch (e) {
    console.log(`[${i}/${DOCS.length}] ${doc.id} (${doc.vol}) — ERROR: ${e.message}`);
  }
}

console.log(`\n=== SUMMARY: ${hits.length}/${DOCS.length} documents with likely raster-embedded schedule content ===`);
for (const h of hits) console.log(`  ${h.id} (${h.vol}): ${h.notes.length} note(s)`);
process.exit(0);
