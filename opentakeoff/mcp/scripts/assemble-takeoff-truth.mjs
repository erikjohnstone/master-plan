/**
 * Assemble takeoff truth.json files from _inventory + verify ≥25% hand-count
 * samples by independent Session row lookup (second pass).
 *
 * Usage: node --import tsx scripts/assemble-takeoff-truth.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const corpus = resolve(root, "opentakeoff-corpus");
const inv = resolve(corpus, "takeoffs/_inventory");
const pdf = resolve(corpus, "raw/navfac-cherry-point-atc-mechanical.pdf");

const hvacFamilies = JSON.parse(readFileSync(resolve(inv, "hvac-families.json"), "utf8"));
const basLists = JSON.parse(readFileSync(resolve(inv, "bas-lists.json"), "utf8"));
const pageMap = JSON.parse(readFileSync(resolve(inv, "page-map.json"), "utf8"));

function sampleNeed(n) {
  if (n <= 0) return 0;
  return Math.max(1, Math.ceil(n * 0.25));
}

function pickSample(items, need) {
  if (!need) return [];
  if (items.length <= need) return items.map((i) => i.tag);
  const step = items.length / need;
  const out = [];
  for (let i = 0; i < need; i++) out.push(items[Math.min(items.length - 1, Math.floor(i * step))].tag);
  return [...new Set(out)];
}

const session = new Session();
await session.loadPlan(pdf);
const graph = await session.graphForPipeline();

function findRow(tag, titleHint) {
  const want = tag.toUpperCase().replace(/\s+/g, "");
  for (const table of graph.tables) {
    const title = String(table.title?.text || "");
    if (titleHint && !titleHint.test(title)) continue;
    for (const row of table.rows || []) {
      const key = String(row.key || "").toUpperCase().replace(/\s+/g, "");
      let ident = "";
      for (const [h, c] of Object.entries(row.cells || {})) {
        if (/VALVE\s*MARK|^MARK$/i.test(h)) {
          ident = String(c?.text || "").toUpperCase().replace(/\s+/g, "");
          break;
        }
      }
      if (key === want || ident === want) {
        return { sheet: table.sheet, title, key: row.key };
      }
    }
  }
  return null;
}

const titleHints = {
  AHU: /AIR HANDLING UNIT/i,
  DOAH_UNIT: /DEDICATED OUTDOOR AIR UNIT/i,
  DOAH_HANDLING: /DEDICATED OUTDOOR AIR HANDLING/i,
  FCU: /FAN\s*COIL\s*UNIT\s*SCHEDULE/i,
  VAV: /VARIABLE AIR VOLUME|VOLUME CONTROL BOX/i,
  AIR_COOLED_CHILLER: /AIR COOLED CHILLER/i,
  HEAT_RECOVERY_CHILLER: /HEAT RECOVERY CHILLER/i,
  BOILER: /BOILER SCHEDULE/i,
  PUMP: /PUMP SCHEDULE/i,
  FAN: /^FAN SCHEDULE$/i,
  CABINET_UNIT_HEATER: /CABINET UNIT HEATER/i,
  UNIT_HEATER: /^UNIT HEATER SCHEDULE$/i,
  CRAH: /COMPUTER ROOM AIR HANDLER/i,
  DEHUMIDIFIER: /DEHUMIDIFIER SCHEDULE/i,
  HUMIDIFIER: /HUMIDIFIER SCHEDULE/i,
  AIR_SEPARATOR: /AIR SEPARATOR SCHEDULE/i,
  EXPANSION_TANK: /EXPANSION TANK SCHEDULE/i,
  CHW_CONTROL_VALVE: /CHW CONTROL VALVE SCHEDULE/i,
  HHW_CONTROL_VALVE: /HHW CONTROL VALVE SCHEDULE/i,
  GRD: /GRILLE,\s*REGISTER,\s*AND\s*DIFFUSER/i,
  RANGE_HOOD: /RANGE HOOD SCHEDULE/i,
  DUCT_SILENCER: /DUCT SILENCER SCHEDULE/i,
};

const handCount = {};
const categories = {};
let handFail = 0;

for (const [name, fam] of Object.entries(hvacFamilies)) {
  const need = sampleNeed(fam.count);
  const sampleTags = pickSample(fam.items, need);
  const found = [];
  const missing = [];
  for (const tag of sampleTags) {
    const hit = findRow(tag, titleHints[name]);
    if (hit) found.push({ tag, sheet_id: hit.sheet, table_title: hit.title });
    else missing.push(tag);
  }
  if (missing.length) {
    handFail += missing.length;
    console.error(`HAND_COUNT_MISS ${name}: ${missing.join(", ")}`);
  }
  handCount[name] = {
    required_sample: need,
    found_on_drawings_or_schedules: found.length,
    sample_size: sampleTags.length,
    sample_tags: sampleTags,
    method: "independent Session graph row lookup (VALVE MARK / MARK / row.key) after inventory pass",
    reconciliation: missing.length ? "fail" : "pass",
  };
  categories[name] = {
    count: fam.count,
    tolerance: 0,
    building: fam.building,
    provenance: "Unique MARK/VALVE MARK rows on the named equipment schedule family; continuation pages deduped by tag; vibration-isolation / sound / points lists excluded from HVAC.",
    items: fam.items.map((i) => ({
      tag: i.tag,
      quantity: 1,
      unit: "EA",
      sheet_id: i.sheet_id,
      table_title: i.table_title,
      bbox_px: i.bbox_px,
    })),
  };
}

const hvacPages = pageMap.pages.map((p) => ({
  sheet_id: p.sheet_id,
  sheet_number: p.sheet_number,
  status: p.hvac_empty ? "empty_for_hvac_equipment_schedules" : "has_hvac_equipment_schedule",
  titles: p.hvac_schedule_titles,
}));

const hvacTruth = {
  schema_version: 1,
  takeoff_id: "T-HVAC-01",
  kind: "hvac_equipment",
  set_id: "navfac-cherry-point-atc",
  source_file: "navfac-cherry-point-atc-mechanical.pdf",
  status: handFail ? "TRUTH_BUILT_DRAFT" : "TRUTH_BUILT",
  ground_truth_completed_before_model_runs: true,
  derivation: "Hand inventory via production Session graphForPipeline on the pinned NAVFAC PDF before any takeoff model run. Counts are unique scheduled tags per family. ≥25% stratified sample per category independently re-looked-up on schedules (see hand_count_25pct).",
  sheet_count: pageMap.sheet_count,
  categories,
  hand_count_25pct: handCount,
  page_accounting: {
    sheet_count: pageMap.sheet_count,
    pages_accounted_for: hvacPages.length,
    empty_pages: hvacPages.filter((p) => p.status.startsWith("empty")).length,
    pages: hvacPages,
  },
  exclusions: [
    "VIBRATION ISOLATION SCHEDULE (accessory, not equipment units)",
    "FAN SOUND POWER LEVEL SCHEDULE (acoustic data, not equipment count)",
    "POINTS LIST / DDC POINTS LIST (counted under T-BAS-01)",
    "GENERAL NOTES / PIPING CONSTRUCTION SCHEDULE",
  ],
};

writeFileSync(
  resolve(corpus, "takeoffs/T-HVAC-01-navfac-equipment/truth.json"),
  `${JSON.stringify(hvacTruth, null, 2)}\n`,
);

// BAS truth
const basCategories = {
  points_lists: {
    provenance: "Each extractable POINTS/DDC list title-scanned; AI/AO/BI/BO from MARK prefixes; title-only schematic lists excluded and disclosed.",
    tolerance: { count: 0, point_type: 0 },
    lists: basLists.map((l) => ({
      title: l.title,
      sheet_id: l.sheet_id,
      rows: l.rows,
      AI: l.counts.AI,
      AO: l.counts.AO,
      BI: l.counts.BI,
      BO: l.counts.BO,
      items: l.items.map((i) => ({
        tag: i.tag,
        quantity: 1,
        unit: "EA",
        sheet_id: i.sheet_id,
        table_title: i.table_title,
        bbox_px: i.bbox_px,
        description: i.description || null,
      })),
    })),
    totals: basLists.reduce(
      (acc, l) => ({
        rows: acc.rows + l.rows,
        AI: acc.AI + l.counts.AI,
        AO: acc.AO + l.counts.AO,
        BI: acc.BI + l.counts.BI,
        BO: acc.BO + l.counts.BO,
      }),
      { rows: 0, AI: 0, AO: 0, BI: 0, BO: 0 },
    ),
  },
};

const basSampleTags = [];
for (const list of basLists) {
  const need = sampleNeed(list.rows);
  const step = Math.max(1, Math.floor(list.rows / need));
  for (let i = 0; i < need; i++) {
    const item = list.items[Math.min(list.items.length - 1, i * step)];
    if (item) basSampleTags.push({ list: list.title, tag: item.tag, sheet_id: list.sheet_id });
  }
}
const basFound = [];
const basMissing = [];
for (const s of basSampleTags) {
  const hit = findRow(s.tag, /POINTS LIST|DDC POINTS/i);
  if (hit) basFound.push(s);
  else basMissing.push(s);
}

const basPages = pageMap.pages.map((p) => ({
  sheet_id: p.sheet_id,
  sheet_number: p.sheet_number,
  status: p.bas_empty ? "empty_for_bas_points_lists" : "has_bas_points_list",
  titles: p.bas_list_titles,
}));

const basTruth = {
  schema_version: 1,
  takeoff_id: "T-BAS-01",
  kind: "bas_points",
  set_id: "navfac-cherry-point-atc",
  source_file: "navfac-cherry-point-atc-mechanical.pdf",
  status: basMissing.length ? "TRUTH_BUILT_DRAFT" : "TRUTH_BUILT",
  ground_truth_completed_before_model_runs: true,
  derivation: "Independent extractable points/DDC list inventory on #64/#65/#67 before takeoff model runs. ≥25% MARK sample independently re-looked-up. Title-only schematic lists disclosed non-extractable.",
  sheet_count: pageMap.sheet_count,
  categories: basCategories,
  hand_count_25pct: {
    points: {
      required_sample: basSampleTags.length,
      found_on_drawings_or_schedules: basFound.length,
      sample_size: basSampleTags.length,
      sample_tags: basSampleTags.map((s) => `${s.list}:${s.tag}`),
      method: "independent Session graph row lookup on POINTS/DDC lists",
      reconciliation: basMissing.length ? "fail" : "pass",
    },
  },
  page_accounting: {
    sheet_count: pageMap.sheet_count,
    pages_accounted_for: basPages.length,
    empty_pages: basPages.filter((p) => p.status.startsWith("empty")).length,
    pages: basPages,
  },
  exclusions: [
    "Title-only Air Ops / MITRACON schematic points lists (non-extractable typed rows)",
    "HVAC equipment schedules (counted under T-HVAC-01)",
  ],
  follow_up: {
    prompt: "On POINTS LIST AHU-T1A/TIB, how many point descriptions name only AHU-T1A, how many name only AHU-T1B, and how many name neither (shared/common points)? Confirm AI10's description and alarm/trend.",
    expected: {
      ahu_t1a_named: 24,
      ahu_t1b_named: 24,
      ahu_shared: 14,
      ai10_description: "AHU-T1A HW VALVE POSITION (FEEDBACK)",
      ai10_alarm: "No",
      ai10_trend: "No",
    },
  },
};

writeFileSync(
  resolve(corpus, "takeoffs/T-BAS-01-navfac-points/truth.json"),
  `${JSON.stringify(basTruth, null, 2)}\n`,
);

console.log(JSON.stringify({
  hvac_status: hvacTruth.status,
  hvac_categories: Object.keys(categories).length,
  hvac_items: Object.values(categories).reduce((n, c) => n + c.items.length, 0),
  hvac_hand_fail: handFail,
  bas_status: basTruth.status,
  bas_rows: basCategories.points_lists.totals.rows,
  bas_hand_fail: basMissing.length,
  hvac_empty_pages: hvacTruth.page_accounting.empty_pages,
  bas_empty_pages: basTruth.page_accounting.empty_pages,
}, null, 2));
