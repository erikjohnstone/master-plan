// CONTROL INTENT goal, instrument 4 — the READING EVAL (goals/CONTROL_INTENT.md
// MEASURE 4; GATE B2 is read from it).
//
// SHOULD THIS BE ON THE SHARED PATH? What it measures is shared: the readings
// (web/src/lib/controlIntent/record.ts readControlIntent) over the project the
// apply path reads. The scoring below is eval-only; no surface imports it.
//
//   node --import tsx scripts/control-intent-reading-eval.mjs <corpus-dir> [setId ...]
//        [--heldout] [--report] [--detail] [--live] [--r0]
//
//   REPLAY by default: R1 and R2 read only the runs recorded in
//   reports/control-intent/runs/<set>.jsonl (a request with no run reads
//   nothing). --live calls the models for what is not recorded, and records.
//   --r0 reads with R0 alone (model-off, GATE D): no model is read or called.
//   --heldout scores the frozen held-out documents, aggregates only.
//   --report writes reports/control-intent/04-reading-eval-<side>.{json,md}.
//   --detail (dev only) lists every decision that is not right.
//
// Per keyed (instance, question) — the role (key "none" ↔ the unit is outside
// the BAS's command) and each option the reading asked about:
//   applied-right · applied-wrong · INVENTED (the key marks the option "?",
//   i.e. the drawings do not decide it, and a reading applied a value) ·
//   proposal-right · proposal-wrong · unresolved (readers disagree or a
//   reading did not verify) · abstained (nothing read).
// Reported combined and per reader (R0, R1, R2 runs a and b: right, wrong,
// abstained, unverified); the absence subset apart; per set and family (dev).
// GATE B2 (dev): applied-wrong ≤ 0.5% of applied; 0 applied-wrong absence
// decisions; 0 INVENTED applied; every applied decision cites printed text
// (an absence decision cites none, by definition); and, from the typical eval
// with these readings, ≥ 57 of the 71 dev instances research 01 classes as
// decided by the control drawings exact, 0 baseline-exact instances lost.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAttrKeyCsv, snapshotInChild } from "./assemblies-attr-eval.mjs";
import { parseProjectKeyCsv, parseTypicalKeyCsv, readingTools, scoreTypicalSet, snapshotProject } from "./assemblies-typical-eval.mjs";
import { sanitizeAssemblyDefinitions } from "../../web/src/lib/assemblies/schema.ts";

export const GATES = { dev: { applied_wrong_max: 0.005, absence_wrong: 0, invented: 0, uncited: 0, r_exact_min: 57 }, heldout: { applied_wrong_max: 0.02, invented: 0 } };

const OUTCOMES = ["applied-right", "applied-wrong", "INVENTED", "proposal-right", "proposal-wrong", "unresolved", "abstained"];

/** The key's value for a question: role → "out"/"in"; option → true/false,
 * "?" (undecided), or undefined (not keyed: another typical's option). */
function keyValue(row, question) {
  if (question === "role") return row.typical_id === "none" ? "out" : "in";
  const o = row.options?.[question.slice(4)];
  if (!o) return undefined;
  return o.decided ? o.value : "?";
}

/** Score one set's readings against its keys. */
export function scoreReadings({ setId, typKey, outcomes, readings }) {
  const rowByItem = new Map();
  for (const o of outcomes) if (o.item !== undefined) rowByItem.set(o.item, typKey.find((r) => r.tag === o.tag && r.sheet === o.sheet));
  const out = [];
  const readerStats = [];
  for (const u of readings.units) {
    const row = rowByItem.get(u.item);
    if (!row) continue;
    for (const d of u.decisions) {
      const k = keyValue(row, d.question);
      if (k === undefined) continue;
      // A role reading counts only when it would change the record: "out".
      const value = d.value;
      const right = d.question === "role" ? (value === "out") === (k === "out") : value === k;
      let outcome;
      if (d.outcome === "applied") outcome = k === "?" ? "INVENTED" : right ? "applied-right" : "applied-wrong";
      else if (d.outcome === "proposal") outcome = k === "?" ? "proposal-right" : right ? "proposal-right" : "proposal-wrong";
      else if (d.outcome === "unresolved") outcome = "unresolved";
      else outcome = "abstained";
      // "in" (the BAS commands it) changes nothing: only an "out" is a decision.
      if (d.question === "role" && d.outcome === "applied" && value === "in") outcome = k === "in" ? "applied-right" : "applied-wrong";
      const absence = d.rule === "drawing_read:absence" || d.rule === "drawing_read:absence_unconfirmed";
      out.push({ set: setId, tag: u.tag, family: u.family, question: d.question, key: k, outcome, value, rule: d.rule, why: d.why, absence, cited: d.cites.length > 0 || absence, answers: d.answers.map((a) => `${a.reader}${a.run ?? ""}:${a.answer}${a.note ? `(${a.note})` : ""}`) });
      for (const a of d.answers) {
        const v = d.question === "role"
          ? (a.answer === "commands" ? "in" : ["monitors_only", "not_connected", "local_control"].includes(a.answer) ? "out" : null)
          : (a.answer === "yes" ? true : a.answer === "no" || a.answer === "absent" ? false : null);
        const stat = a.note === "unverified" ? "unverified" : v === null ? "abstained" : k === "?" ? "undecided-key" : v === k ? "right" : "wrong";
        readerStats.push({ reader: `${a.reader}${a.run ?? ""}`, stat, absence: a.answer === "absent" });
      }
    }
  }
  return { decisions: out, readerStats };
}

