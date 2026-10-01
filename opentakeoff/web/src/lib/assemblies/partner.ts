// ASSEMBLIES goal, WP9 — the partner's own cost and labor fields (decision
// D14; goals/ASSEMBLIES.md WP9).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. Extended cost and hours are totals
// every surface shows: lines.csv, the report and its PDF section read them
// from here, so the Takeoff panel and apply_assemblies give the same numbers.
//
// Partner-entered, opaque, never shipped. A starter line carries none (the
// starter's grep test holds it), OpenTakeoff sets no price, rate or hour of
// its own, and every surface labels these numbers "partner-entered". The
// currency and what a labor category means are the partner's.
import type { ExpandedLine } from "./schema";

export const PARTNER_ENTERED = "partner-entered" as const;

const round12 = (n: number) => Number(n.toPrecision(12));

/** A line's extended cost and hours. Cost is the quantity with waste (the
 * material bought) × unit_cost; hours is the installed quantity × hours per
 * unit. Null where the partner gave no figure or the line's quantity is not
 * known (unresolved, replaced by drawing evidence, or an error). */
export function extendedOf(line: Pick<ExpandedLine, "partner" | "qty_base" | "qty_with_waste">): { cost: number | null; hours: number | null } {
  const p = line.partner;
  return {
    cost: p?.unit_cost !== undefined && line.qty_with_waste !== null ? round12(line.qty_with_waste * p.unit_cost) : null,
    hours: p?.hours !== undefined && line.qty_base !== null ? round12(line.qty_base * p.hours) : null,
  };
}

export interface PartnerSummary {
  label: typeof PARTNER_ENTERED;
  /** Lines whose rule carries any partner field. */
  lines: number;
  /** The known extended costs summed, and how many lines that is. */
  extended_cost: number | null;
  costed_lines: number;
  /** Extended hours by labor category ("" when the partner named none). */
  hours: Array<{ labor_category: string; extended_hours: number; lines: number }>;
  /** Lines with a unit cost or hours that could not be extended because
   * their quantity is not known. */
  not_extended: number;
}

/** What the partner's fields add up to, or null when no line carries one. */
export function partnerSummary(lines: readonly ExpandedLine[]): PartnerSummary | null {
  const mine = lines.filter((l) => l.partner);
  if (!mine.length) return null;
  let cost = 0;
  let costed = 0;
  let notExtended = 0;
  const hours = new Map<string, { labor_category: string; extended_hours: number; lines: number }>();
  for (const l of mine) {
    const x = extendedOf(l);
    const priced = l.partner?.unit_cost !== undefined || l.partner?.hours !== undefined;
    if (priced && x.cost === null && x.hours === null) notExtended += 1;
    if (x.cost !== null) { cost += x.cost; costed += 1; }
    if (x.hours !== null) {
      const cat = l.partner?.labor_category ?? "";
      const h = hours.get(cat) ?? { labor_category: cat, extended_hours: 0, lines: 0 };
      h.extended_hours = round12(h.extended_hours + x.hours);
      h.lines += 1;
      hours.set(cat, h);
    }
  }
  return {
    label: PARTNER_ENTERED,
    lines: mine.length,
    extended_cost: costed ? round12(cost) : null,
    costed_lines: costed,
    hours: [...hours.values()].sort((a, b) => a.labor_category.localeCompare(b.labor_category)),
    not_extended: notExtended,
  };
}
