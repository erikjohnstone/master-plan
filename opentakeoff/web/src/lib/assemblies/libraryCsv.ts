// ASSEMBLIES goal, WP8.1 — the assembly library as a CSV, one row per item
// (plan §8.5; goals/ASSEMBLIES.md WP8.1).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. A partner edits the library in a
// spreadsheet and imports it; the Library view and MCP's library_path read it
// through this one reader and the same load gate as a profile, so a record
// the UI accepts is the record MCP applies.
//
// Every row names its assembly (id and version) and its row_type:
//   assembly   the record's own fields (title, kind, families, selector,
//              rank, layer, status);
//   option     an option (id, label, auto, default, note);
//   variable   a variable (id, unit, from, default, prompt);
//   line       a line (id, kind, label, when, qty, unit, waste, rounding,
//              role, I/O, device role, sub-assembly, parameters, the six
//              responsibility columns, trade, profile switch, labor hook,
//              partner fields, export fields, source);
//   provenance a provenance entry.
// Rows keep the record's order. Typed cells round-trip exactly: numbers and
// booleans as written, a variable's default and a line's parameters as JSON,
// a role as vocab:id, a sub-assembly as id@version, a rounding rule as none,
// ceil or increment:<n>, and a list of families as a JSON array (one family
// alone is its name).
//
// Reading reports every problem by row and column before the gate runs, then
// the gate's own rejections by the rows of the record they reject. Nothing is
// dropped silently.
import { ACTIVITIES, sanitizeAssemblyDefinitions, type AssemblyDefinition } from "./schema";

export const LIBRARY_CSV_COLUMNS = [
  "row_type", "assembly_id", "assembly_version",
  // assembly
  "title", "assembly_kind", "families", "selector", "rank", "layer", "status",
  // option, variable, line, provenance
  "item_id", "label", "auto", "default", "note", "unit", "from", "prompt",
  "line_kind", "when", "qty", "waste_pct", "round", "role", "io", "device_role_ref", "sub_assembly", "params",
  ...ACTIVITIES.map((a) => `resp_${a}`),
  "trade", "profile_switch", "labor_task", "labor_driver",
  "part_no", "unit_cost", "hours", "labor_category", "export_category", "cost_code",
  "source_ref", "source_license", "source_derivation",
  "prov_source", "prov_edition", "prov_locator", "prov_reviewer", "prov_date",
] as const;
type Col = (typeof LIBRARY_CSV_COLUMNS)[number];
type Row = Partial<Record<Col, string>>;

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** The library as CSV text (CRLF, a header row, one row per item). */
export function libraryToCsv(library: readonly AssemblyDefinition[]): string {
  const rows: Row[] = [];
  for (const a of library) {
    const key = { assembly_id: a.id, assembly_version: a.version };
    rows.push({
      row_type: "assembly", ...key, title: a.title, assembly_kind: a.kind,
      families: Array.isArray(a.applies_to.family) ? JSON.stringify(a.applies_to.family) : a.applies_to.family, selector: str(a.applies_to.selector),
      rank: str(a.applies_to.rank), layer: a.applies_to.layer ?? "controls", status: a.status,
    });
    for (const o of a.options) rows.push({ row_type: "option", ...key, item_id: o.id, label: o.label, auto: str(o.auto), default: str(o.default), note: str(o.note) });
    for (const v of a.variables) rows.push({ row_type: "variable", ...key, item_id: v.id, unit: str(v.unit), from: str(v.from), default: v.default === undefined ? "" : JSON.stringify(v.default), prompt: str(v.prompt) });
    for (const l of a.lines) {
      const row: Row = {
        row_type: "line", ...key, item_id: l.id, line_kind: l.kind, label: str(l.label), when: str(l.when), qty: l.qty, unit: l.unit,
        waste_pct: str(l.waste_pct), round: l.round === undefined ? "" : typeof l.round === "string" ? l.round : `increment:${l.round.increment}`,
        role: `${l.role.vocab}:${l.role.id}`, io: str(l.io), device_role_ref: str(l.device_role_ref),
        sub_assembly: l.ref ? (l.ref.version ? `${l.ref.id}@${l.ref.version}` : l.ref.id) : "",
        params: l.params ? JSON.stringify(l.params) : "",
        trade: l.trade, profile_switch: str(l.profile_switch), labor_task: str(l.labor_task?.task), labor_driver: str(l.labor_task?.driver),
        part_no: str(l.partner?.part_no), unit_cost: str(l.partner?.unit_cost), hours: str(l.partner?.hours), labor_category: str(l.partner?.labor_category),
        export_category: str(l.export?.category), cost_code: str(l.export?.cost_code),
        source_ref: l.source.ref, source_license: l.source.license, source_derivation: l.source.derivation,
      };
      for (const act of ACTIVITIES) row[`resp_${act}` as Col] = str(l.responsibility?.[act]);
      rows.push(row);
    }
    for (const p of a.provenance) {
      rows.push({ row_type: "provenance", ...key, prov_source: p.source, prov_edition: str(p.edition), prov_locator: str(p.locator),
        source_license: p.license, source_derivation: p.derivation, prov_reviewer: str(p.reviewer), prov_date: str(p.date) });
    }
  }
  const out = [LIBRARY_CSV_COLUMNS.join(",")];
  for (const r of rows) out.push(LIBRARY_CSV_COLUMNS.map((c) => csvText(r[c] ?? "")).join(","));
  return `${out.join("\r\n")}\r\n`;
}

