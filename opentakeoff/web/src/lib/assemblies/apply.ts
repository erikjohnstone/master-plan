// ASSEMBLIES goal, WP5.1 — applying the assembly library to a project's
// compiled equipment (plan §8.2; goals/ASSEMBLIES.md WP5.1).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. Which typical each scheduled unit
// gets, and what it waits for, is the takeoff's answer. The Takeoff panel,
// the MCP tools and the evals call this module with the same compile
// (compileTakeoff(…, "hvac_equipment") over Session.graphForPipeline), so
// they cannot disagree. Only reading the inputs (a browser page, a Session)
// is surface-specific.
//
// From the compile to the lines, in order:
//   1. each compiled row is normalized (normalize.ts) with the context of the
//      table it was compiled from: its headers and rows, the notes, legend and
//      code legends printed with it (scheduleNotes.ts), and the units the
//      project's drive schedules name as their loads;
//   2. each row becomes an Instance: its canonical attributes with their
//      cites, where it is (building, floor, the air handler that serves it)
//      and how many units its tag stands for;
//   3. what no row prints is derived from the project, each with the rule
//      that derived it and its basis:
//      · the family the library applies: a row whose printed airflows make
//        it a 100% outdoor-air unit is a dedicated outdoor air unit, and a
//        fan coil row with gas heat is a furnace, whatever schedule they were
//        printed in (the compile's family stays on the row);
//      · `terminals_served`, the terminal units whose rows name the air
//        handler (a cell, or a part of the table's title, that reads exactly
//        as its tag: the tag is the evidence, never a word, LAW L1); 0 for
//        every air handler when the project schedules no terminal unit and
//        no duct-mounted (reheat) coil; all of them for the project's only
//        AHU or RTU when no terminal row names one;
//   4. drawing evidence is attached per unit (decision D6): the rows of the
//      printed points lists the BAS points compile maps to the unit through
//      its own served-equipment logic (corpusTakeoff.mjs, read-only). A unit
//      with a printed list has its typical's point lines replaced by it;
//   5. the library is applied (select.ts) and expanded (expand.ts).
import type { Value } from "./expr";
import { expandAll, type DrawingEvidence } from "./expand";
import { normalizeCompileItem, vfdDrivenTags, type CompileItem, type NormalizedItem, type TableContext } from "./normalize";
import { citedCodeLegend, scheduleLegend, scheduleNotes, type Box, type NoteSpan, type ScheduleNote } from "./scheduleNotes";
import type { ApplicationRecord, AssemblyDefinition, Cite, ExpandedLine } from "./schema";
import type { Instance, Override, ProjectSettings } from "./select";
import { answerIntents, sanitizeAnswers, type AnswerUnit } from "../controlIntent/catalogue";
import { mergeIntents, type IntentFact, type UnitIntent } from "../controlIntent/intent";
import { rowIntents, type RowUnit } from "../controlIntent/rowReader";
import { EVIDENCE_VERSION, findPackets, sheetNumberOf, type Packet } from "../controlIntent/evidence";
import { bindPackets, type Binding } from "../controlIntent/binding";
import { readingIntents, type Decision } from "../controlIntent/combine";

/** One compiled row: a compileTakeoff("hvac_equipment") item and its family. */
export type CompiledItem = CompileItem & { family: string };

/** A schedule table of the sheet graph that rows were compiled from. */
export interface CompiledTable {
  sheet: string;
  /** The compile's title for it (the title with a trailing "N OF M" dropped). */
  title: string;
  headers: readonly string[];
  region?: Box | null;
  rows?: ReadonlyArray<{ key: string; cells: Readonly<Record<string, string>> }>;
  /** Notes already read, when there are no page spans to read them from. */
  notes?: readonly ScheduleNote[];
  spans?: readonly NoteSpan[];
}

/** One row of a printed points list, with the unit the BAS points compile
 * maps it to (its served-equipment logic, read-only). */
export interface PrintedPointRow {
  /** The served equipment's mark, as the compile read it. */
  unit: string;
  list_title: string;
  sheet_id: string;
  /** The point's own mark (AI01, BO-3, …). */
  point: string;
  io: "AI" | "AO" | "BI" | "BO" | null;
  description: string | null;
  bbox: number[] | null;
}

