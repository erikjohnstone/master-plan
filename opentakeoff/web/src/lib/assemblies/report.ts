// ASSEMBLIES goal, WP5.3/5.4 — what the apply path's result says, shaped
// once for every surface: the exceptions first, a table per family, a row
// per unit with its cites (goals/ASSEMBLIES.md WP5.4: "per-family table,
// per-unit drill-down with cites, exceptions list first").
//
// SHOULD THIS BE ON THE SHARED PATH? Yes: which units wait for what and how
// many each typical got is the takeoff's answer. The Takeoff panel and the
// MCP tool both render this object; neither counts on its own.
import type { AppliedInstance, DerivedAttribute, PrintedPointRow } from "./apply";
import type { ApplicationRecord, Cite, ExpandedLine } from "./schema";

type RecordStatus = ApplicationRecord["status"];
type LineStatus = ExpandedLine["status"];

export interface UnitRow {
  tag: string;
  /** The family the library applied (a derived one when the row's printed
   * values made it another family's unit). */
  family: string;
  /** The family of the schedule it was compiled from. */
  compiled_family: string;
  layer: string;
  /** "id@version", or null. */
  assembly: string | null;
  status: RecordStatus;
  selected_by: ApplicationRecord["selected_by"];
  reason: string | null;
  options: ApplicationRecord["options"];
  derived: Record<string, DerivedAttribute>;
  multiplier: ApplicationRecord["multiplier"];
  waits_for: string[];
  candidates: string[];
  lines: Record<LineStatus, number>;
  /** The printed points list mapped to the unit (D6): its rows by I/O type. */
  printed_points: { rows: number; by_io: Record<"AI" | "AO" | "BI" | "BO" | "other", number>; lists: string[] } | null;
  cites: Cite[];
}

export interface FamilyRow {
  family: string;
  /** Units of the family, and their records (one per layer the library offers it). */
  units: number;
  records: number;
  /** "id@version" → units given it. */
  assemblies: Record<string, number>;
  by_status: Record<RecordStatus, number>;
  lines: Record<LineStatus, number>;
}

export interface AssembliesReport {
  schema: "opentakeoff.assemblies_report.v1";
  totals: { units: number; records: number; by_status: Record<RecordStatus, number>; lines: number; lines_by_status: Record<LineStatus, number> };
  /** Records that wait for something, first: each names what it waits for. */
  exceptions: UnitRow[];
  families: FamilyRow[];
  units: UnitRow[];
}

const RECORD_STATUSES: readonly RecordStatus[] = ["ok", "overridden", "unresolved", "excluded", "no_assembly"];
const LINE_STATUSES: readonly LineStatus[] = ["ok", "unresolved", "replaced", "error"];
const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
const keyOf = (tag: string, family: string, layer: string, cite: Cite | undefined) => `${tag}|${family}|${layer}|${JSON.stringify(cite ?? null)}`;

function printedSummary(rows: readonly PrintedPointRow[]): UnitRow["printed_points"] {
  if (!rows.length) return null;
  const by_io = { AI: 0, AO: 0, BI: 0, BO: 0, other: 0 };
  for (const r of rows) by_io[r.io ?? "other"] += 1;
  return { rows: rows.length, by_io, lists: [...new Set(rows.map((r) => `${r.sheet_id} · ${r.list_title}`))] };
}

/** The report for one application of the library (applyAssemblies' result). */
export function assembliesReport(
  instances: readonly AppliedInstance[],
  applications: readonly ApplicationRecord[],
  lines: readonly ExpandedLine[],
): AssembliesReport {
  const inst = new Map(instances.map((i) => [keyOf(i.tag, i.family, "", i.cites[0]), i]));
  const lineCounts = new Map<string, Record<LineStatus, number>>();
  const linesByStatus = zero(LINE_STATUSES);
  for (const l of lines) {
    const k = keyOf(l.tag, l.family, l.layer, l.cites[0]);
    if (!lineCounts.has(k)) lineCounts.set(k, zero(LINE_STATUSES));
    lineCounts.get(k)![l.status] += 1;
    linesByStatus[l.status] += 1;
  }
  const units: UnitRow[] = applications.map((a) => {
    const i = inst.get(keyOf(a.instance.tag, a.instance.family, "", a.instance.cites[0]));
    return {
      tag: a.instance.tag,
      family: a.instance.family,
      compiled_family: i?.compiled_family ?? a.instance.family,
      layer: a.layer,
      assembly: a.assembly ? `${a.assembly.id}@${a.assembly.version}` : null,
      status: a.status,
      selected_by: a.selected_by,
      reason: a.reason,
      options: a.options,
      derived: i?.derived ?? {},
      multiplier: a.multiplier,
      waits_for: a.unresolved.missing,
      candidates: a.unresolved.candidates,
      lines: lineCounts.get(keyOf(a.instance.tag, a.instance.family, a.layer, a.instance.cites[0])) ?? zero(LINE_STATUSES),
      printed_points: printedSummary(i?.printed_points ?? []),
      cites: a.instance.cites,
    };
  });
  const byFamily = new Map<string, FamilyRow>();
  const seen = new Map<string, Set<string>>();
  const byStatus = zero(RECORD_STATUSES);
  for (const u of units) {
    byStatus[u.status] += 1;
    let f = byFamily.get(u.family);
    if (!f) byFamily.set(u.family, f = { family: u.family, units: 0, records: 0, assemblies: {}, by_status: zero(RECORD_STATUSES), lines: zero(LINE_STATUSES) });
    const unit = keyOf(u.tag, u.family, "", u.cites[0]);
    if (!seen.has(u.family)) seen.set(u.family, new Set());
    if (!seen.get(u.family)!.has(unit)) { seen.get(u.family)!.add(unit); f.units += 1; }
    f.records += 1;
    f.by_status[u.status] += 1;
    if (u.assembly) f.assemblies[u.assembly] = (f.assemblies[u.assembly] ?? 0) + 1;
    for (const s of LINE_STATUSES) f.lines[s] += u.lines[s];
  }
  const families = [...byFamily.values()].sort((a, b) => b.units - a.units || a.family.localeCompare(b.family));
  const exceptions = units.filter((u) => u.status === "unresolved")
    .sort((a, b) => a.family.localeCompare(b.family) || a.tag.localeCompare(b.tag) || a.layer.localeCompare(b.layer));
  return {
    schema: "opentakeoff.assemblies_report.v1",
    totals: { units: instances.length, records: applications.length, by_status: byStatus, lines: lines.length, lines_by_status: linesByStatus },
    exceptions,
    families,
    units,
  };
}
