// Scoring logic for the project-level takeoff pipeline (mcp/scripts/takeoff-eval.mjs).
// Pulled out into its own module — not inlined into the CLI script the way
// graph-eval.mjs/mep-trace-eval.mjs do it — specifically so this comparison
// math gets a real regression test (test/takeoffEval.test.ts) against a small
// synthetic key + synthetic pipeline output, per this initiative's own
// standing instruction. The CLI script imports this unchanged; nothing here
// talks to a Session, a PDF, or the filesystem — pure data in, pure data out,
// so a wrong number here is a wrong number in this math, never a fixture or
// a real plan set.
import type { FailureType, PlanSetTakeoff } from "./takeoff.ts";

export interface TakeoffKeyRow {
  tag: string;
  equipment_type: string;
  expected_quantity: number;
  sheets: string[];
  notes: string;
  expected_status?: "resolved" | "refused" | "not_in_output";
}

export interface TagScore {
  tag: string;
  expected: number;
  actual: number;
  delta: number;          // actual - expected; positive = over-counted, negative = under-counted
  exact: boolean;
  status: "resolved" | "refused" | "error" | "not_in_output";
  expected_status: "resolved" | "refused" | "not_in_output";
}

export interface FalseAdd {
  tag: string;
  equipment_type: string | null;
  quantity: number;
}

export interface TakeoffScore {
  per_tag: TagScore[];
  missing: string[];              // key tags with NO item at all in the pipeline's output (out of scope, or the table itself was never seen)
  falsely_added: FalseAdd[];      // resolved pipeline items, quantity > 0, whose tag the key never mentions
  failure_breakdown: Partial<Record<FailureType, number>>;
  summary: {
    total_tags: number;           // key.length
    exact_matches: number;
    exact_match_pct: number;      // 0..1
    total_quantity_delta: number; // sum of |delta| across every key tag (not the falsely-added ones — those are named separately)
    applicable_tags: number;
    applicable_exact_matches: number;
    applicable_exact_match_pct: number;
    expected_refusals: number;
    correct_refusals: number;
  };
}

/** Canonical tag form — same normalization takeoff.ts itself applies before
 * dedup/lookup, so a key authored with stray whitespace or lowercase still
 * lines up with the pipeline's own tag strings. */
export const canonTag = (t: string): string => (t || "").trim().toUpperCase().replace(/\s+/g, "");

/** Minimal CSV reader for `*.takeoff.csv` keys: a header row, quoted fields
 * may contain commas, and — new for this key format, not shared with
 * graph-eval.mjs's stricter reader — a line whose first non-space character
 * is "#" is a comment and a blank line is skipped. Both let a key file carry
 * the kind of header block bessemer.takeoff.csv actually has (how each
 * number was verified) without smuggling it into the data rows. */
export function parseTakeoffKeyCsv(text: string, path = "<key>"): TakeoffKeyRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  if (lines.length < 2) return [];
  const splitCsv = (l: string): string[] => {
    const cells: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') {
        if (q && l[i + 1] === '"') { cur += '"'; i++; continue; }
        q = !q; continue;
      }
      if (ch === "," && !q) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    return cells;
  };
  const head = splitCsv(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => head.indexOf(name);
  const iTag = idx("tag"), iType = idx("equipment_type"), iQty = idx("expected_quantity"),
    iSheets = idx("sheets"), iNotes = idx("notes"), iStatus = idx("expected_status");
  // A missing/misspelled required column used to default every row to
  // tag:"" / expected_quantity:0 via the ?? "" fallbacks below — silent, and
  // indistinguishable from a real key stating "expected 0". Fail loudly and
  // by name instead.
  const missing = [iTag < 0 && "tag", iQty < 0 && "expected_quantity"].filter(Boolean);
  if (missing.length) {
    throw new Error(`${path}: missing required column(s) ${missing.join(", ")} — header reads: ${head.join(",")}`);
  }
  return lines.slice(1).map((l) => {
    const c = splitCsv(l);
    return {
      tag: (c[iTag] ?? "").trim(),
      equipment_type: (c[iType] ?? "").trim(),
      expected_quantity: Number((c[iQty] ?? "0").trim()) || 0,
      sheets: (c[iSheets] ?? "").split(";").map((s) => s.trim()).filter(Boolean),
      notes: (c[iNotes] ?? "").trim(),
      expected_status: (["refused", "not_in_output"].includes((c[iStatus] ?? "").trim().toLowerCase())
        ? (c[iStatus] ?? "").trim().toLowerCase()
        : "resolved") as TakeoffKeyRow["expected_status"],
    };
  });
}

/** The actual comparison: a takeoff pipeline result against a hand-verified
 * key. Every number here is deterministic and re-derivable from the two
 * inputs alone — no fabricated pass/fail, no smoothing a real mismatch into
 * a rounder number. */
export function scoreTakeoff(takeoff: Pick<PlanSetTakeoff, "items" | "failures">, key: TakeoffKeyRow[]): TakeoffScore {
  const itemByTag = new Map(takeoff.items.map((it) => [canonTag(it.tag), it] as const));
  const keyTags = new Set(key.map((k) => canonTag(k.tag)));

  const per_tag: TagScore[] = key.map((k) => {
    const t = canonTag(k.tag);
    const item = itemByTag.get(t);
    const expectedStatus = k.expected_status ?? "resolved";
    const actual = item?.status === "resolved" ? item.quantity : 0;
    const status: TagScore["status"] = !item ? "not_in_output" : (item.status as TagScore["status"]);
    const delta = expectedStatus === "resolved" ? actual - k.expected_quantity : 0;
    const exact = expectedStatus === "resolved"
      ? status === "resolved" && delta === 0
      : expectedStatus === "refused"
        ? status === "refused"
        : status === "not_in_output";
    return { tag: k.tag, expected: k.expected_quantity, actual, delta, exact, status, expected_status: expectedStatus };
  });

  const missing = key
    .filter((k) => (k.expected_status ?? "resolved") !== "not_in_output" && !itemByTag.has(canonTag(k.tag)))
    .map((k) => k.tag);

  const falsely_added: FalseAdd[] = takeoff.items
    .filter((it) => it.status === "resolved" && it.quantity > 0 && !keyTags.has(canonTag(it.tag)))
    .map((it) => ({ tag: it.tag, equipment_type: it.equipment_type, quantity: it.quantity }));

  const failure_breakdown: Partial<Record<FailureType, number>> = {};
  for (const f of takeoff.failures) failure_breakdown[f.type] = (failure_breakdown[f.type] ?? 0) + 1;

  const exact_matches = per_tag.filter((t) => t.exact).length;
  const total_quantity_delta = per_tag.reduce((n, t) => n + Math.abs(t.delta), 0);
  const applicable = per_tag.filter((t) => t.expected_status === "resolved");
  const applicable_exact_matches = applicable.filter((t) => t.exact).length;
  const refusalRows = per_tag.filter((t) => t.expected_status === "refused");

  return {
    per_tag,
    missing,
    falsely_added,
    failure_breakdown,
    summary: {
      total_tags: key.length,
      exact_matches,
      exact_match_pct: key.length ? exact_matches / key.length : 0,
      total_quantity_delta,
      applicable_tags: applicable.length,
      applicable_exact_matches,
      applicable_exact_match_pct: applicable.length ? applicable_exact_matches / applicable.length : 0,
      expected_refusals: refusalRows.length,
      correct_refusals: refusalRows.filter((t) => t.exact).length,
    },
  };
}
