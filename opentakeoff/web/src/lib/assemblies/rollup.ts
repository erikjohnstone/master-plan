// ASSEMBLIES goal, WP3.3 — rolling expanded lines up by building, floor,
// system and family (plan §8.4), with the order quantity rounded here and
// nowhere earlier (decision D8: qty → waste → rounding, rounding at roll-up).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes: the roll-up is the bill of materials
// every surface and export shows.
//
// Conservation holds by construction: a row's qty_base is the exact sum of
// its known lines' qty_base, and every known line belongs to exactly one row.
// A line without a known quantity (unresolved, replaced, error) adds nothing
// to any sum; the row counts it, so a total never hides what it lacks.

import type { ExpandedLine } from "./schema";

export type Breakdown = "building" | "floor" | "system" | "family";

export interface RollupRow {
  /** The breakdown's values for this row, in the order asked. */
  group: Partial<Record<Breakdown, string | null>>;
  kind: ExpandedLine["kind"];
  role: ExpandedLine["role"];
  io: ExpandedLine["io"];
  unit: string;
  /** The line's parameters that decide what is bought (size, end type …). */
  params: Record<string, number | string | boolean | null>;
  round: ExpandedLine["round"];
  qty_base: number;
  qty_with_waste: number;
  /** qty_with_waste rounded by the line's rule: the order quantity. */
  qty_order: number;
  /** Known lines summed, and the lines left out for want of a quantity. */
  lines: number;
  unresolved: number;
  replaced: number;
  errors: number;
  tags: string[];
}

const round12 = (n: number) => Number(n.toPrecision(12));

function order(qty: number, round: ExpandedLine["round"]): number {
  if (round === "ceil") return Math.ceil(round12(qty));
  if (round && typeof round === "object") return round12(Math.ceil(round12(qty / round.increment)) * round.increment);
  return qty;
}

const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

/** Sum lines into rows: one row per breakdown group × what is bought (kind,
 * role, I/O, unit, parameters, rounding rule). Rows sort by their key, so the
 * result does not depend on line order. */
export function rollup(lines: readonly ExpandedLine[], by: readonly Breakdown[] = []): RollupRow[] {
  const rows = new Map<string, RollupRow & { sumBase: number; sumWaste: number }>();
  for (const l of lines) {
    const group = Object.fromEntries(by.map((b) => [b, b === "family" ? l.family : l.scope[b]])) as RollupRow["group"];
    const params = Object.fromEntries(Object.entries(l.params).map(([k, p]) => [k, p.value]));
    const key = stable({ group, kind: l.kind, role: l.role, io: l.io, unit: l.unit, params, round: l.round });
    let row = rows.get(key);
    if (!row) {
      row = { group, kind: l.kind, role: l.role, io: l.io, unit: l.unit, params, round: l.round, qty_base: 0, qty_with_waste: 0, qty_order: 0, lines: 0, unresolved: 0, replaced: 0, errors: 0, tags: [], sumBase: 0, sumWaste: 0 };
      rows.set(key, row);
    }
    if (!row.tags.includes(l.tag)) row.tags.push(l.tag);
    if (l.status === "ok" && l.qty_base !== null && l.qty_with_waste !== null) {
      row.sumBase += l.qty_base;
      row.sumWaste += l.qty_with_waste;
      row.lines++;
    } else if (l.status === "replaced") row.replaced++;
    else if (l.status === "error") row.errors++;
    else row.unresolved++;
  }
  return [...rows.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, r]) => {
      const { sumBase, sumWaste, ...row } = r;
      row.qty_base = round12(sumBase);
      row.qty_with_waste = round12(sumWaste);
      row.qty_order = order(row.qty_with_waste, row.round);
      row.tags.sort();
      return row;
    });
}