/** Quote a cell when it needs it. Library text is data the reader parses
 * back, so no formula guard: a selector may legitimately start with "-". */
function csvText(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 rows. A spreadsheet's formula guard (a leading ') is not added
 * on export, and one added by another tool is not removed: it would be part
 * of the value. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export interface LibraryCsvError {
  /** 1-based CSV record (the header is row 1; a quoted cell may span lines). */
  row: number | null;
  column: string | null;
  record: string | null;
  message: string;
}

/** A record as its rows spell it, before the gate. */
interface ParsedRecord { key: string; rows: number[]; raw: Record<string, unknown> }

/** The CSV's records, with every cell and structure problem by row and
 * column. A record with any problem is left out. */
function parseLibraryCsv(text: string): { records: ParsedRecord[]; errors: LibraryCsvError[] } {
  const errors: LibraryCsvError[] = [];
  const all = parseCsv(text);
  if (!all.length) return { records: [], errors: [{ row: null, column: null, record: null, message: "empty file" }] };
  const header = all[0].map((h) => h.trim());
  const missing = LIBRARY_CSV_COLUMNS.filter((c) => !header.includes(c));
  const unknown = header.filter((h) => !(LIBRARY_CSV_COLUMNS as readonly string[]).includes(h));
  if (missing.length) errors.push({ row: 1, column: null, record: null, message: `missing column(s): ${missing.join(", ")}` });
  if (unknown.length) errors.push({ row: 1, column: null, record: null, message: `unknown column(s): ${unknown.join(", ")}` });
  if (missing.length || unknown.length) return { records: [], errors };

  const records = new Map<string, { raw: Record<string, unknown>; rows: number[]; bad: boolean }>();
  const recordOf = (id: string, version: string, rowNo: number) => {
    const k = `${id}@${version}`;
    let r = records.get(k);
    if (!r) { r = { raw: { id, version, options: [], variables: [], lines: [], provenance: [] }, rows: [], bad: false }; records.set(k, r); }
    r.rows.push(rowNo);
    return r;
  };
  all.slice(1).forEach((cells, i) => {
    const rowNo = i + 2;
    if (cells.every((c) => !c.trim())) return; // a blank row
    const cell = (c: Col) => (cells[header.indexOf(c)] ?? "").trim();
    const opt = (c: Col) => cell(c) || undefined;
    const fail = (column: Col | null, message: string, rec: { bad: boolean } | null, name: string | null) => {
      errors.push({ row: rowNo, column, record: name, message });
      if (rec) rec.bad = true;
    };
    const id = cell("assembly_id");
    const version = cell("assembly_version");
    if (!id || !version) { fail(!id ? "assembly_id" : "assembly_version", "every row names its assembly's id and version", null, null); return; }
    const name = `${id}@${version}`;
    const rec = recordOf(id, version, rowNo);
    const num = (c: Col): number | undefined => {
      const s = cell(c);
      if (!s) return undefined;
      const n = Number(s);
      if (!Number.isFinite(n)) { fail(c, `"${s}" is not a number`, rec, name); return undefined; }
      return n;
    };
    const json = (c: Col): unknown => {
      const s = cell(c);
      if (!s) return undefined;
      try { return JSON.parse(s); } catch (e) { fail(c, `not JSON (${e instanceof Error ? e.message : String(e)})`, rec, name); return undefined; }
    };
    const type = cell("row_type");
    if (type === "assembly") {
      if (rec.raw.title !== undefined) { fail("row_type", `a second assembly row for ${name}`, rec, name); return; }
      // One family is its name; several (or a list of one) are a JSON array.
      const families = cell("families").startsWith("[") ? json("families") : cell("families");
      Object.assign(rec.raw, {
        title: cell("title"), kind: cell("assembly_kind"), status: cell("status"),
        applies_to: { family: families, ...(opt("selector") ? { selector: cell("selector") } : {}), rank: num("rank"), layer: opt("layer") ?? "controls" },
      });
    } else if (type === "option") {
      const d = cell("default");
      if (d && d !== "true" && d !== "false") fail("default", `an option's default is true or false, not "${d}"`, rec, name);
      (rec.raw.options as unknown[]).push({ id: cell("item_id"), label: cell("label"), ...(opt("auto") ? { auto: cell("auto") } : {}), ...(d ? { default: d === "true" } : {}), ...(opt("note") ? { note: cell("note") } : {}) });
    } else if (type === "variable") {
      const d = json("default");
      (rec.raw.variables as unknown[]).push({ id: cell("item_id"), ...(opt("unit") ? { unit: cell("unit") } : {}), ...(opt("from") ? { from: cell("from") } : {}), ...(d !== undefined ? { default: d } : {}), ...(opt("prompt") ? { prompt: cell("prompt") } : {}) });
    } else if (type === "line") {
      const role = cell("role").match(/^([a-z0-9]+):(.+)$/i);
      if (!role) fail("role", `a role is vocab:id (for example ot:control-valve), not "${cell("role")}"`, rec, name);
      const round = cell("round");
      const inc = round.match(/^increment:(.+)$/);
      if (round && !["none", "ceil"].includes(round) && !inc) fail("round", `rounding is none, ceil or increment:<n>, not "${round}"`, rec, name);
      const sub = cell("sub_assembly");
      const at = sub.lastIndexOf("@");
      const responsibility = Object.fromEntries(ACTIVITIES.map((a) => [a, cell(`resp_${a}` as Col)]).filter(([, v]) => v));
      const partner = { ...(opt("part_no") ? { part_no: cell("part_no") } : {}), ...(num("unit_cost") !== undefined ? { unit_cost: num("unit_cost") } : {}), ...(num("hours") !== undefined ? { hours: num("hours") } : {}), ...(opt("labor_category") ? { labor_category: cell("labor_category") } : {}) };
      const exp = { ...(opt("export_category") ? { category: cell("export_category") } : {}), ...(opt("cost_code") ? { cost_code: cell("cost_code") } : {}) };
      const params = json("params");
      (rec.raw.lines as unknown[]).push({
        id: cell("item_id"), kind: cell("line_kind"), ...(opt("label") ? { label: cell("label") } : {}), ...(opt("when") ? { when: cell("when") } : {}),
        qty: cell("qty"), unit: cell("unit"), ...(num("waste_pct") !== undefined ? { waste_pct: num("waste_pct") } : {}),
        ...(round ? { round: inc ? { increment: Number(inc[1]) } : round } : {}),
        role: role ? { vocab: role[1], id: role[2] } : { vocab: "", id: "" },
        ...(opt("io") ? { io: cell("io") } : {}), ...(opt("device_role_ref") ? { device_role_ref: cell("device_role_ref") } : {}),
        ...(sub ? { ref: at > 0 ? { id: sub.slice(0, at), version: sub.slice(at + 1) } : { id: sub } } : {}),
        ...(params !== undefined ? { params } : {}),
        ...(Object.keys(responsibility).length ? { responsibility } : {}),
        trade: cell("trade"), ...(opt("profile_switch") ? { profile_switch: cell("profile_switch") } : {}),
        ...(cell("labor_task") || cell("labor_driver") ? { labor_task: { task: cell("labor_task"), driver: cell("labor_driver") } } : {}),
        ...(Object.keys(partner).length ? { partner } : {}), ...(Object.keys(exp).length ? { export: exp } : {}),
        source: { ref: cell("source_ref"), license: cell("source_license"), derivation: cell("source_derivation") },
      });
    } else if (type === "provenance") {
      (rec.raw.provenance as unknown[]).push({ source: cell("prov_source"), ...(opt("prov_edition") ? { edition: cell("prov_edition") } : {}), ...(opt("prov_locator") ? { locator: cell("prov_locator") } : {}),
        license: cell("source_license"), derivation: cell("source_derivation"), ...(opt("prov_reviewer") ? { reviewer: cell("prov_reviewer") } : {}), ...(opt("prov_date") ? { date: cell("prov_date") } : {}) });
    } else {
      fail("row_type", `row_type is assembly, option, variable, line or provenance, not "${type}"`, rec, name);
    }
  });
  const good: ParsedRecord[] = [];
  for (const [key, r] of records) {
    if (r.raw.title === undefined) { errors.push({ row: r.rows[0], column: "row_type", record: key, message: `${key} has no assembly row` }); continue; }
    if (!r.bad) good.push({ key, rows: r.rows, raw: r.raw });
  }
  return { records: good, errors };
}

