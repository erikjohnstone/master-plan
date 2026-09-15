// Scored evaluation for the "which drawn equipment does this drawn device
// connect to" relation (PLAN_CONNECTIVITY_SERVES.md Phase 0 — "the ruler
// before the fix") against REAL plan sets. Mirrors mep-trace-eval.mjs's own
// conventions exactly: the corpus lives OUTSIDE this repo, the key is
// authored by RENDERING the real sheet and looking at it (never by trusting
// any tool's own output as its own ground truth), and this script is
// deliberately a dumb, stable ruler — do not "improve" the scorer to make a
// run look better; register a new case instead, same discipline as every
// other eval in this project.
//
//   node --import tsx scripts/serves-eval.mjs <corpus-dir> [setId ...] [--report]
//
// Phase 0's baseline is explicitly HAND-SEEDED, not device-discovery-driven
// (device discovery/ports is Phase 4): for every row on a sheet, the seed is
// the row's own device_x/device_y and the equipment CANDIDATE LIST is every
// DISTINCT equipment placement the key itself documents anywhere on that
// sheet (collected from every "served" row's equipment_tag/x/y, deduped by
// tag+coords) — i.e. the same "equipment already swept" input
// trace_connectivity always required, just sourced from the hand-authored
// key instead of a live symbol_sweep. This intentionally measures
// TODAY'S trace_connectivity against a device-shaped seed, not a click-shaped
// one — the gap between this number and a later phase's is the plan's own
// yardstick for progress.
//
// FOUR things scored, kept structurally separate (mirrors mep-trace-eval.mjs's
// own three-way split, plus one extra):
//
//   1. SERVED-correct — of rows expecting "served", how many named the right
//      equipment (status "reached" AND reached_equipment.id === equipment_tag)?
//   2. REFUSAL-correct — of rows expecting "ambiguous"/"unconnected"/"refused"
//      (mapped onto trace_connectivity's own ambiguous/dead_end/refused
//      vocabulary), how many actually returned exactly that?
//   3. FALSE-CONFIDENT — rows that reached SOME equipment, but the WRONG one.
//      Scored apart from served-correct on purpose: a confidently wrong
//      answer is a materially worse failure than an honest dead_end/refused,
//      and blending the two would hide exactly the failure mode
//      mepconnectivity.ts's own refusal doctrine exists to surface.
//   4. PATH-COLLISION — a sanity check, not a key expectation: if two
//      DIFFERENT device rows on the same sheet produced a "reached" result
//      whose walked NODE PATH is identical, but they were checked against
//      (or reached) two DIFFERENT equipment ids, that is an internal
//      inconsistency worth a human look (same path, different conclusion),
//      never something a key row asserts directly.
//
// Key format (CSV, header row required) — keys/<id>.serves.csv:
//   sheet, device_tag, device_x, device_y, equipment_tag, equipment_x,
//   equipment_y, relation, expect_status, note
//     sheet              sheet key exactly as load_plan/sheet_info report it
//                        (<pdf-filename>#<page>, matching *.mep.csv's own convention)
//     device_x, device_y image px (RENDER_SCALE 2.0), the device's OWN glyph
//     equipment_tag/x/y  blank unless expect_status is "served"
//     relation           ducted | piped | controls (recorded, not yet scored
//                        separately — Phase 5 is where "controls" needs its
//                        own dashed-line-aware path; today's trace has no
//                        line-style signal at all, so every relation is run
//                        through the exact same call and the miss list says
//                        which relation a failure came from)
//     expect_status      served | ambiguous | unconnected | refused
//     note               why this key row is true — how it was verified
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveSetFiles } from "./corpusFiles.mjs";
import { Session } from "../src/session.ts";