/** A project's compiled equipment: the rows, the tables they came from, the
 * text spans of those tables' pages (sheet id → spans), when read, and the
 * printed points-list rows mapped to units, when compiled. */
export interface CompiledProject {
  items: readonly CompiledItem[];
  tables?: readonly CompiledTable[];
  pages?: Readonly<Record<string, readonly NoteSpan[]>>;
  printed_points?: readonly PrintedPointRow[];
  /** The control packets printed in the set (control intent WP2), when read. */
  control?: ControlPages;
}

/** The set's control evidence as printed: every packet the finder reads on
 * any page (controlIntent/evidence.ts), and the printed sheet number of each
 * page that has one (a row's "SEE M6.5" names it). */
export interface ControlPages {
  version: string;
  packets: readonly Packet[];
  sheet_numbers: Readonly<Record<string, string>>;
}

/** What the apply path reads of a bas_points compile (corpusTakeoff.mjs
 * compileBasTakeoff). */
export interface BasPointsCompile {
  categories?: { points_lists?: { lists?: ReadonlyArray<{
    title: string;
    sheet_id: string;
    items?: ReadonlyArray<{ tag: string; point_type?: string | null; description?: string | null; bbox_px?: number[] | null; served_equipment?: string | null }>;
  }> } };
}

const IO = new Set(["AI", "AO", "BI", "BO"]);

/** The printed points-list rows that name the unit they serve. A row the
 * compile maps to no unit is left out: it cannot replace anything. So is a
 * row whose served equipment has no letter: a numbered list's row number,
 * which the compile reads as its key, is not a unit mark (the same rule as
 * servingAirHandlers). */
export function printedPointRows(bas: BasPointsCompile | null | undefined): PrintedPointRow[] {
  const out: PrintedPointRow[] = [];
  for (const list of bas?.categories?.points_lists?.lists ?? []) {
    for (const it of list.items ?? []) {
      const unit = String(it.served_equipment ?? "").trim();
      if (!/[A-Z]/i.test(unit)) continue;
      const io = String(it.point_type ?? "").toUpperCase();
      out.push({
        unit, list_title: list.title, sheet_id: list.sheet_id, point: it.tag,
        io: IO.has(io) ? (io as PrintedPointRow["io"]) : null,
        description: it.description ?? null,
        bbox: Array.isArray(it.bbox_px) && it.bbox_px.length === 4 ? [...it.bbox_px] : null,
      });
    }
  }
  return out;
}

/** The compile's own rule for a table's title (corpusTakeoff.mjs uniqueFamily:
 * a trailing "N OF M" part suffix is dropped). */
export const compileTableTitle = (title: unknown): string => String(title || "").replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim();

/** A sheet id's file and page: "set.pdf#14" → { file: "set.pdf", page: 14 };
 * a bare file name is its first page. Null when the page is not a number. */
export function sheetPage(sheet: string): { file: string; page: number } | null {
  const hash = sheet.lastIndexOf("#");
  const file = hash >= 0 ? sheet.slice(0, hash) : sheet;
  const page = hash >= 0 ? Number(sheet.slice(hash + 1)) : 1;
  return Number.isInteger(page) && page >= 1 ? { file, page } : null;
}

/** What the apply path reads of an hvac_equipment compile and of the sheet
 * graph it was compiled from (loosely typed: both are JSON on the wire). */
export interface HvacCompile {
  categories?: Record<string, { items?: ReadonlyArray<{ tag: string; sheet_id: string; table_title: string; cells?: CompileItem["cells"]; building?: string | null; description?: string | null }> }>;
}
export interface GraphTables {
  sheets?: ReadonlyArray<{ key: string }>;
  tables?: ReadonlyArray<{
    sheet: string;
    title?: { text?: string | null } | null;
    headers?: readonly string[];
    region?: Box | null;
    rows?: ReadonlyArray<{ key: string; cells?: Readonly<Record<string, { text?: string | null } | null>> }>;
  }>;
}

/** The compile's rows (one per item, with its category's family) and the
 * graph tables they were compiled from. */