/** The load gate a profile's library passes (schema.ts) over `records`, with
 * `context` first so their sub-assembly references resolve against it. Each
 * rejection is reported against the record's rows; only `records`' own
 * definitions are returned. */
function gateRecords(records: readonly ParsedRecord[], context: readonly AssemblyDefinition[], errors: LibraryCsvError[]): AssemblyDefinition[] {
  const contextKeys = new Set(context.map((a) => `${a.id}@${a.version}`));
  for (const g of records.filter((r) => contextKeys.has(r.key))) {
    errors.push({ row: g.rows[0], column: "assembly_version", record: g.key, message: `${g.key} is already loaded; a changed record needs a new version` });
  }
  const mine = records.filter((r) => !contextKeys.has(r.key));
  const gated = sanitizeAssemblyDefinitions([...context, ...mine.map((g) => g.raw)]);
  for (const x of gated.rejected) {
    const g = mine.find((r) => r.raw.id === x.id);
    if (!g) continue; // the context's own record: loaded and gated before
    for (const e of x.errors) errors.push({ row: g.rows[0], column: null, record: g.key, message: `rows ${g.rows[0]}–${g.rows[g.rows.length - 1]}: ${e}` });
  }
  return gated.assemblies.filter((a) => !contextKeys.has(`${a.id}@${a.version}`));
}

