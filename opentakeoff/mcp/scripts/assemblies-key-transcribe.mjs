// ASSEMBLIES goal, WP0.3 — expand a render transcription into
// opentakeoff-corpus/keys/<set>.attrs.csv (goals/ASSEMBLIES.md, TRUTH).
//
// SHOULD THIS BE ON THE SHARED PATH? No — a key-authoring helper. It never
// imports the pipeline and never opens a PDF: its only input is text typed
// from renders (reports/assemblies/key-work/<set>.transcription.txt), and
// its only output is the key CSV.
//
// Why a helper at all: TRUTH requires EVERY covered attribute per instance,
// including the ones a table does not print (empty value, note "not
// printed" — that is what scores "invented"). Typing ~20 lines per instance
// by hand invites exactly the slips a key must not have. Transcribing the
// printed grid once and expanding it mechanically does not, and every
// value stays traceable to one typed cell.
//
//   node scripts/assemblies-key-transcribe.mjs <corpus-dir> <setId> [--check]
//
// Transcription format (one file per set; '#' lines are comments):
//
//   SET <set id>
//   SEED <split seed that drew these tables>
//   SCOPE <line>        repeatable; goes into the key's '#' header
//   EXCLUDES <line>     repeatable; what is deliberately not counted
//   TABLE
//   sheet: <file.pdf#page>
//   title: <table title as printed>
//   family: <compile family, e.g. VAV>
//   render: <how it was read, e.g. "page 57 crop 100,200,900,400 @3x">
//   rows: <which printed rows are keyed, e.g. "all 9 printed rows">
//   col: <printed header path> => <attribute>     one per grid column, in order;
//                                                  "=> -" = printed but not covered;
//                                                  "[...]" header = the author's
//                                                  judgment from the printed row
//   derive: <attribute> = <value> ; header=<printed header> ; note=<why>
//   grid:
//   <cell> | <cell> | ...                          one line per keyed instance
//   END
//
// Grid cells hold the PRINTED text. For an enum attribute the cell is
// "<canonical> (<printed text>)", or just "<canonical>" when the canonical
// value is itself what is printed. An empty cell is a printed blank. A cell
// starting with "?" is printed but is not ONE value for the attribute (a
// multi-speed "50-80-110" airflow, "SEE NOTE 3"): it keys an empty value
// with the printed text in the note, so a pipeline that picks one scores
// "invented". "col: <header> => <attr> [<unit>]" records the unit the
// header PRINTS when it differs from the attribute's usual one (a static
// pressure printed in "(FT)"); values are never converted here. The
// attribute vocabulary below is the key's own; WP1 maps every keyed
// attribute to exactly one canonical attribute.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ENUMS = {
  terminal_type: ["single_duct", "fan_powered_series", "fan_powered_parallel", "dual_duct", "exhaust", "induction", "chilled_beam"],
  heat_type: ["hw", "electric", "steam", "none"],
  cooling_type: ["chw", "dx", "none"],
  heating_type: ["hw", "steam", "gas", "electric", "heat_pump", "none"],
  heating_medium: ["hw", "steam", "electric", "gas"],
  yes_no: ["yes", "no"],
  economizer: ["airside", "none", "waterside"],
  energy_recovery: ["wheel", "plate", "heat_pipe", "runaround", "none"],
  drive: ["direct", "belt"],
  fuel: ["gas", "oil", "electric", "dual_fuel", "propane"],
  condenser: ["air", "water"],
  hx_type: ["plate", "shell_and_tube"],
  medium: ["chw", "hw", "steam", "cw", "glycol", "domestic_water", "condenser_water", "other"],
  recovery_type: ["wheel", "plate", "heat_pipe", "runaround"],
  humidifier_type: ["steam_to_steam", "electrode", "resistive", "gas_fired", "direct_injection", "evaporative", "atomizing"],
  pump_arrangement: ["duty", "standby", "duty_standby", "parallel", "lead_lag"],
};

