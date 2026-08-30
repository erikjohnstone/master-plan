/**
 * Deterministic schedule / points-list quantity takeoff compiler for corpus
 * takeoffs (T-HVAC-01, T-BAS-01). Counts unique scheduled MARKs / VALVE MARKs
 * and extractable POINTS/DDC rows — not installed drawing instances.
 *
 * Versioned: changing family rules after VALIDATING starts requires a truth
 * CHANGELOG + reset to 0/5.
 */
export const CORPUS_TAKEOFF_VERSION = 1;

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

function uniqueFamily(graph, { titleRe, exclude, keyRe, identityHeaderRe }) {
  const keys = new Set();
  const items = [];
  for (const table of graph.tables || []) {
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
        quantity: 1,
        unit: "EA",
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

/** Family extractors — keep in lockstep with build-takeoff-truth-inventory.mjs */
export const HVAC_FAMILY_SPECS = {
  AHU: { titleRe: /AIR HANDLING UNIT/i, exclude: /DEDICATED/i, keyRe: /^AHU/i },
  DOAH_UNIT: { titleRe: /DEDICATED OUTDOOR AIR UNIT/i, exclude: /HANDLING/i, keyRe: /^DOAH/i },
  DOAH_HANDLING: { titleRe: /DEDICATED OUTDOOR AIR HANDLING/i, keyRe: /^DOAH/i },
  FCU: { titleRe: /FAN\s*COIL\s*UNIT\s*SCHEDULE/i, keyRe: /^FCU/i },
  VAV: { titleRe: /VARIABLE AIR VOLUME|VOLUME CONTROL BOX/i, keyRe: /^VAV/i },
  AIR_COOLED_CHILLER: { titleRe: /AIR COOLED CHILLER/i, exclude: /HEAT RECOVERY/i, keyRe: /^CH/i },
  HEAT_RECOVERY_CHILLER: { titleRe: /HEAT RECOVERY CHILLER/i, keyRe: /^CH/i },
  BOILER: { titleRe: /BOILER SCHEDULE/i, keyRe: /^B[\-]/i },
  PUMP: { titleRe: /PUMP SCHEDULE/i, keyRe: /P(?:CHWP|HHWP|HHW|SCHWP|SHHWP|HRHWP)|HHWP|PCHWP|PHHWP|SCHWP|SHHWP|HRHWP/i },
  FAN: { titleRe: /^FAN SCHEDULE$/i },
  CABINET_UNIT_HEATER: { titleRe: /CABINET UNIT HEATER/i },
  UNIT_HEATER: { titleRe: /^UNIT HEATER SCHEDULE$/i },
  CRAH: { titleRe: /COMPUTER ROOM AIR HANDLER/i },
  DEHUMIDIFIER: { titleRe: /DEHUMIDIFIER SCHEDULE/i, keyRe: /^DH[\-]/i },
  HUMIDIFIER: { titleRe: /HUMIDIFIER SCHEDULE/i, keyRe: /^H[\-]/i },
  AIR_SEPARATOR: { titleRe: /AIR SEPARATOR SCHEDULE/i },
  EXPANSION_TANK: { titleRe: /EXPANSION TANK SCHEDULE/i },
  CHW_CONTROL_VALVE: { titleRe: /CHW CONTROL VALVE SCHEDULE/i, identityHeaderRe: /VALVE\s*MARK/i },
  HHW_CONTROL_VALVE: { titleRe: /HHW CONTROL VALVE SCHEDULE/i, identityHeaderRe: /VALVE\s*MARK/i },
  GRD: { titleRe: /GRILLE,\s*REGISTER,\s*AND\s*DIFFUSER/i },
  RANGE_HOOD: { titleRe: /RANGE HOOD SCHEDULE/i },
  DUCT_SILENCER: { titleRe: /DUCT SILENCER SCHEDULE/i },
};

export const HVAC_EXCLUSIONS = [
  "VIBRATION ISOLATION SCHEDULE (accessory, not equipment units)",
  "FAN SOUND POWER LEVEL SCHEDULE (acoustic data, not equipment count)",
  "POINTS LIST / DDC POINTS LIST (counted under T-BAS-01)",
  "GENERAL NOTES / PIPING CONSTRUCTION SCHEDULE",
];

export const BAS_EXCLUSIONS = [
  "Title-only Air Ops / MITRACON schematic points lists (non-extractable typed rows)",
  "HVAC equipment schedules (counted under T-HVAC-01)",
];

function sheetRecords(sessionOrSheets, graph) {
  if (Array.isArray(sessionOrSheets)) return sessionOrSheets;
  if (sessionOrSheets?.sheetList) return sessionOrSheets.sheetList();
  // Web/UI path: derive page list from the sheet graph when no Session is present.
  return (graph.sheets || []).map((s) => ({
    key: s.key || s.sheet || s.id,
    number: s.number ?? s.sheetNumber ?? null,
    sheetNumber: s.sheetNumber ?? s.number ?? null,
    title: s.title || null,
  }));
}

export function compileHvacTakeoff(sessionOrSheets, graph) {
  const sheets = sheetRecords(sessionOrSheets, graph);
  const categories = {};
  for (const [name, spec] of Object.entries(HVAC_FAMILY_SPECS)) {
    const fam = uniqueFamily(graph, spec);
    categories[name] = {
      count: fam.count,
      tolerance: 0,
      building: fam.building,
      provenance: "Unique MARK/VALVE MARK rows on the named equipment schedule family; continuation pages deduped by tag; vibration-isolation / sound / points lists excluded from HVAC.",
      items: fam.items,
    };
  }

  const pages = sheets.map((sheet) => {
    const key = sheet.key;
    const tables = (graph.tables || []).filter((t) => t.sheet === key);
    const titles = tables
      .map((t) => String(t.title?.text || ""))
      .filter((t) => t && !/GENERAL NOTES|POINTS LIST|DDC POINTS|VIBRATION|SOUND POWER|PIPING CONSTRUCTION/i.test(t));
    return {
      sheet_id: key,
      sheet_number: sheet.sheetNumber ?? sheet.number ?? null,
      status: titles.length === 0 ? "empty_for_hvac_equipment_schedules" : "has_hvac_equipment_schedule",
      titles,
    };
  });

  const itemCount = Object.values(categories).reduce((n, c) => n + c.items.length, 0);
  return {
    schema_version: CORPUS_TAKEOFF_VERSION,
    takeoff_id: "T-HVAC-01",
    kind: "hvac_equipment",
    compiler: "corpusTakeoff.compileHvacTakeoff",
    sheet_count: sheets.length,
    categories,
    totals: {
      categories: Object.keys(categories).length,
      items: itemCount,
    },
    page_accounting: {
      sheet_count: sheets.length,
      pages_accounted_for: pages.length,
      empty_pages: pages.filter((p) => p.status.startsWith("empty")).length,
      pages,
    },
    exclusions: HVAC_EXCLUSIONS,
  };
}

export function compileBasTakeoff(sessionOrSheets, graph) {
  const sheets = sheetRecords(sessionOrSheets, graph);
  const lists = [];
  for (const table of graph.tables || []) {
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
        quantity: 1,
        unit: "EA",
        sheet_id: table.sheet,
        table_title: title,
        bbox_px: cellBbox(row, /^MARK/i) || row.identity?.bbox || null,
        description: cellText(row, /DESCRIPTION/i) || null,
      });
    }
    lists.push({
      title,
      sheet_id: table.sheet,
      rows: (table.rows || []).length,
      AI: counts.AI,
      AO: counts.AO,
      BI: counts.BI,
      BO: counts.BO,
      items,
    });
  }

  const totals = lists.reduce(
    (acc, l) => ({
      rows: acc.rows + l.rows,
      AI: acc.AI + l.AI,
      AO: acc.AO + l.AO,
      BI: acc.BI + l.BI,
      BO: acc.BO + l.BO,
    }),
    { rows: 0, AI: 0, AO: 0, BI: 0, BO: 0 },
  );

  const pages = sheets.map((sheet) => {
    const key = sheet.key;
    const tables = (graph.tables || []).filter((t) => t.sheet === key);
    const titles = tables
      .map((t) => String(t.title?.text || ""))
      .filter((t) => /POINTS LIST|DDC POINTS/i.test(t));
    return {
      sheet_id: key,
      sheet_number: sheet.sheetNumber ?? sheet.number ?? null,
      status: titles.length === 0 ? "empty_for_bas_points_lists" : "has_bas_points_list",
      titles,
    };
  });

  return {
    schema_version: CORPUS_TAKEOFF_VERSION,
    takeoff_id: "T-BAS-01",
    kind: "bas_points",
    compiler: "corpusTakeoff.compileBasTakeoff",
    sheet_count: sheets.length,
    categories: {
      points_lists: {
        provenance: "Each extractable POINTS/DDC list title-scanned; AI/AO/BI/BO from MARK prefixes; title-only schematic lists excluded and disclosed.",
        tolerance: { count: 0, point_type: 0 },
        lists,
        totals,
      },
    },
    totals: {
      lists: lists.length,
      rows: totals.rows,
      AI: totals.AI,
      AO: totals.AO,
      BI: totals.BI,
      BO: totals.BO,
    },
    page_accounting: {
      sheet_count: sheets.length,
      pages_accounted_for: pages.length,
      empty_pages: pages.filter((p) => p.status.startsWith("empty")).length,
      pages,
    },
    exclusions: BAS_EXCLUSIONS,
  };
}