export function compiledRowsAndTables(compiled: HvacCompile, graph: GraphTables): { items: CompiledItem[]; tables: CompiledTable[] } {
  const items: CompiledItem[] = [];
  for (const [family, cat] of Object.entries(compiled.categories ?? {})) {
    for (const it of cat.items ?? []) {
      items.push({ family, tag: it.tag, sheet_id: it.sheet_id, table_title: it.table_title, cells: it.cells ?? {},
        building: it.building ?? null, description: it.description ?? null });
    }
  }
  const wanted = new Set(items.map((it) => `${it.sheet_id}|${it.table_title}`));
  const tables: CompiledTable[] = [];
  for (const t of graph.tables ?? []) {
    const title = compileTableTitle(t.title?.text);
    if (!wanted.has(`${t.sheet}|${title}`)) continue;
    tables.push({ sheet: t.sheet, title, headers: t.headers ?? [], region: t.region ?? null,
      rows: (t.rows ?? []).map((r) => ({ key: r.key, cells: Object.fromEntries(Object.entries(r.cells ?? {}).map(([h, c]) => [h, c?.text ?? ""])) })) });
  }
  return { items, tables };
}

/** The project the apply path reads: the compile's rows and tables, and the
 * text spans of every page a claimed table with a region is on (the spans
 * the graph itself is built from, in the same space as the region), read by
 * `spansOf`, the one surface-specific part (a Session's page, a PDF opened
 * by path). Spans keep only what the notes reader uses, so every surface
 * sends the same JSON. */
export async function compiledProjectOf(
  compiled: HvacCompile,
  graph: GraphTables,
  spansOf: (sheet: string) => Promise<readonly NoteSpan[] | null> | readonly NoteSpan[] | null,
  basPoints: BasPointsCompile | null = null,
): Promise<CompiledProject> {
  const { items, tables } = compiledRowsAndTables(compiled, graph);
  const pages: Record<string, NoteSpan[]> = {};
  const slim = (spans: readonly NoteSpan[]) => spans.map((sp) => ({ str: sp.str, x0: sp.x0, y0: sp.y0, x1: sp.x1, y1: sp.y1, ...(sp.rot ? { rot: sp.rot } : {}) }));
  for (const sheet of new Set(tables.filter((t) => t.region).map((t) => t.sheet))) {
    if (!sheetPage(sheet)) continue;
    const spans = await spansOf(sheet);
    if (spans) pages[sheet] = slim(spans);
  }
  // Control evidence: every page's packets (the finder reads its text and the
  // graph's tables on it), and the sheet number of each page that has some.
  const packets: Packet[] = [];
  const sheetNumbers: Record<string, string> = {};
  for (const { key: sheet } of graph.sheets ?? []) {
    if (!sheetPage(sheet)) continue;
    const spans = pages[sheet] ?? (await spansOf(sheet));
    if (!spans?.length) continue;
    const hints = (graph.tables ?? []).filter((t) => t.sheet === sheet && t.region && t.title?.text).map((t) => ({ title: String(t.title!.text), region: t.region! }));
    const found = findPackets(sheet, slim(spans), hints);
    if (!found.length) continue;
    packets.push(...found);
    const no = sheetNumberOf(spans);
    if (no) sheetNumbers[sheet] = no;
  }
  const control: ControlPages = { version: EVIDENCE_VERSION, packets, sheet_numbers: sheetNumbers };
  return { items, tables, pages, printed_points: printedPointRows(basPoints), control };
}

interface ReadTable extends CompiledTable {
  readNotes?: readonly ScheduleNote[];
  readCodes?: Record<string, Record<string, string>>;
  readLegend?: Record<string, string>;
}

/** The context of the table a row was compiled from: its headers in order,
 * the numbered notes and the legend printed with it, the code legends its
 * headers cite (read from its page's text spans) and its rows. Null when no
 * table of the project is the row's. `cache` keeps what was read per table,
 * so each table's notes are read once. */
