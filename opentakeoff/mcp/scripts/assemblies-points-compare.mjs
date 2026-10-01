// ASSEMBLIES goal, instrument 4 — the POINTS COMPARE (goals/ASSEMBLIES.md
// MEASURE 4 and WP6; GATE 6 is read from it).
//
// SHOULD THIS BE ON THE SHARED PATH? What it compares is shared: the apply
// path (web/src/lib/assemblies/apply.ts) over the compile, and the printed
// points-list rows the BAS points compile maps to the equipment they serve
// (corpusTakeoff.mjs, read-only), carried in the same CompiledProject. The
// comparison below is eval-only; no surface imports it.
//
//   node --import tsx scripts/assemblies-points-compare.mjs <corpus-dir> [setId ...]
//        [--heldout] [--report]
//
// Per unit that a printed list names: the points its typical gives (the
// typical's point lines, applied WITHOUT the printed evidence, so D6 does not
// replace them) against the printed rows, counted by I/O type per unit (the
// lines' quantity over the row's multiplier). A unit whose record is decided
// agrees when all four counts match. Every other unit is a diff, and every
// diff needs a class and its evidence in
// reports/assemblies/06-points-diffs.csv (set, tag, class, evidence):
//   typical_gap        the library lacks a point a public source requires
//                      (the fix is a library change citing that source);
//   project_specific   this project's list differs from the typical for a
//                      project reason (recorded as a project fact);
//   extraction_error   the list, its rows or their unit were read wrong
//                      (catalogued; owned by the compile's loop);
//   typical_unresolved the unit's record is not decided, so it has no
//                      typical points to compare.
// Printed rows whose unit matches no scheduled row are listed apart.
//
// The documents: every dev document of the frozen split and every present
// corpus document outside it whose compile maps printed rows to a unit, as
// the WP0.1 baseline counted them (reports/assemblies/00-baseline.json,
// per_set[].points_lists.rows); the BAS points compile has not changed since.
// Held-out documents (--heldout) print per-family agreement only: never
// tuned on.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotInChild } from "./assemblies-attr-eval.mjs";
import { applyAssemblies, instancesOf, normalizeProject } from "../../web/src/lib/assemblies/apply.ts";
import { sanitizeAssemblyDefinitions } from "../../web/src/lib/assemblies/schema.ts";

export const IO_TYPES = ["AI", "AO", "BI", "BO"];
export const CLASSES = ["typical_gap", "project_specific", "extraction_error", "typical_unresolved"];

const zero = () => ({ AI: 0, AO: 0, BI: 0, BO: 0 });

/** One document's comparison: a row per unit a printed list names (in the
 * controls layer), and the printed rows that name no scheduled unit. */
export function comparePoints({ setId, snapshot, library, normalized: given = null }) {
  const project = { items: snapshot.items, tables: snapshot.tables, pages: snapshot.pages, printed_points: [] };
  const normalized = given ?? normalizeProject(project);
  const { instances, applications, lines } = applyAssemblies({ project, library, normalized });
  // Which unit each printed row names: the apply path's own matching.
  const named = instancesOf({ ...project, printed_points: snapshot.printed_points ?? [] }, normalized);
  const units = [];
  const matched = new Set();
  instances.forEach((inst, i) => {
    const rows = named[i].printed_points;
    if (!rows.length) return;
    for (const r of rows) matched.add(r);
    const app = applications.find((a) => a.layer === "controls" && a.instance.tag === inst.tag && JSON.stringify(a.instance.cites[0]) === JSON.stringify(inst.cites[0]));
    const mine = lines.filter((l) => l.kind === "point" && l.layer === "controls" && l.tag === inst.tag && JSON.stringify(l.cites[0]) === JSON.stringify(inst.cites[0]));
    const per = inst.multiplier?.value || 1;
    const typical = zero();
    let unknown = 0;
    for (const l of mine) {
      if (!l.io || !IO_TYPES.includes(l.io)) continue;
      if (l.qty_base === null) { unknown += 1; continue; }
      typical[l.io] += l.qty_base / per;
    }
    const printed = { ...zero(), other: 0 };
    for (const r of rows) printed[r.io ?? "other"] += 1;
    const decided = !!app && (app.status === "ok" || app.status === "overridden");
    const diff = Object.fromEntries(IO_TYPES.map((io) => [io, typical[io] - printed[io]]));
    units.push({
      set: setId, tag: inst.tag, family: inst.family, compiled_family: inst.compiled_family,
      assembly: app?.assembly ? `${app.assembly.id}@${app.assembly.version}` : null,
      status: app?.status ?? "no_assembly",
      typical, typical_unknown: unknown, printed, diff,
      agree: decided && !unknown && !printed.other && IO_TYPES.every((io) => diff[io] === 0),
      typical_points: mine.map((l) => ({ label: l.label, io: l.io, qty: l.qty_base === null ? null : l.qty_base / per, status: l.status, rule: l.rule })),
      printed_rows: rows.map((r) => ({ point: r.point, io: r.io, description: r.description, list: r.list_title, sheet: r.sheet_id })),
    });
  });
  const unmatched = new Map();
  for (const r of snapshot.printed_points ?? []) {
    if (matched.has(r)) continue;
    const k = r.unit;
    if (!unmatched.has(k)) unmatched.set(k, { unit: k, rows: 0, lists: new Set() });
    const u = unmatched.get(k);
    u.rows += 1;
    u.lists.add(`${r.sheet_id} · ${r.list_title}`);
  }
  return {
    units,
    printed_rows: (snapshot.printed_points ?? []).length,
    unmatched: [...unmatched.values()].map((u) => ({ ...u, lists: [...u.lists] })).sort((a, b) => a.unit.localeCompare(b.unit)),
  };
}

