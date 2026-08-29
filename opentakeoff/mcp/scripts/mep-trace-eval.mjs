// Scored evaluation for MEP connectivity tracing (maturity plan Phase 4)
// against REAL plan sets. Method, current results and known gaps:
// docs/MEP-CONNECTIVITY-EVAL.md
//
//   node --import tsx scripts/mep-trace-eval.mjs <corpus-dir> [setId ...]
//
// Mirrors graph-eval.mjs's own conventions exactly: the corpus lives OUTSIDE
// this repo, the key is authored by RENDERING the real sheet and looking at
// it (never by trusting trace_connectivity's own output as its own ground
// truth), and this script is deliberately a dumb, stable ruler — do not
// "improve" the scorer to make a run look better; register a new case
// instead, same discipline as every other eval in this project.
//
// THREE metrics, kept structurally separate (mirrors score.ts's own
// CONF_GATE_EXEMPT precedent — a passing-for-the-wrong-reason gate is
// itself a finding, not something to blend into one flattering number):
//
//   1. REACH accuracy — of the cases the key says should reach a specific
//      equipment id, how many actually did? This is the number that says
//      "the trace goes where the drawing says it should."
//   2. REFUSAL correctness — of the cases the key says should refuse (no
//      linework at the seed, no vector linework at all, etc.), how many
//      actually refused, rather than confidently guessing something?
//   3. FALSE-CONFIDENT rate — cases that reached SOME equipment, but the
//      WRONG one. This is scored separately from reach accuracy on purpose:
//      a trace that confidently reaches the wrong id is a materially worse
//      failure than one that honestly comes back dead_end, and blending the
//      two into one pass/fail number would hide exactly the failure mode
//      this whole module's refusal doctrine exists to surface.
//
// Key format (CSV, header row required) — keys/<id>.mep.csv:
//   sheet, seed_x, seed_y, equipment, fittings, expect_status, expect_reached_id, note
//     sheet              sheet key exactly as load_plan/sheet_info report it
//     seed_x, seed_y     image px (RENDER_SCALE 2.0), ON the drawn linework
//     equipment          pipe-separated "id@x@y" placements, e.g.
//                        "HP-1@2259.8@1042.8|EWH-1@3545@1671"
//     fittings           optional, pipe-separated "x@y" points (bridging)
//     expect_status      reached | ambiguous | dead_end | refused
//     expect_reached_id  required when expect_status is "reached"
//     note               why this key row is true — how it was verified
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Session } from "../src/session.ts";