export function tableContextOf(
  item: Pick<CompileItem, "sheet_id" | "table_title">,
  tables: readonly CompiledTable[],
  pages: Readonly<Record<string, readonly NoteSpan[]>> = {},
  cache: WeakMap<CompiledTable, ReadTable> = new WeakMap(),
): TableContext | null {
  const headers: string[] = [];
  const notes: ScheduleNote[] = [];
  const rows: Array<{ key: string; cells: Readonly<Record<string, string>> }> = [];
  const codes: Record<string, Record<string, string>> = {};
  const legend: Record<string, string> = {};
  for (const table of tables) {
    if (table.sheet !== item.sheet_id || table.title !== item.table_title) continue;
    let t = cache.get(table);
    if (!t) cache.set(table, t = { ...table });
    for (const h of t.headers) if (!headers.includes(h)) headers.push(h);
    const spans = pages[t.sheet] ?? t.spans;
    t.readNotes ??= spans && t.region ? scheduleNotes(spans, t.region) : (t.notes ?? []);
    for (const n of t.readNotes) if (!notes.some((x) => x.id === n.id)) notes.push(n);
    for (const r of t.rows ?? []) rows.push(r);
    if (spans) {
      t.readCodes ??= Object.fromEntries(t.headers.map((h) => [h, citedCodeLegend(spans, h)]).filter((e): e is [string, Record<string, string>] => Boolean(e[1])));
      Object.assign(codes, t.readCodes);
      t.readLegend ??= t.region ? scheduleLegend(spans, t.region) : {};
      Object.assign(legend, t.readLegend);
    }
  }
  return headers.length || notes.length || rows.length ? { headers, notes, rows, codes, legend } : null;
}

/** Every row of the project normalized with its table's context (step 1),
 * in the order of `project.items`. */
export function normalizeProject(project: CompiledProject): NormalizedItem[] {
  const cache = new WeakMap<CompiledTable, ReadTable>();
  const driven = vfdDrivenTags(project.items);
  return project.items.map((it) => {
    const table = tableContextOf(it, project.tables ?? [], project.pages ?? {}, cache);
    return normalizeCompileItem(it, it.family, table && driven.size ? { ...table, driven } : table);
  });
}

// ── Links between rows ──────────────────────────────────────────────────────

/** Families that serve terminal units, and the terminal families. */
export const AIR_HANDLER_FAMILIES: ReadonlySet<string> = new Set(["AHU", "RTU", "DOAS", "DOAH_UNIT", "DOAH_HANDLING", "OUTDOOR_AIR_UNIT"]);
export const TERMINAL_FAMILIES: ReadonlySet<string> = new Set(["VAV"]);

/** A tag in one spelling: case, whitespace and dash glyphs never distinguish
 * two units. */
const DASH_GLYPHS = /[‐-―−﹘﹣－]/g;
export const canonTag = (t: string): string => String(t ?? "").toUpperCase().replace(DASH_GLYPHS, "-").replace(/\s+/g, "");
const dashless = (t: string) => canonTag(t).replace(/[-.]/g, "");

/** The parts of a cell or title that could each be one tag: the whole text,
 * and its pieces between separators (",", "/", "&", " AND ", whitespace). */
function tagPieces(text: string): string[] {
  const s = String(text ?? "").trim();
  if (!s) return [];
  return [s, ...s.split(/\s*[,/&]\s*|\s+AND\s+|\s+/i)].filter(Boolean);
}

/** For each terminal row, the air handlers whose tag a cell of the row or a
 * part of its table's title reads as exactly (index into `items`). */
export function servingAirHandlers(items: readonly CompiledItem[]): Map<number, number[]> {
  const byTag = new Map<string, number[]>();
  items.forEach((it, i) => {
    // A mark with no letter ("1") is not a tag a terminal row can be said to
    // name: a QTY or size cell would read as it.
    if (!AIR_HANDLER_FAMILIES.has(it.family) || !/[A-Z]/i.test(it.tag)) return;
    for (const k of new Set([canonTag(it.tag), dashless(it.tag)])) {
      if (!k) continue;
      if (!byTag.has(k)) byTag.set(k, []);
      byTag.get(k)!.push(i);
    }
  });
  const links = new Map<number, number[]>();
  if (!byTag.size) return links;
  const lookup = (piece: string) => byTag.get(canonTag(piece)) ?? byTag.get(dashless(piece)) ?? [];
  items.forEach((it, i) => {
    if (!TERMINAL_FAMILIES.has(it.family)) return;
    const found = new Set<number>();
    for (const cell of Object.values(it.cells ?? {})) {
      const text = cell?.text ?? "";
      if (canonTag(text) === canonTag(it.tag)) continue;
      for (const piece of tagPieces(text)) for (const h of lookup(piece)) found.add(h);
    }
    for (const piece of tagPieces(it.table_title ?? "")) for (const h of lookup(piece)) found.add(h);
    if (found.size) links.set(i, [...found].sort((a, b) => a - b));
  });
  return links;
}

