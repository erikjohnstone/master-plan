/**
 * Build / refresh takeoff truth inventories from the production Session graph.
 * Hand-count reconciliation still required before VALIDATING — this extracts
 * candidate items + cites for the harness author to verify against drawings.
 *
 * Usage: node --import tsx scripts/build-takeoff-truth-inventory.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const corpus = resolve(root, "opentakeoff-corpus");
const pdf = resolve(corpus, "raw/navfac-cherry-point-atc-mechanical.pdf");
const outDir = resolve(corpus, "takeoffs/_inventory");
mkdirSync(outDir, { recursive: true });

const session = new Session();
await session.loadPlan(pdf);
const graph = await session.graphForPipeline();
const sheets = session.sheetList();

function cellText(row, headerRe) {
  for (const [header, cell] of Object.entries(row.cells || {})) {
    if (headerRe.test(header)) return String(cell?.text || "").trim();
  }
  return "";
}

function cellBbox(row, headerRe) {
  for (const [header, cell] of Object.entries(row.cells || {})) {
    if (headerRe.test(header) && Array.isArray(cell?.bbox)) return cell.bbox;
  }
  return null;
}

function uniqueFamily({ titleRe, exclude, keyRe, identityHeaderRe }) {
  const keys = new Set();
  const items = [];
  for (const table of graph.tables) {
    const title = String(table.title?.text || "");
    if (!titleRe.test(title)) continue;
    if (exclude && exclude.test(title)) continue;
    for (const row of table.rows || []) {
      let tag = String(row.key || "").trim();
      if (identityHeaderRe) {
        const ident = cellText(row, identityHeaderRe);
        if (ident) tag = ident;
      }
      const canon = tag.toUpperCase().replace(/\s+/g, "");
      if (!canon) continue;
      if (keyRe && !keyRe.test(canon)) continue;
      if (keys.has(canon)) continue;
      keys.add(canon);
      const bbox = identityHeaderRe
        ? (cellBbox(row, identityHeaderRe) || cellBbox(row, /^MARK$/i) || row.identity?.bbox)
        : (cellBbox(row, /^MARK$/i) || row.identity?.bbox || cellBbox(row, /./));
      items.push({
        tag,
        sheet_id: table.sheet,
        table_title: title.replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim(),
        bbox_px: bbox || null,
      });
    }
  }
  const building = { A: 0, M: 0, T: 0, other: 0 };
  for (const k of keys) {
    const m = k.match(/-([AMT])(?=[A-Z0-9]|$)/i);
    if (m) building[m[1]] += 1;
    else building.other += 1;
  }
  return {
    count: keys.size,
    building,
    items: items.sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true })),
  };
}

const hvac = {
  AHU: uniqueFamily({ titleRe: /AIR HANDLING UNIT/i, exclude: /DEDICATED/i, keyRe: /^AHU/i }),
  DOAH_UNIT: uniqueFamily({ titleRe: /DEDICATED OUTDOOR AIR UNIT/i, exclude: /HANDLING/i, keyRe: /^DOAH/i }),
  DOAH_HANDLING: uniqueFamily({ titleRe: /DEDICATED OUTDOOR AIR HANDLING/i, keyRe: /^DOAH/i }),
  FCU: uniqueFamily({ titleRe: /FAN\s*COIL\s*UNIT\s*SCHEDULE/i, keyRe: /^FCU/i }),
  VAV: uniqueFamily({ titleRe: /VARIABLE AIR VOLUME|VOLUME CONTROL BOX/i, keyRe: /^VAV/i }),
  AIR_COOLED_CHILLER: uniqueFamily({ titleRe: /AIR COOLED CHILLER/i, exclude: /HEAT RECOVERY/i, keyRe: /^CH/i }),
  HEAT_RECOVERY_CHILLER: uniqueFamily({ titleRe: /HEAT RECOVERY CHILLER/i, keyRe: /^CH/i }),
  BOILER: uniqueFamily({ titleRe: /BOILER SCHEDULE/i, keyRe: /^B[\-]/i }),
  PUMP: uniqueFamily({ titleRe: /PUMP SCHEDULE/i, keyRe: /P(?:CHWP|HHWP|HHW|SCHWP|SHHWP|HRHWP)|HHWP|PCHWP|PHHWP|SCHWP|SHHWP|HRHWP/i }),
  FAN: uniqueFamily({ titleRe: /^FAN SCHEDULE$/i }),
  CABINET_UNIT_HEATER: uniqueFamily({ titleRe: /CABINET UNIT HEATER/i }),
  UNIT_HEATER: uniqueFamily({ titleRe: /^UNIT HEATER SCHEDULE$/i }),
  CRAH: uniqueFamily({ titleRe: /COMPUTER ROOM AIR HANDLER/i }),
  DEHUMIDIFIER: uniqueFamily({ titleRe: /DEHUMIDIFIER SCHEDULE/i, keyRe: /^DH[\-]/i }),
  HUMIDIFIER: uniqueFamily({ titleRe: /HUMIDIFIER SCHEDULE/i, keyRe: /^H[\-]/i }),
  AIR_SEPARATOR: uniqueFamily({ titleRe: /AIR SEPARATOR SCHEDULE/i }),
  EXPANSION_TANK: uniqueFamily({ titleRe: /EXPANSION TANK SCHEDULE/i }),
  CHW_CONTROL_VALVE: uniqueFamily({
    titleRe: /CHW CONTROL VALVE SCHEDULE/i,
    identityHeaderRe: /VALVE\s*MARK/i,
  }),
  HHW_CONTROL_VALVE: uniqueFamily({
    titleRe: /HHW CONTROL VALVE SCHEDULE/i,
    identityHeaderRe: /VALVE\s*MARK/i,
  }),
  GRD: uniqueFamily({ titleRe: /GRILLE,\s*REGISTER,\s*AND\s*DIFFUSER/i }),
  RANGE_HOOD: uniqueFamily({ titleRe: /RANGE HOOD SCHEDULE/i }),
  DUCT_SILENCER: uniqueFamily({ titleRe: /DUCT SILENCER SCHEDULE/i }),
};

const pointsLists = [];
for (const table of graph.tables) {
  const title = String(table.title?.text || "");
  if (!/POINTS LIST|DDC POINTS/i.test(title)) continue;
  const counts = { AI: 0, AO: 0, BI: 0, BO: 0, other: 0 };
  const items = [];
  for (const row of table.rows || []) {
    const tag = String(row.key || "").trim();
    const m = tag.toUpperCase().match(/^(AI|AO|BI|BO)\d/);
    if (m) counts[m[1]] += 1;
    else counts.other += 1;
    items.push({
      tag,
      sheet_id: table.sheet,
      table_title: title,
      bbox_px: cellBbox(row, /^MARK/i) || row.identity?.bbox || null,
      description: cellText(row, /DESCRIPTION/i),
    });
  }
  pointsLists.push({
    title,
    sheet_id: table.sheet,
    rows: (table.rows || []).length,
    counts,
    items,
  });
}

const pageMap = sheets.map((sheet) => {
  const tables = graph.tables.filter((t) => t.sheet === sheet.key);
  const hvacTitles = tables
    .map((t) => String(t.title?.text || ""))
    .filter((t) => t && !/GENERAL NOTES|POINTS LIST|DDC POINTS|VIBRATION|SOUND POWER|PIPING CONSTRUCTION/i.test(t));
  const basTitles = tables
    .map((t) => String(t.title?.text || ""))
    .filter((t) => /POINTS LIST|DDC POINTS/i.test(t));
  return {
    sheet_id: sheet.key,
    sheet_number: sheet.number || null,
    title: sheet.title || null,
    hvac_schedule_titles: hvacTitles,
    bas_list_titles: basTitles,
    hvac_empty: hvacTitles.length === 0,
    bas_empty: basTitles.length === 0,
  };
});

const summary = Object.fromEntries(Object.entries(hvac).map(([k, v]) => [k, {
  count: v.count,
  building: v.building,
  sample: v.items.slice(0, 5).map((i) => i.tag),
}]));

writeFileSync(resolve(outDir, "hvac-families.json"), `${JSON.stringify(hvac, null, 2)}\n`);
writeFileSync(resolve(outDir, "hvac-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(resolve(outDir, "bas-lists.json"), `${JSON.stringify(pointsLists, null, 2)}\n`);
writeFileSync(resolve(outDir, "page-map.json"), `${JSON.stringify({ sheet_count: sheets.length, pages: pageMap }, null, 2)}\n`);
console.log(JSON.stringify({ sheet_count: sheets.length, hvac: summary, bas_lists: pointsLists.map((l) => ({
  title: l.title, sheet: l.sheet_id, rows: l.rows, counts: l.counts,
})), hvac_empty_pages: pageMap.filter((p) => p.hvac_empty).length, bas_empty_pages: pageMap.filter((p) => p.bas_empty).length }, null, 2));