const num = { type: "num" };
const size = { type: "size" }; // round (one number) or rectangular (WxH)
const text = { type: "text" };
const en = (e) => ({ type: "enum", values: ENUMS[e] });
const coil = (p, unitsOnly = false) => ({
  [`${p}_gpm`]: num, [`${p}_ewt_f`]: num, [`${p}_lwt_f`]: num,
  ...(unitsOnly ? {} : { [`${p}_wpd_ft`]: num, [`${p}_mbh`]: num, [`${p}_rows`]: num, [`${p}_conn_in`]: num }),
});
const LOCATION = { building: text, floor: text, area_served: text };
const ELECTRICAL = { volts: num, phase: num };
// Selectors from research 02 §3a ("schedule attributes that select
// variants") that the first vocabulary missed, added before any census
// output was read: a printed network/BAS interface ("BACNET", "LON",
// "PROVIDE BACNET CARD") and connection sizes for hook-ups (research 04).
const INTEGRATION = { bas_interface: text };

const AIR_HANDLER = {
  ...LOCATION, qty: num, supply_cfm: num, oa_cfm_min: num,
  supply_fan_hp: num, supply_fan_qty: num, return_fan_hp: num, exhaust_fan_hp: num, vfd: en("yes_no"),
  economizer: en("economizer"), outdoor_air_pct: num, cooling_type: en("cooling_type"), cooling_mbh: num, cooling_tons: num,
  dx_stages: num, ...coil("chw"),
  heating_type: en("heating_type"), heating_mbh: num, ...coil("hw"), gas_input_mbh: num, eh_kw: num,
  humidifier: en("yes_no"), energy_recovery: en("energy_recovery"), filter_merv: num, ...INTEGRATION, ...ELECTRICAL,
};
const GENERIC_HVAC = {
  ...LOCATION, qty: num, cfm: num, cooling_mbh: num, cooling_tons: num, heating_mbh: num, ...coil("hw", true),
  ...coil("chw", true), motor_hp: num, eh_kw: num, conn_in: num, ...INTEGRATION, ...ELECTRICAL,
};