// ── Instances ───────────────────────────────────────────────────────────────

/** The cite of a row's own mark: the cell that reads as its tag. */
export function rowCite(item: CompiledItem): Cite {
  for (const [header, cell] of Object.entries(item.cells ?? {})) {
    if (canonTag(cell?.text ?? "") === canonTag(item.tag)) return { sheet: item.sheet_id, table_title: item.table_title, header, bbox: cell?.bbox ?? null };
  }
  return { sheet: item.sheet_id, table_title: item.table_title, header: "(row)", bbox: null };
}

/** A derived attribute: its value, and the rule and project fact behind it. */
export interface DerivedAttribute {
  value: Value;
  rule: string;
  basis: string;
}

/** An instance with what the apply path read and derived for it. */
export interface AppliedInstance extends Instance {
  /** The compiled row it came from (index into the project's items). */
  item: number;
  /** The family of the schedule it was compiled from (`family` is the one
   * the library applies, which `derived.family` may have changed). */
  compiled_family: string;
  /** Attributes the project gives it that its own row does not print. */
  derived: Record<string, DerivedAttribute>;
  /** Attributes its row leaves unknown, with the reason. */
  unknown: NormalizedItem["unknown"];
  /** The printed points-list rows mapped to it (D6 evidence), if any. */
  printed_points: PrintedPointRow[];
}

/** Families that serve terminal units from a central fan. */
const CENTRAL_AIR_HANDLER_FAMILIES: ReadonlySet<string> = new Set(["AHU", "RTU"]);

/** The family the library applies to a row, when its printed values make it
 * another family's unit than the schedule it was compiled from:
 *  · an air handler whose minimum outdoor air is 100% of its supply airflow
 *    (printed as a percent, or as equal airflows) supplies only outdoor air,
 *    which is what a dedicated outdoor air unit is;
 *  · a fan coil row with gas heat has a burner, so it is a furnace.
 * Null when the row is its schedule's family. */
export function appliedFamily(family: string, n: NormalizedItem): DerivedAttribute | null {
  const num = (a: string) => (typeof n.attributes[a]?.value === "number" ? (n.attributes[a].value as number) : null);
  if (family === "AHU" || family === "RTU") {
    const pct = num("outdoor_air_pct");
    if (pct !== null && pct >= 100) return { value: "DOAS", rule: "derive.family.outdoor_air_pct", basis: `minimum outdoor air ${pct}% of supply: a dedicated outdoor air unit` };
    const oa = num("oa_cfm_min");
    const sa = num("supply_cfm");
    if (oa !== null && sa !== null && sa > 0 && oa >= sa) {
      return { value: "DOAS", rule: "derive.family.outdoor_air_cfm", basis: `minimum outdoor air ${oa} cfm of ${sa} cfm supply: a dedicated outdoor air unit` };
    }
  }
  if (family === "FCU" && n.attributes.heating_type?.value === "gas") {
    return { value: "FURNACE", rule: "derive.family.gas_heat", basis: `a fan coil row with gas heat ("${n.attributes.heating_type.cite.header}"): a furnace` };
  }
  return null;
}

