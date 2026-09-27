// ASSEMBLIES goal, WP5.3/5.4 — what the apply path's result says, shaped
// once for every surface: the exceptions first, a table per family, a row
// per unit with its cites (goals/ASSEMBLIES.md WP5.4: "per-family table,
// per-unit drill-down with cites, exceptions list first").
//
// SHOULD THIS BE ON THE SHARED PATH? Yes: which units wait for what and how
// many each typical got is the takeoff's answer. The Takeoff panel and the
// MCP tool both render this object; neither counts on its own.
import type { AppliedInstance, DerivedAttribute, PrintedPointRow } from "./apply";
import { partnerSummary, type PartnerSummary } from "./partner";
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
  /** The partner's own cost and labor fields, extended and labelled
   * "partner-entered" (WP9); null when no line carries one. */
  partner: PartnerSummary | null;
  /** Records that wait for something, first: each names what it waits for. */
  exceptions: UnitRow[];
  families: FamilyRow[];
  units: UnitRow[];
}

const RECORD_STATUSES: readonly RecordStatus[] = ["ok", "overridden", "unresolved", "excluded", "no_assembly", "not_in_scope"];
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
    partner: partnerSummary(lines),
    exceptions,
    families,
    units,
  };
}

/** Exceptions one answer resolves together: unresolved records of one
 * schedule (its sheet and title), family and layer that wait for the same
 * things, either with the same candidates ("EF-1 … EF-9 of the EXHAUST FAN
 * SCHEDULE wait for attr.vfd") or under the same typical with the same
 * options undecided (FCU-1 … FCU-7 under fcu@1 wait for attr.ecm, which
 * decides variable_speed_fan; AS-48). The estimator's choice is still an
 * override on each unit with its reason; a group only saves making it once
 * per row. Groups of one are left out. */
export interface ExceptionGroup {
  family: string;
  layer: string;
  sheet: string | null;
  /** The schedule's title, as its rows' cites print it; null for a table
   * that prints none. */
  schedule: string | null;
  waits_for: string[];
  candidates: string[];
  /** The typical the rows share when they wait on its options ("id@version");
   * null for rows that wait for a typical. */
  assembly: string | null;
  /** The typical's options undecided in every row, for one answer each. */
  options: string[];
  units: UnitRow[];
}

const undecided = (u: UnitRow) => Object.entries(u.options).filter(([, o]) => o.value === null).map(([id]) => id).sort();

export function exceptionGroups(exceptions: readonly UnitRow[]): ExceptionGroup[] {
  const groups = new Map<string, ExceptionGroup>();
  for (const u of exceptions) {
    if (u.status !== "unresolved") continue;
    // Rows that wait for a typical, or rows under one whose options wait.
    const options = u.candidates.length ? [] : undecided(u);
    if (!u.candidates.length && !(u.assembly && options.length)) continue;
    const cite = u.cites[0];
    const title = cite?.table_title || null;
    const waits = [...u.waits_for].sort();
    const assembly = u.candidates.length ? null : u.assembly;
    const k = JSON.stringify([u.family, u.layer, cite?.sheet ?? null, title, waits, u.candidates, assembly, options]);
    let g = groups.get(k);
    if (!g) groups.set(k, g = { family: u.family, layer: u.layer, sheet: cite?.sheet ?? null, schedule: title, waits_for: waits, candidates: [...u.candidates], assembly, options, units: [] });
    g.units.push(u);
  }
  return [...groups.values()].filter((g) => g.units.length > 1);
}

/** The families a reply is narrowed to that leave units out, each with why,
 * so a narrowed reply never drops them without a word (AS-51): one no unit
 * applies as (a typo, or a family the set has none of), and units scheduled
 * as one that apply as a family the narrowing does not name (a 100%
 * outdoor-air air handler applies as DOAS). */
export function familiesLeftOut(instances: readonly Pick<AppliedInstance, "tag" | "family" | "compiled_family">[], families: readonly string[]): Array<{ family: string; why: string }> {
  const asked = new Set(families);
  const here = [...new Set(instances.map((i) => i.family))].sort();
  const out: Array<{ family: string; why: string }> = [];
  for (const f of asked) {
    const moved = instances.filter((i) => i.compiled_family === f && !asked.has(i.family));
    if (!moved.length) {
      if (!instances.some((i) => i.family === f)) out.push({ family: f, why: here.length ? `no unit applies as ${f} (the families here: ${here.join(", ")})` : `no unit applies as ${f}: the set has none` });
      continue;
    }
    const as = [...new Set(moved.map((i) => i.family))].sort();
    const tags = moved.map((i) => i.tag);
    const one = moved.length === 1;
    out.push({ family: f, why: `${one ? "1 unit" : `${moved.length} units`} scheduled as ${f} ${one ? "applies" : "apply"} as ${as.join(", ")} (${tags.slice(0, 6).join(", ")}${tags.length > 6 ? ", …" : ""}); name ${as.join(" and ")} too to see ${one ? "it" : "them"}` });
  }
  return out;
}
