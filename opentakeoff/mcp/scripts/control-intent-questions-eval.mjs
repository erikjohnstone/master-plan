// CONTROL INTENT goal, instrument 2: the QUESTION EVAL (goals/CONTROL_INTENT.md
// MEASURE 2; GATE A is read from it).
//
// SHOULD THIS BE ON THE SHARED PATH? What it measures is shared: the project
// questions every surface shows (web/src/lib/controlIntent/questions.ts) and
// the effects of their answers (catalogue.ts, applied by applyAssemblies).
// The scoring below is eval-only; no surface imports it.
//
//   node --import tsx scripts/control-intent-questions-eval.mjs <corpus-dir> [setId ...]
//        [--heldout] [--report] [--detail] [--snapshots <dir>]
//
//   --heldout    the frozen held-out documents: aggregates only.
//   --report     write reports/control-intent/02-questions-eval-<dev|heldout>.{json,md}.
//   --detail     (dev only) every question and pre-fill.
//   --snapshots  (dev only) read <dir>/<set>.snap.json instead of taking snapshots.
//
// Track A alone: the control drawings are not read here (the reading eval
// measures them), so a question's effect is its own. Per project, with no
// answers given:
//   · questions shown (≤ 6) and zero-effect questions shown (must be 0: a
//     question is shown only when a choice changes a line or a record);
//   · each pre-fill against keys/<set>.project.csv: right, wrong, or moot (the
//     key answers n/a: another answer makes the question moot);
//   · ORACLE: the key's answers applied (n/a and unknown left out), scored by
//     the typical eval against no answers: every instance whose verdict
//     changed, fixed or broken.
// GATE A (dev): 0 zero-effect shown; ≤ 6 per project; pre-fill right ≥ 90%
// where offered and the key answers; 0 instances broken by the oracle.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAttrKeyCsv, snapshotInChild } from "./assemblies-attr-eval.mjs";
import { parseProjectKeyCsv, parseTypicalKeyCsv, scoreTypicalSet, snapshotProject } from "./assemblies-typical-eval.mjs";
import { projectQuestions, QUESTION_CAP } from "../../web/src/lib/controlIntent/questions.ts";
import { sanitizeAssemblyDefinitions } from "../../web/src/lib/assemblies/schema.ts";

export const GATES = { dev: { prefill_right: 0.9 }, heldout: { prefill_right: 0.9 } };

/** One project's questions, pre-fills and oracle effect. */
export function scoreQuestionSet({ setId, snapshot, library, projectKey, typKey, attrKey }) {
  const project = snapshotProject(snapshot);
  const t0 = Date.now();
  const q = projectQuestions({ project, library });
  const ms = Date.now() - t0;
  const prefills = [];
  for (const s of q.shown) {
    if (!s.prefill) continue;
    const key = projectKey[s.id];
    const outcome = key === undefined || key === "n/a" ? "moot" : s.prefill.value === key ? "right" : "wrong";
    prefills.push({ question: s.id, value: s.prefill.value, key: key ?? "n/a", outcome, evidence: s.prefill.evidence.slice(0, 2).map((e) => `${e.sheet ?? ""} ${e.text}`.trim()) });
  }
  const zeroShown = q.shown.filter((s) => !s.choices.some((c) => c.lines_changed + c.records_changed > 0)).map((s) => s.id);
  // ORACLE: the key's answers against none.
  const answers = Object.fromEntries(Object.entries(projectKey).filter(([, v]) => v && v !== "n/a" && v !== "unknown"));
  const before = scoreTypicalSet({ setId, typKey, attrKey, snapshot, library, settings: {} }).outcomes;
  const after = scoreTypicalSet({ setId, typKey, attrKey, snapshot, library, settings: { answers } }).outcomes;
  const byKey = (o) => `${o.tag}|${o.family}`;
  const was = new Map(before.map((o) => [byKey(o), o.outcome]));
  const fixed = [], broken = [];
  for (const o of after) {
    const b = was.get(byKey(o));
    if (b === o.outcome) continue;
    if (o.outcome === "exact") fixed.push(o.tag);
    else if (b === "exact") broken.push(o.tag);
  }
  return {
    setId, ms,
    shown: q.shown.map((s) => ({ id: s.id, lines: s.lines_changed, records: s.records_changed, prefill: s.prefill?.value ?? null })),
    zero_effect: q.zero_effect, over_cap: q.over_cap, zero_shown: zeroShown, prefills,
    oracle: { answers, fixed, broken },
  };
}

export function summarize(results) {
  const t = { projects: results.length, shown: 0, max_shown: 0, zero_shown: 0, over_cap: 0, prefills: 0, right: 0, wrong: 0, moot: 0, fixed: 0, broken: 0 };
  for (const r of results) {
    t.shown += r.shown.length;
    t.max_shown = Math.max(t.max_shown, r.shown.length);
    t.zero_shown += r.zero_shown.length;
    t.over_cap += r.over_cap.length;
    for (const p of r.prefills) { t.prefills++; t[p.outcome]++; }
    t.fixed += r.oracle.fixed.length;
    t.broken += r.oracle.broken.length;
  }
  t.prefill_right = t.right + t.wrong ? t.right / (t.right + t.wrong) : 1;
  return t;
}