/** Read a library CSV. Every cell problem is reported by row and column,
 * then the load gate runs over the records that parsed and each rejection is
 * reported against the record's rows. A record with any error is not
 * returned. `context` (already loaded, for example the starter) resolves the
 * sub-assemblies the CSV's records name; it is not returned. */
export function libraryFromCsv(text: string, opts: { context?: readonly AssemblyDefinition[] } = {}): { library: AssemblyDefinition[]; errors: LibraryCsvError[] } {
  const { records, errors } = parseLibraryCsv(text);
  return { library: gateRecords(records, opts.context ?? [], errors), errors };
}

/** Import a partner's library CSV beside the starter. A starter record is
 * read-only: an unchanged copy (a whole-library export read back) is
 * skipped, a changed one is refused (clone it to the next version). A partner
 * record with the same id and version is replaced; a new one is added.
 * Everything is gated against the starter and the partner's other records,
 * and every problem is reported by row. */
export function importLibraryCsv(text: string, starter: readonly AssemblyDefinition[], partner: readonly AssemblyDefinition[]): {
  partner: AssemblyDefinition[]; added: string[]; replaced: string[]; unchanged: string[]; errors: LibraryCsvError[];
} {
  const keyOf = (a: { id: string; version: string }) => `${a.id}@${a.version}`;
  const { records, errors } = parseLibraryCsv(text);
  const starterByKey = new Map(starter.map((a) => [keyOf(a), a]));
  const unchanged: string[] = [];
  const candidates: ParsedRecord[] = [];
  for (const r of records) {
    const s = starterByKey.get(r.key);
    if (!s) { candidates.push(r); continue; }
    // Read it the way the gate would, in the context of the rest of the starter.
    const [def] = gateRecords([r], starter.filter((a) => keyOf(a) !== r.key), []);
    if (def && JSON.stringify(def) === JSON.stringify(s)) unchanged.push(r.key);
    else errors.push({ row: r.rows[0], column: null, record: r.key, message: `${r.key} is a starter record and is read-only: clone it to the next version to change it` });
  }
  const starterStatus = candidates.filter((r) => r.raw.status === "starter");
  for (const r of starterStatus) errors.push({ row: r.rows[0], column: "status", record: r.key, message: `${r.key}: status "starter" is the starter library's own; a partner record is partner_edited or partner_imported` });
  const incoming = candidates.filter((r) => r.raw.status !== "starter");
  const others = partner.filter((p) => !incoming.some((r) => r.key === keyOf(p)));
  const accepted = gateRecords(incoming, [...starter, ...others], errors);
  const was = new Map(partner.map((p) => [keyOf(p), p]));
  const added = accepted.filter((c) => !was.has(keyOf(c))).map(keyOf);
  const replaced = accepted.filter((c) => was.has(keyOf(c)) && JSON.stringify(was.get(keyOf(c))) !== JSON.stringify(c)).map(keyOf);
  unchanged.push(...accepted.filter((c) => was.has(keyOf(c)) && JSON.stringify(was.get(keyOf(c))) === JSON.stringify(c)).map(keyOf));
  return { partner: [...others, ...accepted], added, replaced, unchanged, errors };
}