/** Covered attributes per compile family — the key's scope, stated in its header. */
export const KEY_ATTRIBUTES = {
  VAV: {
    ...LOCATION, terminal_type: en("terminal_type"), inlet_size_in: size, cfm_max: num, cfm_min: num, cfm_heat: num,
    heat_type: en("heat_type"), ...coil("hw"), eh_kw: num, eh_stages: num, motor_hp: num, ecm: en("yes_no"), ...ELECTRICAL,
  },
  AHU: AIR_HANDLER, DOAS: AIR_HANDLER, DOAH_UNIT: AIR_HANDLER, DOAH_HANDLING: AIR_HANDLER, OUTDOOR_AIR_UNIT: AIR_HANDLER, RTU: AIR_HANDLER,
  FCU: {
    ...LOCATION, qty: num, pipes: num, cfm: num, motor_hp: num, fan_speeds: num, ecm: en("yes_no"),
    cooling_type: en("cooling_type"), ...coil("chw"), heating_type: en("heating_type"), ...coil("hw"), eh_kw: num, ...ELECTRICAL,
  },
  PUMP: {
    ...LOCATION, qty: num, service: text, gpm: num, head_ft: num, motor_hp: num, rpm: num, vfd: en("yes_no"),
    pump_arrangement: en("pump_arrangement"), conn_in: num, ...ELECTRICAL,
  },
  FAN: {
    ...LOCATION, qty: num, service: text, cfm: num, esp_in: num, motor_hp: num, motor_watts: num, rpm: num,
    drive: en("drive"), vfd: en("yes_no"), ecm: en("yes_no"), control: text, ...ELECTRICAL,
  },
  UNIT_HEATER: { ...LOCATION, qty: num, heating_medium: en("heating_medium"), cfm: num, heating_mbh: num, ...coil("hw", true), eh_kw: num, motor_hp: num, conn_in: num, ...ELECTRICAL },
  CABINET_UNIT_HEATER: { ...LOCATION, qty: num, heating_medium: en("heating_medium"), cfm: num, heating_mbh: num, ...coil("hw", true), eh_kw: num, motor_hp: num, conn_in: num, ...ELECTRICAL },
  BOILER: { ...LOCATION, qty: num, fuel: en("fuel"), input_mbh: num, output_mbh: num, gpm: num, ewt_f: num, lwt_f: num, eh_kw: num, conn_in: num, ...INTEGRATION, ...ELECTRICAL },
  AIR_COOLED_CHILLER: { ...LOCATION, qty: num, condenser: en("condenser"), tons: num, chw_gpm: num, chw_ewt_f: num, chw_lwt_f: num, kw_input: num, conn_in: num, ...INTEGRATION, ...ELECTRICAL },
  HEAT_RECOVERY_CHILLER: { ...LOCATION, qty: num, condenser: en("condenser"), tons: num, chw_gpm: num, chw_ewt_f: num, chw_lwt_f: num, hw_gpm: num, hw_ewt_f: num, hw_lwt_f: num, kw_input: num, conn_in: num, ...INTEGRATION, ...ELECTRICAL },
  COOLING_TOWER: { ...LOCATION, qty: num, cells: num, tons: num, gpm: num, ewt_f: num, lwt_f: num, fan_hp: num, vfd: en("yes_no"), conn_in: num, ...INTEGRATION, ...ELECTRICAL },
  HEAT_EXCHANGER: {
    ...LOCATION, qty: num, hx_type: en("hx_type"), primary_medium: en("medium"), secondary_medium: en("medium"),
    primary_gpm: num, primary_ewt_f: num, primary_lwt_f: num, secondary_gpm: num, secondary_ewt_f: num, secondary_lwt_f: num, capacity_mbh: num,
    primary_conn_in: num, secondary_conn_in: num,
  },
  ERV: { ...LOCATION, qty: num, recovery_type: en("recovery_type"), supply_cfm: num, exhaust_cfm: num, supply_fan_hp: num, exhaust_fan_hp: num, ...ELECTRICAL },
  HUMIDIFIER: { ...LOCATION, qty: num, humidifier_type: en("humidifier_type"), capacity_lb_hr: num, eh_kw: num, ...ELECTRICAL },
};
for (const f of ["HEAT_PUMP", "CONDENSING_UNIT", "VRF_INDOOR", "VRF_OUTDOOR", "FURNACE", "DUCT_MOUNTED_COIL", "FIN_TUBE_RADIATION",
  "RADIANT_CEILING_PANEL", "CRAH", "RAH", "DEHUMIDIFIER"]) KEY_ATTRIBUTES[f] = GENERIC_HVAC;

/** Printed number → canonical string, or throw. Accepts "1,250", "0.75",
 * "3/4", "1-1/4", "1 1/4" and a trailing unit word ("450 CFM"); refuses
 * anything carrying two numbers — the transcriber splits such a cell. */