const pct = (x) => `${(100 * x).toFixed(1)}%`;

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const value = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--snapshots");
  const [corpusDir, ...only] = positional;
  if (!corpusDir) {
    console.error("usage: node --import tsx scripts/control-intent-questions-eval.mjs <corpus-dir> [setId ...] [--heldout] [--report] [--detail] [--snapshots <dir>]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
  const side = flag("--heldout") ? "heldout" : "dev";
  const snapDir = value("--snapshots");
  if ((flag("--detail") || snapDir) && side === "heldout") {
    console.error("--detail and --snapshots are dev-only: held-out documents are scored at gates, never tuned on");
    process.exit(2);
  }
  const split = JSON.parse(readFileSync(join(corpus, "reports", "assemblies", "01-split.json"), "utf8"));
  const sideSets = split[side].sets;
  const unknown = only.filter((id) => !sideSets.includes(id));
  if (unknown.length) { console.error(`not ${side} documents: ${unknown.join(", ")}`); process.exit(2); }
  const setIds = only.length ? only : sideSets;
  const starter = join(fileURLToPath(new URL(".", import.meta.url)), "../../web/src/lib/assemblies/starter");
  const { assemblies: library } = sanitizeAssemblyDefinitions(JSON.parse(readFileSync(join(starter, "us-typicals-v1.json"), "utf8")).assemblies);
  const results = [];
  const errors = [];
  for (const id of setIds) {
    const pk = join(corpus, "keys", `${id}.project.csv`), tk = join(corpus, "keys", `${id}.typicals.csv`), ak = join(corpus, "keys", `${id}.attrs.csv`);
    if (![pk, tk, ak].every(existsSync)) { errors.push({ id, error: "no project, typical or attribute key" }); continue; }
    const snapshot = snapDir ? JSON.parse(readFileSync(join(snapDir, `${id}.snap.json`), "utf8")) : await snapshotInChild(corpus, id);
    if (snapshot.error) { errors.push({ id, error: snapshot.error }); continue; }
    results.push(scoreQuestionSet({
      setId: id, snapshot, library,
      projectKey: parseProjectKeyCsv(readFileSync(pk, "utf8")),
      typKey: parseTypicalKeyCsv(readFileSync(tk, "utf8"), tk),
      attrKey: parseAttrKeyCsv(readFileSync(ak, "utf8"), ak),
    }));
  }
  const total = summarize(results);
  const gate = GATES[side];
  const lines = [`# Control intent: question eval (${side})`, ""];
  lines.push(`projects ${total.projects}; questions shown ${total.shown} (most in one project ${total.max_shown}, cap ${QUESTION_CAP}); zero-effect shown ${total.zero_shown}; past the cap ${total.over_cap}`);
  lines.push(`pre-fills ${total.prefills}: right ${total.right}, wrong ${total.wrong}, moot ${total.moot} (${pct(total.prefill_right)} right where the key answers)`);
  lines.push(`oracle (the key's answers against none): ${total.fixed} instances fixed, ${total.broken} broken`);
  if (side === "dev") {
    lines.push("", "| set | shown | pre-fills (right/wrong/moot) | oracle fixed | broken |", "|---|---|---:|---:|---:|");
    for (const r of results) {
      const n = (o) => r.prefills.filter((p) => p.outcome === o).length;
      lines.push(`| ${r.setId} | ${r.shown.map((s) => `${s.id} (${s.lines}L/${s.records}R)`).join(", ") || "-"} | ${n("right")}/${n("wrong")}/${n("moot")} | ${r.oracle.fixed.length} | ${r.oracle.broken.length} |`);
    }
  }
  const pass = total.zero_shown === 0 && total.max_shown <= QUESTION_CAP && total.prefill_right >= gate.prefill_right && total.broken === 0;
  lines.push("", `GATE A (${side}): zero-effect shown ${total.zero_shown} = 0 ${total.zero_shown === 0 ? "✓" : "✗"}; at most ${QUESTION_CAP} per project ${total.max_shown <= QUESTION_CAP ? "✓" : "✗"}; pre-fill right ${pct(total.prefill_right)} ≥ ${pct(gate.prefill_right)} ${total.prefill_right >= gate.prefill_right ? "✓" : "✗"}; oracle broken ${total.broken} = 0 ${total.broken === 0 ? "✓" : "✗"} → ${pass ? "PASS" : "FAIL"}`);
  if (errors.length) lines.push("", ...errors.map((e) => `ERROR ${e.id}: ${e.error}`));
  if (flag("--detail")) {
    lines.push("", "## Pre-fills");
    for (const r of results) for (const p of r.prefills) lines.push(`- ${r.setId} ${p.question}: ${p.value} (key ${p.key}, ${p.outcome}) — ${p.evidence.join(" | ")}`);
    lines.push("", "## Oracle changes");
    for (const r of results) if (r.oracle.fixed.length || r.oracle.broken.length) lines.push(`- ${r.setId}: fixed ${r.oracle.fixed.join(", ") || "-"}; broken ${r.oracle.broken.join(", ") || "-"}`);
  }
  console.log(lines.join("\n"));
  if (flag("--report")) {
    const dir = join(corpus, "reports", "control-intent");
    mkdirSync(dir, { recursive: true });
    const base = join(dir, `02-questions-eval-${side}`);
    writeFileSync(`${base}.json`, JSON.stringify(side === "dev" ? { side, total, results } : { side, total }, null, 1));
    writeFileSync(`${base}.md`, lines.filter((l) => side === "dev" || !l.startsWith("- ")).join("\n") + "\n");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