/** The project's rows as instances (steps 2 and 3). */
export function instancesOf(project: CompiledProject, normalized: readonly NormalizedItem[] = normalizeProject(project)): AppliedInstance[] {
  const { items } = project;
  const families = items.map((it, i) => appliedFamily(it.family, normalized[i]));
  const familyOf = (i: number) => String(families[i]?.value ?? items[i].family);
  const links = servingAirHandlers(items);
  const terminals = items.flatMap((it, i) => (TERMINAL_FAMILIES.has(it.family) ? [i] : []));
  // Zone equipment that sits on terminals without their own schedule: a
  // duct-mounted (reheat) coil means terminal units may exist unscheduled.
  const zoneCoils = items.some((it) => it.family === "DUCT_MOUNTED_COIL");
  const central = items.flatMap((it, i) => (CENTRAL_AIR_HANDLER_FAMILIES.has(familyOf(i)) ? [i] : []));
  // Which air handler serves which terminal rows, and on what basis.
  const served = new Map<number, number[]>();
  let countBasis: "links" | "no_terminals" | "sole_air_handler" | null = null;
  if (links.size) {
    countBasis = "links";
    for (const [t, hs] of links) for (const h of hs) {
      if (!served.has(h)) served.set(h, []);
      served.get(h)!.push(t);
    }
  } else if (!terminals.length && !zoneCoils) {
    countBasis = "no_terminals";
  } else if (terminals.length && central.length === 1) {
    countBasis = "sole_air_handler";
    served.set(central[0], terminals);
    for (const t of terminals) links.set(t, [central[0]]);
  }
  // Printed points-list rows by the unit they name. A list may spell a mark
  // without its dash ("AHU 1", "AHU1" for AHU-1): that looser spelling names
  // a scheduled unit only when no other scheduled unit reads the same way.
  // When two do (FCU-4 and FCU4), a row names one only in its own spelling,
  // spaces kept ("FCU 4" names neither). A dot is part of the number
  // (VAV-1.11 is not VAV-11.1).
  const looseTag = (t: string) => canonTag(t).replace(/-/g, "");
  const spelled = (t: string) => String(t ?? "").toUpperCase().replace(DASH_GLYPHS, "-").trim().replace(/\s+/g, " ");
  const printed = new Map<string, PrintedPointRow[]>();
  for (const r of project.printed_points ?? []) {
    const k = looseTag(r.unit);
    if (!k) continue;
    if (!printed.has(k)) printed.set(k, []);
    printed.get(k)!.push(r);
  }
  const scheduled = new Map<string, Set<string>>();
  for (const it of items) {
    const k = looseTag(it.tag);
    if (!scheduled.has(k)) scheduled.set(k, new Set());
    scheduled.get(k)!.add(canonTag(it.tag));
  }
  const printedFor = (tag: string) => {
    const rows = printed.get(looseTag(tag)) ?? [];
    if ((scheduled.get(looseTag(tag))?.size ?? 0) <= 1) return rows;
    return rows.filter((r) => spelled(r.unit) === spelled(tag));
  };
  return items.map((it, i) => {
    const n = normalized[i];
    const family = familyOf(i);
    const attributes: Instance["attributes"] = {};
    for (const [k, a] of Object.entries(n.attributes)) attributes[k] = { value: a.value, cite: a.cite };
    const derived: Record<string, DerivedAttribute> = {};
    if (families[i]) derived.family = families[i]!;
    const unknown = { ...n.unknown };
    if (AIR_HANDLER_FAMILIES.has(family) && !n.attributes.terminals_served) {
      const ts = served.get(i) ?? [];
      const named = ts.slice(0, 5).map((t) => items[t].tag).join(", ") + (ts.length > 5 ? ", …" : "");
      const count = countBasis === "links" ? { rule: "derive.terminals_served", basis: ts.length ? `${ts.length} terminal row(s) name ${it.tag}: ${named}` : `the project's terminal rows name their air handlers, and none names ${it.tag}` }
        : countBasis === "no_terminals" ? { rule: "derive.terminals_served.none_scheduled", basis: "the project schedules no terminal unit and no duct-mounted coil" }
          : countBasis === "sole_air_handler" && CENTRAL_AIR_HANDLER_FAMILIES.has(family) ? { rule: "derive.terminals_served.sole_air_handler", basis: `${it.tag} is the project's only AHU or RTU, and its ${ts.length} terminal row(s) name no air handler: ${named}` }
            : null;
      if (count) {
        derived.terminals_served = { value: ts.length, ...count };
        attributes.terminals_served = { value: ts.length, cite: null };
        delete unknown.terminals_served;
      } else {
        unknown.terminals_served = { reason: terminals.length
          ? "the project's terminal rows name no air handler, and it has more than one"
          : "the project schedules duct-mounted coils but no terminal unit, so its terminals are not known" };
      }
    }
    const handlers = links.get(i) ?? [];
    const qty = n.attributes.qty?.value;
    const multiplier = typeof qty === "number" && Number.isInteger(qty) && qty >= 1
      ? { value: qty, basis: `QTY "${n.attributes.qty.printed}" (${n.attributes.qty.cite.header})` }
      : { value: 1, basis: "one unit per tag" };
    const text = (a: string) => (typeof n.attributes[a]?.value === "string" ? String(n.attributes[a].value) : null);
    return {
      item: i,
      tag: it.tag,
      family,
      compiled_family: it.family,
      attributes,
      derived,
      unknown,
      scope: {
        building: it.building ?? text("building"),
        floor: text("floor"),
        system: AIR_HANDLER_FAMILIES.has(family) ? it.tag : handlers.length === 1 ? items[handlers[0]].tag : null,
      },
      cites: [rowCite(it)],
      multiplier,
      printed_points: printedFor(it.tag),
    };
  });
}

