// Scoring logic for the tag ground-truth key (mcp/scripts/tag-eval.mjs).
// plans/03-drawing-tag-recognition-audit.md §3.8 (WP7): does WP2's
// buildTagIndex (web/src/lib/tagIndex.ts, exposed as graph.tags) find the
// tags a human sees on the rendered sheet, and does it find ONLY those —
// the same recall-tier discipline table-recall-eval.mjs already established
// for schedule tables, applied to drawn tags instead. The key is authored
// by rendering the real sheet independently of the pipeline's own output
// (render-page-crop.mjs, never view_sheet's own graph-aware crop) and
// writing down what a human actually sees — see keys/<id>.tags.csv's own
// header comment in tag-eval.mjs for the exact column contract.
//
// Matching is sheet + canonical key identity only, deliberately mirroring
// tableRecallEval.ts's own {sheet, title} identity match rather than
// reinventing a bbox-proximity check: an early version of this module
// matched on bbox-center distance too, authored by hand-measuring pixel
// offsets on a render-page-crop.mjs crop and converting to PDF-point space.
// That measurement isn't reliable on this corpus's CAD-exported PDFs — a
// live check against real navfac/itd-d1-lab data found graph.tags entries
// whose point-space coordinates don't correspond 1:1 with a naive
// pixel/scale conversion off a single rendered page (some pages carry
// content in more than one coordinate regime, e.g. duplicate spans from
// overlaid form XObjects), so hand-authored bboxes were silently and
// systematically wrong, not just approximate. Sheet + identity is exactly
// what a human render-check can state with confidence; anything finer
// belongs to a different kind of test.
//
// Nothing here talks to a Session, a PDF, or the filesystem — pure data in,
// pure data out, same discipline as tableRecallEval.ts/takeoffEval.mjs.

export interface TagKeyRow {
  sheet: string;
  tag: string;
  role: string;
  in_table: boolean;
  note: string;
}

/** One DrawnTag as the scorer needs it — deliberately just the fields this
 * module reads, so it never needs to import tagIndex.ts's own types. */
export interface FoundTag {
  sheet: string;
  text: string;
  key: string;
  family: string;
  role: string;
  in_table: unknown;
  sheet_callout?: boolean;
}

export interface TagKeyRowScore extends TagKeyRow {
  status: "FOUND" | "MISSED";
  /** Present only when FOUND — the matched DrawnTag's own role, so a role
   * mismatch (same identity, wrong role) is visible without failing recall
   * outright; role/family breakdowns below are keyed on the KEY's own
   * stated role/family, not the match's. */
  foundRole?: string;
}

export interface TagExtra {
  sheet: string;
  text: string;
  role: string;
}

export interface StratumCount {
  found: number;
  total: number;
}

export interface TagEvalScore {
  perTag: TagKeyRowScore[];
  extras: TagExtra[];
  found: number;
  total: number;
  recallPct: number;
  /** Precision over drawn tags on sheets the key actually reviewed — an
   * extra is only scored (as a false positive) when its markKey/family
   * shape matches something the key was trying to enumerate on that sheet;
   * anything else on a keyed sheet is real content the key never claimed
   * to be exhaustive about, and stays unscored, matching
   * table-recall-eval.mjs's own "extras scoped to keyed sheets" rule. */
  precisionPct: number;
  byRole: Record<string, StratumCount>;
  byFamily: Record<string, StratumCount>;
}

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      if (quoted) {
        quoted = false;
      } else if (current.length === 0) {
        quoted = true;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

export function parseTagKeyCsv(text: string, path = "<key>"): TagKeyRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !/^\s*#/.test(line));
  if (lines.length < 2) return [];
  const headers = splitCsv(lines[0]).map((h) => h.trim().toLowerCase());
  const need = ["sheet", "tag", "role", "in_table"];
  const idx: Record<string, number> = {};
  for (const col of need) idx[col] = headers.indexOf(col);
  const missing = need.filter((col) => idx[col] < 0);
  if (missing.length) {
    throw new Error(`${path}: tag key is missing required column(s): ${missing.join(", ")} — got: ${headers.join(", ") || "(no header row)"}`);
  }
  const noteIdx = headers.indexOf("note");
  return lines.slice(1).map((line) => {
    const cells = splitCsv(line);
    return {
      sheet: (cells[idx.sheet] ?? "").trim(),
      tag: (cells[idx.tag] ?? "").trim(),
      role: (cells[idx.role] ?? "").trim(),
      in_table: /^(true|1|yes)$/i.test((cells[idx.in_table] ?? "").trim()),
      note: (noteIdx >= 0 ? cells[noteIdx] ?? "" : "").trim(),
    };
  });
}