/** The documents a side compares: those the WP0.1 census counted printed
 * points-list rows on. Dev takes the dev split plus any present document
 * outside the split; held-out takes the held-out split only. */
export function documentsToCompare(split, baseline, side) {
  const heldout = new Set(split.heldout.sets);
  const withLists = new Set((baseline.per_set ?? []).filter((s) => (s.points_lists?.rows ?? 0) > 0).map((s) => s.id));
  const pool = side === "heldout" ? split.heldout.sets : [...new Set([...split.dev.sets, ...withLists])].filter((id) => !heldout.has(id));
  return pool.filter((id) => withLists.has(id));
}

/** The diffs to classify: every unit that does not agree. */
export function diffsOf(units) {
  return units.filter((u) => !u.agree);
}

/** reports/assemblies/06-points-diffs.csv: set,tag,class,evidence. */
export function parseClassification(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#") || /^set,tag,/.test(line)) continue;
    const m = line.match(/^([^,]+),([^,]+),([^,]+),(.*)$/);
    if (!m) continue;
    const [, set, tag, cls, evidence] = m;
    out.set(`${set}|${tag}`, { class: cls.trim(), evidence: evidence.trim().replace(/^"|"$/g, "") });
  }
  return out;
}

/** Agreement per family (tracked, no target) and the GATE 6 classification
 * check: every diff classified, with evidence, in a known class. */
export function summarizePoints(units, classification) {
  const byFamily = new Map();
  for (const u of units) {
    const f = byFamily.get(u.family) ?? { units: 0, decided: 0, agree: 0 };
    f.units += 1;
    if (u.status === "ok" || u.status === "overridden") f.decided += 1;
    if (u.agree) f.agree += 1;
    byFamily.set(u.family, f);
  }
  const diffs = diffsOf(units);
  const unclassified = [];
  const byClass = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  for (const d of diffs) {
    const c = classification.get(`${d.set}|${d.tag}`);
    if (!c || !CLASSES.includes(c.class) || !c.evidence) { unclassified.push(d); continue; }
    byClass[c.class] += 1;
  }
  return { units: units.length, agree: units.filter((u) => u.agree).length, diffs: diffs.length, by_class: byClass, unclassified, by_family: byFamily };
}