/** What the project-question effects and the row reader read of each
 * instance (catalogue.ts, rowReader.ts); `normalized` (by item) adds the
 * notes that speak for each row. */
export function answerUnitsOf(project: CompiledProject, instances: readonly AppliedInstance[], normalized?: readonly NormalizedItem[]): RowUnit[] {
  const headersOf = new Map<string, string[]>();
  for (const t of project.tables ?? []) {
    const k = `${t.sheet}|${t.title}`;
    headersOf.set(k, [...new Set([...(headersOf.get(k) ?? []), ...t.headers])]);
  }
  return instances.map((inst) => {
    const it = project.items[inst.item];
    return {
      index: inst.item, tag: inst.tag, family: inst.family,
      attributes: inst.attributes, unknown: inst.unknown as AnswerUnit["unknown"],
      cells: Object.fromEntries(Object.entries(it.cells ?? {}).map(([h, c]) => [h, String(c?.text ?? "")])),
      table_title: it.table_title, table_headers: headersOf.get(`${it.sheet_id}|${it.table_title}`) ?? [],
      cite: inst.cites[0],
      ...(normalized?.[inst.item]?.notes ? { notes: normalized[inst.item].notes } : {}),
    };
  });
}

/** One unit's intent from its drawing readings and the project's answers.
 * Scope: a project answer first (the estimator's statement about the whole
 * project, e.g. no BAS, existing units keep their controls). Attributes and
 * options: the drawing first (evidence about this unit beats a project-wide
 * default such as "unscheduled speed is constant"). */
export function combineUnitIntent(drawing: UnitIntent | undefined, answers: UnitIntent | undefined): UnitIntent | undefined {
  const out: UnitIntent = {};
  const scope = answers?.out_of_scope ?? drawing?.out_of_scope;
  if (scope) out.out_of_scope = scope;
  const pick = <K extends "attributes" | "options">(k: K) => {
    const m = { ...(answers?.[k] ?? {}), ...(drawing?.[k] ?? {}) } as NonNullable<UnitIntent[K]>;
    if (Object.keys(m).length) out[k] = m;
  };
  pick("attributes");
  pick("options");
  return out.out_of_scope || out.attributes || out.options ? out : undefined;
}

/** Attach each instance's intent: its facts on attributes the row leaves
 * unknown become attributes (with the rule and basis as a derived value);
 * a fact on an attribute the row prints is dropped here and never overrides
 * it (decision C12). */
export function attachIntents(instances: AppliedInstance[], intents: ReadonlyMap<number, UnitIntent>): void {
  for (const inst of instances) {
    const intent = intents.get(inst.item);
    if (!intent) continue;
    const attributes: Record<string, IntentFact<Value>> = {};
    for (const [k, f] of Object.entries(intent.attributes ?? {})) {
      if (inst.attributes[k] !== undefined) continue;
      attributes[k] = f;
      inst.attributes[k] = { value: f.value, cite: f.cites[0] ?? null };
      inst.derived[k] = { value: f.value, rule: f.rule, basis: f.basis };
      delete (inst.unknown as Record<string, unknown>)[k];
    }
    inst.intent = { ...intent, ...(Object.keys(attributes).length ? { attributes } : { attributes: undefined }) };
    if (!inst.intent.attributes) delete inst.intent.attributes;
  }
}