export function summarize(decisions, readerStats) {
  const count = (xs) => Object.fromEntries(OUTCOMES.map((o) => [o, xs.filter((x) => x.outcome === o).length]));
  const applied = decisions.filter((d) => ["applied-right", "applied-wrong", "INVENTED"].includes(d.outcome));
  const readers = {};
  for (const s of readerStats) {
    readers[s.reader] ??= { right: 0, wrong: 0, abstained: 0, unverified: 0, "undecided-key": 0 };
    readers[s.reader][s.stat] += 1;
  }
  const by = (keyOf) => {
    const m = new Map();
    for (const d of decisions) {
      const k = keyOf(d);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    }
    return Object.fromEntries([...m].sort((a, b) => b[1].length - a[1].length).map(([k, xs]) => [k, count(xs)]));
  };
  return {
    total: count(decisions),
    applied: applied.length,
    applied_wrong_rate: applied.length ? applied.filter((d) => d.outcome === "applied-wrong").length / applied.length : 0,
    absence: count(decisions.filter((d) => d.absence)),
    uncited_applied: applied.filter((d) => !d.cited).length,
    readers,
    by_set: by((d) => d.set),
    by_family: by((d) => d.family),
    by_question: by((d) => d.question),
  };
}

function renderText(s, { side, detail, decisions, exactR }) {
  const L = [];
  L.push(`READING EVAL (instrument 4) — ${side}, ${detail?.r0 ? "R0 alone (model-off)" : `replayed runs${detail?.live ? " (live top-up)" : ""}`}`);
  L.push("");
  const row = (name, c) => `  ${name.padEnd(40)} ${OUTCOMES.map((o) => String(c[o]).padStart(o.length + 1)).join(" ")}`;
  L.push(`  ${"".padEnd(40)} ${OUTCOMES.join(" ")}`);
  L.push(row("ALL decisions", s.total));
  L.push(row("absence decisions", s.absence));
  L.push(`  applied ${s.applied}, applied-wrong ${(100 * s.applied_wrong_rate).toFixed(2)}%, uncited applied ${s.uncited_applied}`);
  L.push("");
  L.push("per reader (answers on keyed questions):");
  for (const [r, c] of Object.entries(s.readers).sort()) L.push(`  ${r.padEnd(6)} right ${c.right}  wrong ${c.wrong}  abstained ${c.abstained}  unverified ${c.unverified}  (key undecided ${c["undecided-key"]})`);
  if (side === "dev") {
    L.push("");
    L.push("per set:");
    for (const [k, c] of Object.entries(s.by_set)) L.push(row(k.slice(0, 40), c));
    L.push("");
    L.push("per question:");
    for (const [k, c] of Object.entries(s.by_question)) L.push(row(k.slice(0, 40), c));
  }
  if (exactR) L.push(`\ncontrol-drawing instances (research 01 class R, frozen): ${exactR.exact}/${exactR.total} exact`);
  if (detail?.on && side === "dev") {
    L.push("");
    L.push("not right:");
    for (const d of decisions.filter((x) => !["applied-right", "proposal-right", "abstained"].includes(x.outcome))) {
      L.push(`  ${d.set.slice(0, 28)} | ${d.tag} ${d.question}: ${d.outcome} (key ${d.key}, read ${d.value}) ${d.rule} — ${d.answers.join(" ")}`);
    }
  }
  return L.join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const [corpusDir, ...only] = argv.filter((a) => !a.startsWith("--"));
  if (!corpusDir) {
    console.error("usage: node --import tsx scripts/control-intent-reading-eval.mjs <corpus-dir> [setId ...] [--heldout] [--report] [--detail] [--live] [--r0]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
  const side = flag("--heldout") ? "heldout" : "dev";
  if (flag("--detail") && side === "heldout") { console.error("--detail is dev-only"); process.exit(2); }
  const split = JSON.parse(readFileSync(join(corpus, "reports", "assemblies", "01-split.json"), "utf8"));
  const setIds = only.length ? only : split[side].sets;
  const lib = resolve(fileURLToPath(new URL("../../web/src/lib/assemblies/", import.meta.url)));
  const { assemblies: library } = sanitizeAssemblyDefinitions(JSON.parse(readFileSync(join(lib, "starter", "us-typicals-v1.json"), "utf8")).assemblies);
  if (flag("--r0") && flag("--live")) { console.error("--r0 reads no model: drop --live"); process.exit(2); }
  const reading = await readingTools(corpus, flag("--r0") ? "r0" : flag("--live") ? "live" : "replay");
  const classes = side === "dev" ? (await import("../../../plans/05-research/pilot/r2-classes.mjs").catch(() => null)) : null;
  const decisions = [];
  const readerStats = [];
  const errors = [];
  let rTotal = 0, rExact = 0;
  for (const id of setIds) {
    const typPath = join(corpus, "keys", `${id}.typicals.csv`);
    const attrPath = join(corpus, "keys", `${id}.attrs.csv`);
    const pPath = join(corpus, "keys", `${id}.project.csv`);
    if (!existsSync(typPath) || !existsSync(attrPath)) { errors.push({ id, error: "no keys" }); continue; }
    const typKey = parseTypicalKeyCsv(readFileSync(typPath, "utf8"), typPath);
    const attrKey = parseAttrKeyCsv(readFileSync(attrPath, "utf8"), attrPath);
    const settings = existsSync(pPath) ? { answers: parseProjectKeyCsv(readFileSync(pPath, "utf8")) } : {};
    const snap = await snapshotInChild(corpus, id);
    if (snap.error) { errors.push({ id, error: snap.error.split("\n")[0] }); continue; }
    const readings = await reading.read(id, snapshotProject(snap), library, settings);
    const { outcomes } = scoreTypicalSet({ setId: id, typKey, attrKey, snapshot: snap, library, settings, readings });
    const scored = scoreReadings({ setId: id, typKey, outcomes, readings });
    decisions.push(...scored.decisions);
    readerStats.push(...scored.readerStats);
    if (classes) {
      for (const o of outcomes) {
        const c = classes.classOf({ set: id, tag: o.tag });
        if (!c || !/^R/.test(c)) continue;
        rTotal += 1;
        if (o.outcome === "exact") rExact += 1;
      }
    }
  }
  await reading.close();
  const s = summarize(decisions, readerStats);
  const exactR = classes ? { exact: rExact, total: rTotal } : null;
  const text = renderText(s, { side, detail: { on: flag("--detail"), live: flag("--live"), r0: flag("--r0") }, decisions, exactR });
  console.log(text);
  const g = GATES[side];
  const verdict = side === "dev"
    ? { applied_wrong: s.applied_wrong_rate <= g.applied_wrong_max, absence_wrong: s.absence["applied-wrong"] === 0, invented: s.total.INVENTED === 0, uncited: s.uncited_applied === 0, r_exact: exactR ? exactR.exact >= g.r_exact_min : null }
    : { applied_wrong: s.applied_wrong_rate <= g.applied_wrong_max, invented: s.total.INVENTED === 0 };
  console.log(`\nGATE B2 (${side}, reading part): ${Object.entries(verdict).map(([k, v]) => `${k} ${v === null ? "n/a" : v ? "ok" : "FAIL"}`).join(" · ")}`);
  if (errors.length) console.log(`\nERRORS: ${errors.map((e) => `${e.id}: ${e.error}`).join("; ")}`);
  if (flag("--report")) {
    const dir = join(corpus, "reports", "control-intent");
    mkdirSync(dir, { recursive: true });
    const json = { generated_at: new Date().toISOString(), side, documents: setIds, errors, gate: { ...g, verdict }, summary: side === "dev" ? s : { total: s.total, applied: s.applied, applied_wrong_rate: s.applied_wrong_rate, absence: s.absence, uncited_applied: s.uncited_applied, readers: s.readers }, ...(exactR ? { control_drawing_instances: exactR } : {}) };
    writeFileSync(join(dir, `04-reading-eval-${side}.json`), `${JSON.stringify(json, null, 2)}\n`);
    writeFileSync(join(dir, `04-reading-eval-${side}.md`), `# Reading eval — ${side}\n\n\`\`\`\n${text}\n\`\`\`\n`);
    console.log(`wrote reports/control-intent/04-reading-eval-${side}.{json,md}`);
  }
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("control-intent-reading-eval.mjs")) await main();