function renderText(results, summary, { side }) {
  const L = [];
  L.push(`POINTS COMPARE (${side}): typical point lines vs printed points lists, per unit, by I/O type`);
  for (const r of results) {
    // Held-out: counts only, never a tag (the split's rule: aggregates at gates).
    const names = side === "dev" && r.unmatched.length ? ` (${r.unmatched.slice(0, 12).map((u) => `${u.unit}×${u.rows}`).join(", ")}${r.unmatched.length > 12 ? ", …" : ""})` : "";
    L.push(`  ${r.id}: ${r.printed_rows} printed rows; ${r.units.length} units named; ${r.unmatched.length} printed unit(s) naming no scheduled row${names}`);
  }
  L.push("");
  L.push("family                    units  decided  agree");
  for (const [f, s] of [...summary.by_family].sort()) L.push(`  ${f.padEnd(24)} ${String(s.units).padStart(5)}  ${String(s.decided).padStart(7)}  ${String(s.agree).padStart(5)}`);
  L.push(`  ${"TOTAL".padEnd(24)} ${String(summary.units).padStart(5)}  ${" ".repeat(7)}  ${String(summary.agree).padStart(5)}`);
  if (side === "dev") {
    const diffs = results.flatMap((r) => diffsOf(r.units));
    if (diffs.length) {
      L.push("");
      L.push(`diffs (${diffs.length}):`);
      for (const d of diffs) {
        const t = IO_TYPES.map((io) => `${io} ${d.typical[io]}/${d.printed[io]}`).join(" ");
        L.push(`  ${d.set} | ${d.tag} (${d.family}) ${d.assembly ?? d.status}: typical/printed ${t}${d.printed.other ? ` other ${d.printed.other}` : ""}${d.typical_unknown ? ` unknown ${d.typical_unknown}` : ""}`);
      }
    }
  }
  L.push("");
  L.push(summary.units === 0
    ? `GATE 6 (${side}): no unit to compare. No document maps a printed points list to a scheduled unit, so there is no evidence and this is not a pass.`
    : `GATE 6 (${side}): ${summary.diffs} diffs, ${summary.diffs - summary.unclassified.length} classified with evidence (${CLASSES.map((c) => `${c} ${summary.by_class[c]}`).join(", ")}); ${summary.unclassified.length} unclassified → ${summary.unclassified.length ? "FAIL" : "PASS"} (agreement tracked, no target)`);
  return L.join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const [corpusDir, ...only] = argv.filter((a) => !a.startsWith("--"));
  if (!corpusDir) {
    console.error("usage: node --import tsx scripts/assemblies-points-compare.mjs <corpus-dir> [setId ...] [--heldout] [--report]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
  const side = flag("--heldout") ? "heldout" : "dev";
  const split = JSON.parse(readFileSync(join(corpus, "reports", "assemblies", "01-split.json"), "utf8"));
  const baseline = JSON.parse(readFileSync(join(corpus, "reports", "assemblies", "00-baseline.json"), "utf8"));
  const heldout = new Set(split.heldout.sets);
  const setIds = only.length ? only : documentsToCompare(split, baseline, side);
  const bad = only.filter((id) => (side === "heldout") !== heldout.has(id));
  if (bad.length) {
    console.error(`not ${side} documents: ${bad.join(", ")}`);
    process.exit(2);
  }
  const lib = resolve(fileURLToPath(new URL("../../web/src/lib/assemblies/", import.meta.url)));
  const { assemblies: library, rejected } = sanitizeAssemblyDefinitions([
    ...JSON.parse(readFileSync(join(lib, "starter", "us-typicals-v1.json"), "utf8")).assemblies,
    ...JSON.parse(readFileSync(join(lib, "starter", "us-hookups-v1.json"), "utf8")).assemblies,
  ]);
  if (rejected.length) {
    console.error(`the library gate rejected ${rejected.length} assemblies`);
    process.exit(2);
  }
  const results = [];
  const errors = [];
  for (const id of setIds) {
    const snap = await snapshotInChild(corpus, id);
    if (snap.error) { errors.push({ id, error: snap.error.split("\n")[0] }); continue; }
    results.push({ id, ...comparePoints({ setId: id, snapshot: snap, library }) });
  }
  const classPath = join(corpus, "reports", "assemblies", "06-points-diffs.csv");
  const classification = existsSync(classPath) ? parseClassification(readFileSync(classPath, "utf8")) : new Map();
  const units = results.flatMap((r) => r.units);
  const summary = summarizePoints(units, classification);
  const text = renderText(results, summary, { side });
  console.log(text);
  if (errors.length) {
    console.log(`\nERRORS (${errors.length}) — not compared, so no gate can pass:`);
    for (const e of errors) console.log(`  ${e.id}: ${e.error}`);
  }
  if (flag("--report")) {
    const dir = join(corpus, "reports", "assemblies");
    mkdirSync(dir, { recursive: true });
    const json = {
      generated_at: new Date().toISOString(), side, documents: setIds, errors,
      census: "reports/assemblies/00-baseline.json per_set[].points_lists.rows (WP0.1)",
      total: { units: summary.units, agree: summary.agree, diffs: summary.diffs, by_class: summary.by_class, unclassified: summary.unclassified.length },
      verdict: summary.units === 0 ? "no_evidence" : summary.unclassified.length ? "fail" : "pass",
      by_family: Object.fromEntries(summary.by_family),
      ...(side === "dev" ? { documents_detail: results } : {}),
    };
    const base = join(dir, `06-points-compare-${side}`);
    writeFileSync(`${base}.json`, `${JSON.stringify(json, null, 2)}\n`);
    writeFileSync(`${base}.md`, `# Points compare — ${side}\n\n\`\`\`\n${text}\n\`\`\`\n`);
    console.log(`\nwrote ${base}.json and .md`);
  }
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("assemblies-points-compare.mjs")) await main();