/** Apply the library to a project (step 4): every unit's records and lines.
 * `intents` are the drawing readings' facts per instance (the item index),
 * from the control-intent readers; project answers come from
 * `settings.answers`. */
export function applyAssemblies(input: {
  project: CompiledProject;
  library: readonly AssemblyDefinition[];
  settings?: ProjectSettings;
  overrides?: readonly Override[];
  evidence?: Readonly<Record<string, DrawingEvidence>>;
  normalized?: readonly NormalizedItem[];
  intents?: ReadonlyMap<number, UnitIntent>;
  /** The project's control-drawing readings (controlIntent/record.ts
   * readControlIntent), when read: their applied decisions become facts. */
  readings?: { units: ReadonlyArray<{ item: number; decisions: readonly Decision[] }> } | null;
}): { instances: AppliedInstance[]; applications: ApplicationRecord[]; lines: ExpandedLine[]; control: ControlEvidenceMap } {
  const normalized = input.normalized ?? normalizeProject(input.project);
  const instances = instancesOf(input.project, normalized);
  // Control intent: what the unit's own row prints (the row reader), what the
  // control drawings bound to it say (`intents`, from the readers), and the
  // project's answers.
  const units = answerUnitsOf(input.project, instances, normalized);
  const fromRows = rowIntents(units);
  const control = controlEvidenceMap(input.project, units, fromRows);
  const answers = sanitizeAnswers(input.settings?.answers);
  const fromAnswers = Object.keys(answers).length ? answerIntents(units, answers, input.library) : new Map<number, UnitIntent>();
  const fromReadings = readingIntents(input.readings);
  if (fromRows.size || fromAnswers.size || input.intents?.size || fromReadings.size) {
    const merged = new Map<number, UnitIntent>();
    for (const inst of instances) {
      // What the unit's own row prints first, then the caller's facts, then
      // what its control drawings read.
      const drawing = mergeIntents(fromRows.get(inst.item), input.intents?.get(inst.item), fromReadings.get(inst.item));
      const it = combineUnitIntent(drawing, fromAnswers.get(inst.item));
      if (it) merged.set(inst.item, it);
    }
    attachIntents(instances, merged);
  }
  // D6: a unit's printed points list replaces its typical's point lines. An
  // evidence entry the caller passes for a tag adds to this one.
  const evidence: Record<string, DrawingEvidence> = {};
  for (const i of instances) if (i.printed_points.length) evidence[i.tag] = { ...(evidence[i.tag] ?? {}), printedPoints: true };
  for (const [tag, e] of Object.entries(input.evidence ?? {})) {
    evidence[tag] = { ...(evidence[tag] ?? {}), ...e, declaredRoles: [...(evidence[tag]?.declaredRoles ?? []), ...(e.declaredRoles ?? [])] };
  }
  const { applications, lines } = expandAll(instances, input.library, input.settings ?? {}, input.overrides ?? [], evidence);
  return { instances, applications, lines, control };
}

/** The control-evidence map: the set's packets, and each unit's bindings
 * (compile item index → bindings, strongest first). Empty when the project
 * carries no control pages. */
export interface ControlEvidenceMap {
  version: string | null;
  packets: readonly Packet[];
  bindings: Record<number, Binding[]>;
}

export function controlEvidenceMap(project: CompiledProject, units: readonly RowUnit[], fromRows: ReadonlyMap<number, UnitIntent> = rowIntents(units)): ControlEvidenceMap {
  const pages = project.control;
  if (!pages?.packets.length) return { version: pages?.version ?? null, packets: pages?.packets ?? [], bindings: {} };
  // A row that puts its unit outside the BAS (standalone, not used) keeps
  // only the bindings a title or a tag makes.
  const standalone = new Set([...fromRows].filter(([, it]) => /^drawing_read:row\.(?:standalone|not_used)$/.test(it.out_of_scope?.rule ?? "")).map(([i]) => i));
  const bound = bindPackets(pages.packets, units, { sheetNumbers: pages.sheet_numbers, standalone });
  return { version: pages.version, packets: pages.packets, bindings: Object.fromEntries([...bound].sort((a, b) => a[0] - b[0])) };
}