const [corpusDir, ...only] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const writeReport = process.argv.includes("--report");
if (!corpusDir) {
  console.error("usage: node --import tsx scripts/mep-trace-eval.mjs <corpus-dir> [setId ...] [--report]");
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

const parsePoints = (s) => (s || "").split("|").map((x) => x.trim()).filter(Boolean).map((x) => {
  const [id, xs, ys] = x.split("@");
  return { id, at: [Number(xs), Number(ys)] };
});
const parseFittings = (s) => (s || "").split("|").map((x) => x.trim()).filter(Boolean).map((x) => {
  const [xs, ys] = x.split("@");
  return { at: [Number(xs), Number(ys)] };
});

const pct = (n) => (n * 100).toFixed(1).padStart(5) + "%";

async function evalSet(set) {
  const s = new Session();
  const files = set.files.map((f) => join(set.root ?? spec.root, f));
  for (let i = 0; i < files.length; i++) await s.loadPlan(files[i], { merge: i > 0 });

  const key = readCsv(join(corpus, "keys", `${set.id}.mep.csv`));
  const out = { id: set.id, gc: set.gc, project: set.project, misses: [] };
  if (!key) { out.unlabelled = true; return out; }

  let reachTp = 0, reachFn = 0, refuseTp = 0, refuseFn = 0, falseConfident = 0;
  for (const row of key) {
    const equipment = parsePoints(row.equipment);
    const fittings = parseFittings(row.fittings);
    const expect = row.expect_status;
    let r;
    try {
      r = await s.traceConnectivity(row.sheet, {
        from: [Number(row.seed_x), Number(row.seed_y)],
        equipment,
        fittings: fittings.length ? fittings : undefined,
      });
    } catch (e) {
      r = { status: "refused", reason: String(e.message || e) };
    }

    if (expect === "refused" || expect === "dead_end" || expect === "ambiguous") {
      if (r.status === expect) refuseTp++;
      else { refuseFn++; out.misses.push({ kind: "refusal-not-honored", sheet: row.sheet, want: expect, got: r.status, note: row.note }); }
      continue;
    }
    // expect === "reached"
    if (r.status === "reached" && r.reachedEquipment?.id === row.expect_reached_id) { reachTp++; continue; }
    if (r.status === "reached") {
      falseConfident++;
      out.misses.push({ kind: "false-confident", sheet: row.sheet, want: row.expect_reached_id, got: r.reachedEquipment?.id, confidence: r.confidence, note: row.note });
      continue;
    }
    reachFn++;
    out.misses.push({ kind: "reach-missed", sheet: row.sheet, want: row.expect_reached_id, got: r.status, reason: r.reason, note: row.note });
  }

  const reachN = reachTp + reachFn, refuseN = refuseTp + refuseFn;
  out.reach = reachN ? { tp: reachTp, fn: reachFn, recall: reachTp / reachN } : null;
  out.refusal = refuseN ? { tp: refuseTp, fn: refuseFn, recall: refuseTp / refuseN } : null;
  out.false_confident = falseConfident;
  out.cases = key.length;
  return out;
}

const wanted = spec.sets.filter((s) => !only.length || only.includes(s.id));
const results = [];
for (const set of wanted) {
  process.stderr.write(`· ${set.id} …\n`);
  try { results.push(await evalSet(set)); }
  catch (e) { results.push({ id: set.id, gc: set.gc, project: set.project, error: String(e.message || e) }); }
}

const lines = [];
const say = (l = "") => { lines.push(l); console.log(l); };

say("╔══════════════════════════════════════════════════════════════════════════");
say("║ MEP CONNECTIVITY TRACING — scored against real sets");
say("╚══════════════════════════════════════════════════════════════════════════");
say("");
say("set                        cases   reach R   refusal R   false-confident");
say("──────────────────────────────────────────────────────────────────────────");
const agg = { rtp: 0, rfn: 0, ftp: 0, ffn: 0, fc: 0, cases: 0 };
for (const r of results) {
  if (r.error) { say(`${r.id.padEnd(26)} ERROR: ${r.error.slice(0, 60)}`); continue; }
  if (r.unlabelled) { say(`${r.id.padEnd(26)} (no key yet)`); continue; }
  if (r.reach) { agg.rtp += r.reach.tp; agg.rfn += r.reach.fn; }
  if (r.refusal) { agg.ftp += r.refusal.tp; agg.ffn += r.refusal.fn; }
  agg.fc += r.false_confident; agg.cases += r.cases;
  say(`${r.id.padEnd(26)}${String(r.cases).padStart(5)}   ${r.reach ? pct(r.reach.recall) : "    —"}     ${r.refusal ? pct(r.refusal.recall) : "    —"}      ${String(r.false_confident).padStart(5)}`);
}
say("──────────────────────────────────────────────────────────────────────────");
const reachTotal = agg.rtp + agg.rfn, refuseTotal = agg.ftp + agg.ffn;
const rR = reachTotal ? pct(agg.rtp / reachTotal) : "    —", fR = refuseTotal ? pct(agg.ftp / refuseTotal) : "    —";
say(`${"CORPUS".padEnd(26)}${String(agg.cases).padStart(5)}   ${rR}     ${fR}      ${String(agg.fc).padStart(5)}`);
say("");
say(`reach     ${agg.rtp} reached the right equipment · ${agg.rfn} missed (dead_end/wrong-status when a real connection exists)`);
say(`refusal   ${agg.ftp} correctly refused/dead_end/ambiguous as the key expects · ${agg.ffn} confidently answered when they should not have`);
say(`false-confident  ${agg.fc} case(s) reached SOME equipment, but the WRONG one — scored apart from reach accuracy on purpose (see this script's own header comment)`);
say("");

if (results.some((r) => r.misses?.length)) {
  say("── every miss, named ──");
  for (const r of results) for (const m of r.misses ?? []) {
    say(`  [${m.kind}] ${r.id} ${m.sheet} — want ${m.want ?? "(refusal)"} got ${m.got}${m.confidence != null ? ` (confidence ${m.confidence})` : ""}`);
    if (m.note) say(`      ${m.note}`);
  }
}

if (writeReport) {
  const p = join(corpus, "reports", `MEP-EVAL-${new Date(spec.stamp ?? Date.now()).toISOString().slice(0, 10)}.txt`);
  writeFileSync(p, lines.join("\n"));
  console.error(`\nwrote ${p}`);
}
process.exit(0);
