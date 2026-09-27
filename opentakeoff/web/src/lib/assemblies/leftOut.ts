// ASSEMBLIES — scheduled rows the takeoff reads as no unit (AS-61).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. Which rows of a schedule are units
// is the compile's answer (corpusTakeoff.mjs, read here and never changed):
// a family's rows are read by their marks, so a VAV schedule whose marks
// carry a building prefix ("1-VAV-1") or a letter the family's mark rule
// does not know ("W05-TU-01", "PEF-1") gives no unit at all. This module
// only names such rows, from the compile and the sheet graph it was compiled
// from, so the Takeoff panel, apply_assemblies and the report's PDF name
// them alike rather than price fewer units without a word. It changes no
// unit, count or line.
import { HVAC_FAMILY_SPECS, isBasPointsListTable, isBasPointsListTitle, isScheduleHeaderJunkMark, normalizeEquipMark } from "../corpusTakeoff.mjs";
import { isEquipTag } from "../equiptags";
import { familiesOf, type AssemblyDefinition } from "./schema";

/** The rows of one schedule, titled as a family the takeoff reads, that no
 * compiled row carries. */
export interface RowsLeftOut {
  sheet: string;
  /** The sheet number its title block prints, when it prints one. */
  sheet_number?: string;
  /** The schedule's title, as the sheet graph read it. */
  title: string;
  /** The families its title names, in the compile's own words
   * (HVAC_FAMILY_SPECS). */
  families: string[];
  /** Its rows that carry a mark. */
  rows: number;
  /** The marks of the rows no unit carries, as printed. */
  marks: string[];
}

type Box = readonly number[];
/** What this module reads of a compile's rows: the mark and where it is. */
interface ItemLike { tag: string; sheet_id: string; bbox_px?: Box | null }
/** What this module reads of the sheet graph's tables. */
interface TableLike {
  sheet: string;
  title?: { text?: string | null } | null;
  headers?: readonly string[];
  rows?: ReadonlyArray<{ key: string; cells?: Readonly<Record<string, { text?: string | null; bbox?: Box | null } | null>> }>;
}

/** A mark as the takeoff compares it: the compile's own normalization, then
 * only its letters and digits ("AHU-1(E)" and "AHU-1E" are one mark). */
const markId = (s: unknown): string => String(normalizeEquipMark(String(s ?? ""))).toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A row key that reads as an equipment tag (equiptags.ts isEquipTag), as
 * printed or after one leading building or area token ("1-VAV-1",
 * "40-AHU-2", "W05-TU-01"), for any part of a "/" pair ("SS-1/SSCU-1"). A
 * word, a phrase or a lone letter is not one: an abbreviations list, or a
 * transposed schedule's column of attribute names, read as a table under a
 * family's title has rows, but no unit's mark among them. */
export function readsAsMark(key: string): boolean {
  return String(key ?? "").split("/").map((p) => p.trim())
    .some((p) => isEquipTag(p) || isEquipTag(p.replace(/^[A-Z0-9]{1,6}[-.](?=[A-Z])/i, "")));
}

/** The families a schedule's title names, as the compile reads titles. */
function titleFamilies(title: string): string[] {
  return Object.entries(HVAC_FAMILY_SPECS as Record<string, { titleRe?: RegExp; exclude?: RegExp }>)
    .filter(([, s]) => s.titleRe?.test(title) && !s.exclude?.test(title))
    .map(([family]) => family);
}

/** The box every cell of a row covers, when its cells carry boxes. */
function rowBox(row: NonNullable<TableLike["rows"]>[number]): [number, number, number, number] | null {
  const boxes = Object.values(row.cells ?? {}).map((c) => c?.bbox).filter((b): b is Box => Array.isArray(b) && b.length === 4);
  if (!boxes.length) return null;
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
}

const centreIn = (b: Box, box: readonly number[]): boolean => {
  const x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2;
  return x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
};

/** The schedules titled as a family the takeoff reads whose rows it reads
 * as no unit. A row is a unit's when a compiled row sits in it (the
 * compiled mark's box is inside the row) or a compiled row carries its mark
 * (the same unit printed twice). What is left is named only when its key
 * reads as a mark (readsAsMark); a points list is never a schedule of units.
 * `compiled` is the hvac_equipment compile and `graph` the sheet graph it
 * was compiled from. */
export function scheduleRowsLeftOut(
  compiled: { categories?: Record<string, { items?: readonly ItemLike[] }> },
  graph: { tables?: readonly TableLike[] },
): RowsLeftOut[] {
  const items = Object.values(compiled.categories ?? {}).flatMap((c) => c.items ?? []);
  const carried = new Set(items.map((it) => markId(it.tag)).filter(Boolean));
  const out: RowsLeftOut[] = [];
  for (const t of graph.tables ?? []) {
    const title = String(t.title?.text ?? "").trim();
    if (!title || isBasPointsListTitle(title) || isBasPointsListTable(t)) continue;
    const families = titleFamilies(title);
    if (!families.length) continue;
    const placed = items.filter((it) => it.sheet_id === t.sheet && Array.isArray(it.bbox_px) && it.bbox_px.length === 4);
    let rows = 0;
    const marks: string[] = [];
    for (const r of t.rows ?? []) {
      const key = String(r.key ?? "").trim();
      const id = markId(key);
      if (!id || isScheduleHeaderJunkMark(String(normalizeEquipMark(key)).toUpperCase().replace(/\s+/g, ""))) continue;
      rows++;
      if (carried.has(id)) continue;
      const box = rowBox(r);
      if (box && placed.some((it) => centreIn(it.bbox_px!, box))) continue;
      if (readsAsMark(key)) marks.push(key);
    }
    if (marks.length) out.push({ sheet: t.sheet, title, families, rows, marks });
  }
  return out;
}

/** The families a library prices: those its assemblies name, never "ANY"
 * (a part for any family's assembly). */
export function pricedFamilies(library: readonly Pick<AssemblyDefinition, "applies_to">[]): Set<string> {
  return new Set(library.flatMap((d) => familiesOf(d)).filter((f) => f !== "ANY"));
}

/** The left-out rows of the families `priced` holds: a schedule of a family
 * no assembly prices would add no record, however its rows were read. */
export function rowsLeftOutPriced(left: readonly RowsLeftOut[] | undefined, priced: ReadonlySet<string>): RowsLeftOut[] {
  const out: RowsLeftOut[] = [];
  for (const e of left ?? []) {
    const families = e.families.filter((f) => priced.has(f));
    if (families.length) out.push({ ...e, families });
  }
  return out;
}