const [corpusDir, ...only] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const writeReport = process.argv.includes("--report");
if (!corpusDir) {
  console.error("usage: node --import tsx scripts/serves-eval.mjs <corpus-dir> [setId ...] [--report]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));

function readCsv(path) {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') { q = !q; continue; }
      if (ch === "," && !q) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

// trace_connectivity's own status vocabulary vs. this key's — kept as two
// separate vocabularies on purpose (the key's is relation-agnostic English;
// the tool's is what it actually returns) rather than silently renaming one
// to the other, so a future relation with its own status shape (e.g. a
// controls-specific one) doesn't quietly inherit this mapping by accident.
const EXPECT_TO_STATUS = {
  served: "reached",
  ambiguous: "ambiguous",
  unconnected: "dead_end",
  refused: "refused",
};

const pct = (n) => (n * 100).toFixed(1).padStart(5) + "%";
const pathKey = (path) => (Array.isArray(path) ? path.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("|") : null);

async function evalSet(set, key) {
  const s = new Session();
  const files = resolveSetFiles(corpus, spec, set);
  for (let i = 0; i < files.length; i++) await s.loadPlan(files[i], { merge: i > 0 });

  const out = { id: set.id, gc: set.gc, project: set.project, misses: [] };

  // Per-sheet equipment candidate list — every DISTINCT (tag, x, y) any
  // "served" row on that sheet names, deduped. This is the Phase 0 stand-in
  // for real device/equipment discovery (Phase 4).
  const equipBySheet = new Map();
  for (const row of key) {
    if (row.expect_status !== "served") continue;
    if (!row.equipment_tag || row.equipment_x === "" || row.equipment_y === "") continue;
    let list = equipBySheet.get(row.sheet);
    if (!list) { list = []; equipBySheet.set(row.sheet, list); }
    const at = [Number(row.equipment_x), Number(row.equipment_y)];
    const dupe = list.some((e) => e.id === row.equipment_tag && Math.abs(e.at[0] - at[0]) < 0.5 && Math.abs(e.at[1] - at[1]) < 0.5);
    if (!dupe) list.push({ id: row.equipment_tag, at });
  }

  let servedTp = 0, servedFn = 0, refuseTp = 0, refuseFn = 0, falseConfident = 0;
  const pathToIds = new Map(); // sheet -> pathKey -> Set(equipment ids reached)
  for (const row of key) {
    const equipment = equipBySheet.get(row.sheet) ?? [];
    const expect = row.expect_status;
    let r;
    try {
      r = await s.traceConnectivity(row.sheet, {
        from: [Number(row.device_x), Number(row.device_y)],
        equipment,
      });
    } catch (e) {
      r = { status: "refused", reason: String(e.message || e) };
    }

    if (r.status === "reached" && Array.isArray(r.path)) {
      let bySheet = pathToIds.get(row.sheet);
      if (!bySheet) { bySheet = new Map(); pathToIds.set(row.sheet, bySheet); }
      const pk = pathKey(r.path);
      let ids = bySheet.get(pk);
      if (!ids) { ids = new Set(); bySheet.set(pk, ids); }
      ids.add(r.reachedEquipment?.id ?? "?");
    }

    if (expect !== "served") {
      const wantStatus = EXPECT_TO_STATUS[expect];
      if (r.status === wantStatus) refuseTp++;
      else {
        refuseFn++;
        out.misses.push({
          kind: "refusal-not-honored", sheet: row.sheet, device: row.device_tag, relation: row.relation,
          want: expect, got: r.status, note: row.note,
        });
      }
      continue;
    }
    // expect === "served"
    if (r.status === "reached" && r.reachedEquipment?.id === row.equipment_tag) { servedTp++; continue; }
    if (r.status === "reached") {
      falseConfident++;
      out.misses.push({
        kind: "false-confident", sheet: row.sheet, device: row.device_tag, relation: row.relation,
        want: row.equipment_tag, got: r.reachedEquipment?.id, confidence: r.confidence, note: row.note,
      });
      continue;
    }
    servedFn++;
    out.misses.push({
      kind: "served-missed", sheet: row.sheet, device: row.device_tag, relation: row.relation,
      want: row.equipment_tag, got: r.status, reason: r.reason, note: row.note,
    });
  }

  let pathCollisions = 0;
  for (const [sheet, bySheet] of pathToIds) {
    for (const [pk, ids] of bySheet) {
      if (ids.size > 1) {
        pathCollisions++;
        out.misses.push({ kind: "path-collision", sheet, want: "-", got: `identical path claimed for [${[...ids].join(", ")}]` });
      }
    }
  }

  const servedN = servedTp + servedFn, refuseN = refuseTp + refuseFn;
  out.served = servedN ? { tp: servedTp, fn: servedFn, recall: servedTp / servedN } : null;
  out.refusal = refuseN ? { tp: refuseTp, fn: refuseFn, recall: refuseTp / refuseN } : null;
  out.false_confident = falseConfident;
  out.path_collisions = pathCollisions;
  out.cases = key.length;
  return out;
}

const wanted = spec.sets.filter((s) => !only.length || only.includes(s.id));
const results = [];
for (const set of wanted) {
  const key = readCsv(join(corpus, "keys", `${set.id}.serves.csv`));
  if (!key) { results.push({ id: set.id, gc: set.gc, project: set.project, unlabelled: true }); continue; }
  process.stderr.write(`· ${set.id} (${key.length} rows) …\n`);
  try { results.push(await evalSet(set, key)); }
  catch (e) { results.push({ id: set.id, gc: set.gc, project: set.project, error: String(e.message || e) }); }
}

const lines = [];
const say = (l = "") => { lines.push(l); console.log(l); };

say("╔══════════════════════════════════════════════════════════════════════════");
say("║ SERVES — which drawn equipment does this drawn device connect to");
say("║ (hand-seeded baseline: PLAN_CONNECTIVITY_SERVES.md Phase 0)");
say("╚══════════════════════════════════════════════════════════════════════════");
say("");
say("set                          rows   served R   refusal R   false-conf   path-coll");
say("──────────────────────────────────────────────────────────────────────────────────");
const agg = { stp: 0, sfn: 0, ftp: 0, ffn: 0, fc: 0, pc: 0, rows: 0 };
for (const r of results) {
  if (r.error) { say(`${r.id.padEnd(28)} ERROR: ${r.error.slice(0, 60)}`); continue; }
  if (r.unlabelled) { say(`${r.id.padEnd(28)} (no key yet)`); continue; }
  if (r.served) { agg.stp += r.served.tp; agg.sfn += r.served.fn; }
  if (r.refusal) { agg.ftp += r.refusal.tp; agg.ffn += r.refusal.fn; }
  agg.fc += r.false_confident; agg.pc += r.path_collisions; agg.rows += r.cases;
  say(`${r.id.padEnd(28)}${String(r.cases).padStart(5)}   ${r.served ? pct(r.served.recall) : "    —"}     ${r.refusal ? pct(r.refusal.recall) : "    —"}      ${String(r.false_confident).padStart(6)}      ${String(r.path_collisions).padStart(5)}`);
}
say("──────────────────────────────────────────────────────────────────────────────────");
const servedTotal = agg.stp + agg.sfn, refuseTotal = agg.ftp + agg.ffn;
const sR = servedTotal ? pct(agg.stp / servedTotal) : "    —", fR = refuseTotal ? pct(agg.ftp / refuseTotal) : "    —";
say(`${"CORPUS".padEnd(28)}${String(agg.rows).padStart(5)}   ${sR}     ${fR}      ${String(agg.fc).padStart(6)}      ${String(agg.pc).padStart(5)}`);
say("");
say(`served     ${agg.stp} reached the right equipment · ${agg.sfn} missed (dead_end/wrong-status when a real connection exists)`);
say(`refusal    ${agg.ftp} correctly ambiguous/dead_end/refused as the key expects · ${agg.ffn} confidently answered when they should not have`);
say(`false-conf ${agg.fc} row(s) reached SOME equipment, but the WRONG one — scored apart from served-correct on purpose`);
say(`path-coll  ${agg.pc} sanity-check hit(s): the identical walked path was evidence for two different equipment ids`);
say("");

if (results.some((r) => r.misses?.length)) {
  say("── every miss, named ──");
  for (const r of results) for (const m of r.misses ?? []) {
    say(`  [${m.kind}] ${r.id} ${m.sheet}${m.device ? ` device=${m.device}` : ""}${m.relation ? ` (${m.relation})` : ""} — want ${m.want ?? "(refusal)"} got ${m.got}${m.confidence != null ? ` (confidence ${m.confidence})` : ""}`);
    if (m.note) say(`      ${m.note}`);
  }
}

if (writeReport) {
  const p = join(corpus, "reports", `SERVES-EVAL-${new Date(spec.stamp ?? Date.now()).toISOString().slice(0, 10)}.txt`);
  writeFileSync(p, lines.join("\n"));
  console.error(`\nwrote ${p}`);
}
process.exit(0);