export function compileCorpusTakeoff(session, graph, kind) {
  if (kind === "hvac_equipment" || kind === "T-HVAC-01") return compileHvacTakeoff(session, graph);
  if (kind === "bas_points" || kind === "T-BAS-01") return compileBasTakeoff(session, graph);
  throw new Error(`Unknown takeoff kind: ${kind}`);
}

/** Build workbook sheet rows for CSV/XLSX export from a compiled takeoff. */
export function takeoffWorkbookSheets(takeoff, { interrogationLog = null } = {}) {
  const sheets = [];
  if (takeoff.kind === "hvac_equipment") {
    const rollup = [["category", "count", "unit", "building_A", "building_M", "building_T", "building_other"]];
    for (const [name, cat] of Object.entries(takeoff.categories || {})) {
      rollup.push([
        name,
        cat.count,
        "EA",
        cat.building?.A ?? 0,
        cat.building?.M ?? 0,
        cat.building?.T ?? 0,
        cat.building?.other ?? 0,
      ]);
      const rows = [["tag", "description", "qty", "unit", "sheet_id", "table_title", "bbox_px"]];
      for (const item of cat.items || []) {
        rows.push([
          item.tag,
          item.description || "",
          item.quantity,
          item.unit,
          item.sheet_id,
          item.table_title,
          Array.isArray(item.bbox_px) ? item.bbox_px.join(",") : "",
        ]);
      }
      sheets.push({ name, rows });
    }
    sheets.unshift({ name: "ROLLUP", rows: rollup });
  } else if (takeoff.kind === "bas_points") {
    const lists = takeoff.categories?.points_lists?.lists || [];
    const totals = takeoff.categories?.points_lists?.totals || {};
    const rollup = [
      ["list_title", "sheet_id", "rows", "AI", "AO", "BI", "BO"],
      ...lists.map((l) => [l.title, l.sheet_id, l.rows, l.AI, l.AO, l.BI, l.BO]),
      ["TOTAL", "", totals.rows, totals.AI, totals.AO, totals.BI, totals.BO],
    ];
    sheets.push({ name: "ROLLUP", rows: rollup });
    for (const list of lists) {
      const rows = [["tag", "description", "qty", "unit", "sheet_id", "table_title", "bbox_px"]];
      for (const item of list.items || []) {
        rows.push([
          item.tag,
          item.description || "",
          item.quantity,
          item.unit,
          item.sheet_id,
          item.table_title,
          Array.isArray(item.bbox_px) ? item.bbox_px.join(",") : "",
        ]);
      }
      const short = String(list.title).replace(/\s+/g, " ").slice(0, 28);
      sheets.push({ name: short, rows });
    }
  }
  if (interrogationLog) {
    const rows = [["turn", "role", "text"]];
    for (const turn of interrogationLog.turns || []) {
      rows.push([turn.turn ?? "", turn.role ?? "", turn.text ?? ""]);
    }
    if (interrogationLog.verdict) {
      rows.push(["", "verdict", JSON.stringify(interrogationLog.verdict)]);
    }
    sheets.push({ name: "INTERROGATION", rows });
  }
  return sheets;
}

export function rowsToCsv(rows) {
  return rows.map((row) => row.map((cell) => {
    const s = cell == null ? "" : String(cell);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }).join(",")).join("\n") + "\n";
}