export function parseNumber(printed) {
  const t = String(printed).trim().replace(/["″]/g, "").replace(/(\d),(\d{3})\b/g, "$1$2");
  let m = t.match(/^(\d+)[\s-]+(\d+)\/(\d+)(?:\s*[A-Za-z%°.]+)?$/);
  if (m) return String(Number(m[1]) + Number(m[2]) / Number(m[3]));
  m = t.match(/^(\d+)\/(\d+)(?:\s*[A-Za-z%°.]+)?$/);
  if (m) return String(Number(m[1]) / Number(m[2]));
  m = t.match(/^(-?\d+(?:\.\d+)?|-?\.\d+)(?:\s*[A-Za-z%°.#/]+)?$/);
  if (m) return String(Number(m[1]));
  throw new Error(`not a single printed number: "${printed}"`);
}

function parseSize(printed) {
  const t = String(printed).trim().replace(/["″Ø⌀ø]/g, "").trim();
  const m = t.match(/^(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)$/);
  if (m) return `${Number(m[1])}x${Number(m[2])}`;
  return parseNumber(t);
}

/** "<canonical> (<printed>)" → { value, printed } */
function parseEnum(cell, allowed) {
  const m = String(cell).trim().match(/^([a-z_]+)(?:\s*\((.*)\))?$/);
  if (!m || !allowed.includes(m[1])) throw new Error(`enum cell "${cell}" is not one of ${allowed.join("/")} (write "<canonical> (<printed>)")`);
  return { value: m[1], printed: m[2] ?? null };
}

export function parseTranscription(textIn) {
  const lines = textIn.split(/\r?\n/);
  const doc = { set: null, seed: null, scope: [], excludes: [], tables: [] };
  let cur = null;
  let inGrid = false;
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    const where = `line ${i + 1}`;
    if (!line.trim() || line.trimStart().startsWith("#")) return;
    if (inGrid) {
      if (line.trim() === "END") { inGrid = false; doc.tables.push(cur); cur = null; return; }
      const cells = line.split("|").map((c) => c.trim());
      if (cells.length !== cur.cols.length) throw new Error(`${where}: ${cells.length} cells, ${cur.cols.length} columns declared — ${line}`);
      cur.grid.push({ cells, line: i + 1 });
      return;
    }
    let m;
    if ((m = line.match(/^SET\s+(\S+)$/))) doc.set = m[1];
    else if ((m = line.match(/^SEED\s+(\d+)$/))) doc.seed = Number(m[1]);
    else if ((m = line.match(/^SCOPE\s+(.+)$/))) doc.scope.push(m[1]);
    else if ((m = line.match(/^EXCLUDES\s+(.+)$/))) doc.excludes.push(m[1]);
    else if (line.trim() === "TABLE") cur = { cols: [], derive: [], grid: [] };
    else if (cur && (m = line.match(/^(sheet|title|family|render|rows):\s*(.+)$/))) cur[m[1]] = m[2].trim();
    else if (cur && (m = line.match(/^col:\s*(.+?)\s*=>\s*(\S+)(?:\s+\[([^\]]+)\])?$/))) cur.cols.push({ header: m[1], attr: m[2], unit: m[3] ?? null });
    else if (cur && (m = line.match(/^derive:\s*(\w+)\s*=\s*([^;]+?)\s*;\s*header=([^;]+?)\s*;\s*note=(.+)$/))) {
      cur.derive.push({ attr: m[1], value: m[2], header: m[3], note: m[4] });
    } else if (cur && line.trim() === "grid:") inGrid = true;
    else throw new Error(`${where}: cannot parse — ${line}`);
  });
  if (inGrid || cur) throw new Error("transcription ends inside a TABLE (missing END)");
  return doc;
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Expand a parsed transcription into key rows; throws on anything invalid.
 * TABLE blocks with the same sheet + title are parts of one printed schedule
 * ("… 1 OF 2" / "… 2 OF 2"): an instance's attributes merge across them, and
 * two parts printing the same attribute for one instance is an error. */
export function expandTranscription(doc) {
  if (!doc.set) throw new Error("missing SET");
  const unitOf = (a) => (a.endsWith("_cfm") || a === "cfm" || a.startsWith("cfm_") ? "cfm"
    : a.endsWith("_gpm") || a === "gpm" ? "gpm" : a.endsWith("_f") ? "F" : a.endsWith("_ft") ? "ft"
      : a.endsWith("_in") ? "in" : a.endsWith("_mbh") ? "MBH" : a.endsWith("_hp") ? "hp" : a.endsWith("_kw") || a === "kw_input" ? "kW"
        : a === "tons" || a.endsWith("_tons") ? "tons" : a === "volts" ? "V" : a.endsWith("_lb_hr") ? "lb/hr"
          : a === "rpm" ? "rpm" : a === "motor_watts" ? "W" : a.endsWith("_pct") ? "%" : "");
  const instances = new Map(); // sheet|title|tag -> { base, family, values: Map(attr -> line) }
  const order = [];
  for (const t of doc.tables) {
    for (const k of ["sheet", "title", "family", "render", "rows"]) if (!t[k]) throw new Error(`TABLE ${t.title || "?"}: missing ${k}:`);
    const attrs = KEY_ATTRIBUTES[t.family];
    if (!attrs) throw new Error(`TABLE ${t.title}: no key vocabulary for family ${t.family}`);
    const tagCol = t.cols.findIndex((c) => c.attr === "tag");
    if (tagCol < 0) throw new Error(`TABLE ${t.title}: no "=> tag" column`);
    const mapped = new Map();
    t.cols.forEach((c, i) => {
      if (c.attr === "tag" || c.attr === "-") return;
      if (!attrs[c.attr]) throw new Error(`TABLE ${t.title}: "${c.attr}" is not a covered attribute of ${t.family}`);
      if (mapped.has(c.attr)) throw new Error(`TABLE ${t.title}: two columns map to ${c.attr}`);
      mapped.set(c.attr, i);
    });
    const derived = new Map();
    for (const d of t.derive) {
      if (!attrs[d.attr]) throw new Error(`TABLE ${t.title}: derive of uncovered attribute ${d.attr}`);
      if (mapped.has(d.attr) || derived.has(d.attr)) throw new Error(`TABLE ${t.title}: ${d.attr} both mapped and derived`);
      derived.set(d.attr, d);
    }
    const seenInBlock = new Set();
    for (const row of t.grid) {
      const tag = row.cells[tagCol];
      if (!tag) throw new Error(`line ${row.line}: empty tag`);
      if (seenInBlock.has(tag)) throw new Error(`line ${row.line}: tag ${tag} twice in one TABLE block`);
      seenInBlock.add(tag);
      const key = `${t.sheet}|${t.title}|${tag}`;
      let inst = instances.get(key);
      if (!inst) {
        inst = { base: { sheet: t.sheet, table_title: t.title, tag, family: t.family }, attrs, values: new Map() };
        instances.set(key, inst);
        order.push(key);
      } else if (inst.base.family !== t.family) {
        throw new Error(`line ${row.line}: ${tag} is ${inst.base.family} in one part and ${t.family} in another`);
      }
      const put = (attr, line) => {
        if (inst.values.has(attr)) throw new Error(`line ${row.line}: ${tag}.${attr} printed in two parts of ${t.title}`);
        inst.values.set(attr, line);
      };
      for (const [attr, spec] of Object.entries(attrs)) {
        let unit = spec.type === "num" || spec.type === "size" ? unitOf(attr) : "";
        if (mapped.has(attr)) {
          const col = t.cols[mapped.get(attr)];
          const cell = row.cells[mapped.get(attr)];
          if (col.unit) unit = col.unit;
          const header = col.header.replace(/^\[|\]$/g, "");
          if (cell.startsWith("?")) {
            put(attr, { value: "", unit, source_header: header, note: `printed '${cell.slice(1).trim()}' — not a single value for this attribute` });
            continue;
          }
          if (!cell) { put(attr, { value: "", unit, source_header: header, note: "blank cell" }); continue; }
          // A printed dash / N/A in a number column says "none here": no value,
          // and the printed mark is kept so the scorer can tell it from a blank.
          if ((spec.type === "num" || spec.type === "size") && /^(-+|—|–|N\/?A|NONE)$/i.test(cell)) {
            put(attr, { value: "", unit, source_header: header, note: `printed '${cell}'` });
            continue;
          }
          let value;
          let note = "";
          try {
            if (spec.type === "num") value = parseNumber(cell);
            else if (spec.type === "size") value = parseSize(cell);
            else if (spec.type === "enum") {
              const e = parseEnum(cell, spec.values);
              value = e.value;
              if (e.printed !== null) note = `printed '${e.printed}'`;
            } else value = cell;
          } catch (e) {
            throw new Error(`line ${row.line} (${tag}.${attr}): ${e.message}`);
          }
          if (!note && (spec.type === "num" || spec.type === "size") && value !== cell) note = `printed '${cell}'`;
          if (col.header.startsWith("[")) note = note ? `${note}; author's reading of the printed row` : "author's reading of the printed row";
          put(attr, { value, unit, source_header: header, note });
        } else if (derived.has(attr)) {
          const d = derived.get(attr);
          let value = d.value;
          if (spec.type === "enum") value = parseEnum(d.value, spec.values).value;
          else if (spec.type === "num") value = parseNumber(d.value);
          put(attr, { value, unit, source_header: d.header, note: d.note });
        }
      }
    }
  }
  const out = [];
  for (const key of order) {
    const inst = instances.get(key);
    for (const [attr, spec] of Object.entries(inst.attrs)) {
      const unit = spec.type === "num" || spec.type === "size" ? unitOf(attr) : "";
      const line = inst.values.get(attr) || { value: "", unit, source_header: "", note: "not printed" };
      out.push({ ...inst.base, attribute: attr, ...line });
    }
  }
  return out;
}

const COLUMNS = ["sheet", "table_title", "tag", "family", "attribute", "value", "unit", "source_header", "note"];

if (process.argv[1] && process.argv[1].endsWith("assemblies-key-transcribe.mjs")) {
  const [corpusDir, setId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const check = process.argv.includes("--check");
  if (!corpusDir || !setId) {
    console.error("usage: node scripts/assemblies-key-transcribe.mjs <corpus-dir> <setId> [--check]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
  const src = join(corpus, "reports", "assemblies", "key-work", `${setId}.transcription.txt`);
  if (!existsSync(src)) { console.error(`no transcription at ${src}`); process.exit(2); }
  const doc = parseTranscription(readFileSync(src, "utf8"));
  if (doc.set !== setId) { console.error(`transcription says SET ${doc.set}, expected ${setId}`); process.exit(2); }
  const rows = expandTranscription(doc);
  const instances = new Set(rows.map((r) => `${r.sheet}|${r.table_title}|${r.tag}`)).size;
  const printed = rows.filter((r) => r.value !== "").length;
  const summary = `${setId}: ${doc.tables.length} table(s), ${instances} instance(s), ${rows.length} keyed attribute value(s) (${printed} printed, ${rows.length - printed} empty)`;
  if (check) { console.log(`OK ${summary}`); process.exit(0); }
  const H = [];
  H.push(`# ${setId}.attrs.csv — ATTRIBUTE-tier ground truth for the ASSEMBLIES goal (mcp/scripts/assemblies-attr-eval.mjs).`);
  H.push("#");
  H.push("# Authored from RENDERS (mcp/scripts/render-page-crop.mjs, 2-4x) by reading each table by eye;");
  H.push("# the pipeline's output for these sheets was not consulted. Where render and pipeline later");
  H.push("# differ, the RENDER decides. A key that looks wrong is written up in");
  H.push("# ASSEMBLIES_BUG_CATALOGUE.md, never edited (goals/ASSEMBLIES.md ANTI-GAMING).");
  H.push(`# Tables drawn by seed ${doc.seed ?? "?"} (reports/assemblies/01-split.json); transcription: reports/assemblies/key-work/${setId}.transcription.txt,`);
  H.push("# expanded by mcp/scripts/assemblies-key-transcribe.mjs.");
  H.push("#");
  for (const s of doc.scope) H.push(`# Scope: ${s}`);
  for (const t of doc.tables) H.push(`#   ${t.sheet} | ${t.title} | ${t.family} | ${t.rows} | render: ${t.render}`);
  H.push("# Covered attributes: every attribute of the family's key vocabulary (assemblies-key-transcribe.mjs KEY_ATTRIBUTES),");
  H.push("# one line per instance x attribute. Empty value + note 'not printed' = the table has no such column;");
  H.push("# empty value + note 'blank cell' = the column exists but this row prints nothing. Both score 'invented' if the pipeline fills them.");
  for (const e of doc.excludes) H.push(`# Not counted: ${e}`);
  H.push(`# ${summary}`);
  const body = [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))];
  const dest = join(corpus, "keys", `${setId}.attrs.csv`);
  writeFileSync(dest, `${H.join("\n")}\n${body.join("\n")}\n`);
  console.log(`wrote ${dest} — ${summary}`);
}