// markKey inlined (hyphen/space-insensitive identity) — this module must
// stay import-free of markid.ts so it never needs a Session or a live
// pipeline to test, matching every other *Eval.ts sibling.
const markKey = (s: string): string => (s || "").trim().toUpperCase().replace(/[\s-]+/g, "");

export function scoreTagEval(foundTags: FoundTag[], key: TagKeyRow[]): TagEvalScore {
  const bySheetKey = new Map<string, FoundTag[]>();
  for (const t of foundTags) {
    if (t.sheet_callout) continue;
    const k = `${t.sheet}::${t.key}`;
    const list = bySheetKey.get(k);
    if (list) list.push(t);
    else bySheetKey.set(k, [t]);
  }

  const byRole: Record<string, StratumCount> = {};
  const byFamily: Record<string, StratumCount> = {};
  const bump = (map: Record<string, StratumCount>, k: string, hit: boolean) => {
    const s = map[k] || (map[k] = { found: 0, total: 0 });
    s.total++;
    if (hit) s.found++;
  };

  const perTag: TagKeyRowScore[] = key.map((row) => {
    const k = `${row.sheet}::${markKey(row.tag)}`;
    const candidates = bySheetKey.get(k) || [];
    const hit = candidates[0];
    bump(byRole, row.role || "(unspecified)", !!hit);
    // canonicalLabelFamily is not reimplemented here (it lives in
    // symbollabels.ts, a real recognizer this module deliberately stays
    // independent of) — family breakdown groups by the KEY's own tag
    // prefix (the letters before the first digit/hyphen), a coarser but
    // dependency-free proxy good enough for a per-family table.
    const famMatch = row.tag.match(/^[A-Za-z]+/);
    bump(byFamily, famMatch ? famMatch[0].toUpperCase() : "(none)", !!hit);
    return { ...row, status: hit ? "FOUND" as const : "MISSED" as const, ...(hit ? { foundRole: hit.role } : {}) };
  });

  // Precision, scoped to keyed sheets AND to the tag families the key was
  // actually trying to enumerate there (its own tag prefixes) — anything
  // else found on a keyed sheet is real content the key never claimed
  // exhaustive coverage of, not a false positive. Both sides extract the
  // family prefix from the same RAW hyphenated shape (row.tag / t.text),
  // never from t.key (markKey's hyphen-stripped canonical form) — stripping
  // hyphens first merges a letter that precedes a numeric suffix into the
  // prefix (e.g. "AHU-A2" canonicalizes to "AHUA2", whose leading-letters
  // regex is "AHUA", not "AHU"), which silently excluded every navfac-style
  // "<FAMILY>-A#" tag from precision scoring entirely.
  const familyPrefix = (raw: string): string | null => raw.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() || null;
  const familiesBySheet = new Map<string, Set<string>>();
  const keyedIdentities = new Set<string>();
  for (const row of key) {
    keyedIdentities.add(`${row.sheet}::${markKey(row.tag)}`);
    const fam = familyPrefix(row.tag);
    if (!fam) continue;
    const set = familiesBySheet.get(row.sheet) ?? new Set<string>();
    set.add(fam);
    familiesBySheet.set(row.sheet, set);
  }
  // Grouped by DISTINCT (sheet, key), never by raw instance count: WP2's
  // buildTagIndex can (and does) record the same real drawn tag more than
  // once — separate recognition passes over the same glyph, or a genuinely
  // repeatable schedule/type mark (canonicalLabelFamily's own documented
  // "CD-1, RG-1 ... repeatable schedule/type identities" case, where one
  // diffuser type legitimately labels many physical fixtures). Either way
  // it is one real-world identity, already accounted for the moment its
  // key appears in the CSV — counting each raw duplicate as its own extra
  // penalized a set for finding the SAME correct tag more than once, not
  // for finding something wrong.
  const extras: TagExtra[] = [];
  let precisionDenominator = 0;
  let precisionHits = 0;
  for (const [sk, tags] of bySheetKey) {
    const [sheet] = sk.split("::");
    const families = familiesBySheet.get(sheet);
    if (!families) continue;
    const fam = familyPrefix(tags[0].text);
    if (!fam || !families.has(fam)) continue;
    precisionDenominator++;
    if (keyedIdentities.has(sk)) precisionHits++;
    else extras.push({ sheet: tags[0].sheet, text: tags[0].key, role: tags[0].role });
  }

  const found = perTag.filter((row) => row.status === "FOUND").length;
  return {
    perTag,
    extras,
    found,
    total: perTag.length,
    recallPct: perTag.length ? found / perTag.length : 1,
    precisionPct: precisionDenominator ? precisionHits / precisionDenominator : 1,
    byRole,
    byFamily,
  };
}
