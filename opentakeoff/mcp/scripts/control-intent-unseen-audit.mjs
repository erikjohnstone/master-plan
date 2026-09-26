// CONTROL INTENT goal, WP4.2 — the UNSEEN AUDIT: the blind live-model audit of
// the readers on corpus sets never keyed or tuned on, as a replayable
// instrument.
//
// SHOULD THIS BE ON THE SHARED PATH? What it measures is shared: the readers
// and the combiner every surface reads through (web/src/lib/controlIntent/
// record.ts), over the compile the other instruments score (the attribute
// eval's child). The set list, the audit record and the comparison are
// eval-only; no surface imports this script.
//
//   node --import tsx scripts/control-intent-unseen-audit.mjs <corpus-dir>
//        [setId ...] [--live] [--report]
//
// The sets: every corpus set that is neither dev nor held-out (reports/
// assemblies/01-split.json), nor a held-out document's twin, a held-out
// drafter's set or a copy of a dev document (reports/control-intent/
// 00-corpus-hygiene.json, not_unseen), and whose compile has scheduled units
// and control packets both. Each is read by all three readers. Their model
// calls are recorded under reports/control-intent/unseen-runs/<set>.jsonl:
// without --live they replay, so the audit reads no model and is
// reproducible; with --live (CEREBRAS_API_KEY) what is not recorded is called
// and recorded.
//
// The audit record, reports/control-intent/06-unseen-audit.json, holds every
// applied decision a person checked by hand against its cites and the drawing,
// with the verdict ("right" or "wrong"). A decision is its set, the unit's
// tag, the question, the value and the rule. A run compares what it applies
// with the record:
//   · audited  in the record; its verdict is counted;
//   · new      applied and not in the record: a person checks it, and sets its
//              verdict, before the record counts it;
//   · gone     in the record and no longer applied.
// --report rewrites the record (each verdict kept, the new decisions added as
// "unaudited", the gone ones dropped and listed) and 06-unseen-audit.md, and
// prunes each set's runs to the calls its reading used.
// Snapshots need the environment the other instruments run in (see
// control-intent-robustness-eval.mjs).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotInChild } from "./assemblies-attr-eval.mjs";
import { snapshotProject } from "./assemblies-typical-eval.mjs";
import { resolveSetFiles } from "./corpusFiles.mjs";
import { sanitizeAssemblyDefinitions } from "../../web/src/lib/assemblies/schema.ts";
import { applyAssemblies } from "../../web/src/lib/assemblies/apply.ts";
import { readControlIntent } from "../../web/src/lib/controlIntent/record.ts";
import { httpTransport, memoryRunStore } from "../../web/src/lib/controlIntent/runs.ts";
import { pdfCropRenderer } from "../src/controlIntentCrops.ts";

const readJsonl = (path) => (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

/** The sets the audit may read: never dev, held-out, a held-out twin or
 * drafter's set, or a copy of a dev document. */
export function eligibleSets(spec, split, hygiene, tier2 = null) {
  // The assemblies second tier (reports/assemblies/tier2/01-split.json) is dev
  // and held-out too: its documents are keyed and tuned on, or held out.
  const out = new Set([...split.dev.sets, ...split.heldout.sets, ...(tier2 ? [...tier2.dev.sets, ...tier2.heldout.sets, ...(tier2.heldout.withheld ?? [])] : []), ...Object.values(hygiene.not_unseen ?? {}).flat()]);
  return spec.sets.map((s) => s.id).filter((id) => !out.has(id));
}

/** A decision's identity in the audit record. */
export const decisionKey = (d) => [d.set, d.tag, d.question, JSON.stringify(d.value), d.rule].join("\u0000");

/** Compare applied decisions with the audit record's. */
export function compareWithRecord(applied, record) {
  const byKey = new Map(record.map((r) => [decisionKey(r), r]));
  const now = new Set(applied.map(decisionKey));
  const audited = applied.filter((d) => byKey.has(decisionKey(d))).map((d) => ({ ...d, verdict: byKey.get(decisionKey(d)).verdict }));
  return {
    audited,
    right: audited.filter((d) => d.verdict === "right").length,
    wrong: audited.filter((d) => d.verdict === "wrong").length,
    unaudited: audited.filter((d) => d.verdict !== "right" && d.verdict !== "wrong").length,
    new: applied.filter((d) => !byKey.has(decisionKey(d))),
    gone: record.filter((r) => !now.has(decisionKey(r))),
  };
}

/** A run over some sets (`ids`) against the record: it is compared with
 * those sets' part of the record only, and the record it leaves keeps every
 * other set's decisions, verdicts and status as they were. A new decision is
 * "unaudited" until a person checks it. A set that is no longer unseen (not
 * in `eligible`: a later hygiene scan found it a held-out drafter's, or a
 * dev draw took it) is withdrawn from the record, decisions and all. */
export function mergeRun(record, ids, sets, applied, eligible = null) {
  const inRun = new Set(ids);
  const still = (id) => !eligible || eligible.includes(id);
  // The record keeps naming what it withdrew, so the audit's history stays visible.
  const withdrawn = [...new Set([...(record.totals?.withdrawn ?? []), ...(record.sets ?? []).map((s) => s.id), ...(record.decisions ?? []).map((r) => r.set)])].filter((id) => !still(id));
  const prior = (record.decisions ?? []).filter((r) => still(r.set));
  const cmp = compareWithRecord(applied, prior.filter((r) => inRun.has(r.set)));
  const kept = prior.filter((r) => !inRun.has(r.set));
  const had = new Map(prior.map((r) => [decisionKey(r), r]));
  const decisions = [...kept, ...applied.map((d) => {
    const h = had.get(decisionKey(d));
    return { set: d.set, tag: d.tag, family: d.family, question: d.question, value: d.value, rule: d.rule, readers: d.readers, cite: d.cite, verdict: h?.verdict ?? "unaudited", ...(h?.checked ? { checked: h.checked } : {}), ...(h?.note ? { note: h.note } : {}) };
  })];
  return { cmp, kept, decisions, sets: [...(record.sets ?? []).filter((s) => !inRun.has(s.id) && still(s.id)), ...sets], withdrawn };
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const [corpusDir, ...only] = argv.filter((a) => !a.startsWith("--"));
  if (!corpusDir) {
    console.error("usage: node --import tsx scripts/control-intent-unseen-audit.mjs <corpus-dir> [setId ...] [--live] [--report]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
  const live = flag("--live");
  if (live && !process.env.CEREBRAS_API_KEY) { console.error("--live needs CEREBRAS_API_KEY"); process.exit(2); }
  if (!process.env.OPENTAKEOFF_VECTORGRID_PYTHON && !process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON) {
    console.error("warning: OPENTAKEOFF_VECTORGRID_PYTHON is not set: the table sidecar falls back to python3, and the compile may read fewer schedules than the other instruments score");
  }
  const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));
  const split = JSON.parse(readFileSync(join(corpus, "reports", "assemblies", "01-split.json"), "utf8"));
  const hygiene = JSON.parse(readFileSync(join(corpus, "reports", "control-intent", "00-corpus-hygiene.json"), "utf8"));
  const tier2Path = join(corpus, "reports", "assemblies", "tier2", "01-split.json");
  const tier2 = existsSync(tier2Path) ? JSON.parse(readFileSync(tier2Path, "utf8")) : null;
  const eligible = eligibleSets(spec, split, hygiene, tier2);
  const refused = only.filter((id) => !eligible.includes(id));
  if (refused.length) { console.error(`not unseen (dev, held-out, a twin, a drafter's or a dev copy) or not a corpus set: ${refused.join(", ")}`); process.exit(2); }
  const ids = only.length ? only : eligible;
  const lib = resolve(fileURLToPath(new URL("../../web/src/lib/assemblies/", import.meta.url)));
  const { assemblies: library } = sanitizeAssemblyDefinitions(JSON.parse(readFileSync(join(lib, "starter", "us-typicals-v1.json"), "utf8")).assemblies);
  const transport = live ? httpTransport({ endpoint: process.env.OPENTAKEOFF_AI_ENDPOINT || "https://api.cerebras.ai", apiKey: process.env.CEREBRAS_API_KEY }) : null;
  const dir = join(corpus, "reports", "control-intent");
  const runsDir = join(dir, "unseen-runs");
  const recordPath = join(dir, "06-unseen-audit.json");
  const recordFile = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, "utf8")) : { decisions: [] };
  const sets = [];
  const applied = [];
  const calls = { live: 0, replayed: 0, not_recorded: 0, failed: 0 };
  for (const id of ids) {
    const snap = await snapshotInChild(corpus, id);
    if (snap.error) { sets.push({ id, status: "no_snapshot", error: String(snap.error).slice(0, 200) }); continue; }
    const project = snapshotProject(snap);
    const first = applyAssemblies({ project, library });
    const units = first.instances.length, packets = first.control.packets.length;
    if (!units || !packets) { sets.push({ id, status: units ? "no_control_packets" : "no_scheduled_units", units, packets }); continue; }
    const path = join(runsDir, `${id}.jsonl`);
    const store = memoryRunStore(readJsonl(path));
    const set = spec.sets.find((s) => s.id === id);
    const byName = new Map(resolveSetFiles(corpus, spec, set).map((f) => [f.split("/").pop(), f]));
    const render = live ? pdfCropRenderer((file) => byName.get(file) ?? null) : null;
    const readings = await readControlIntent({ project, library }, { store, transport, render, concurrency: 6 });
    if (render) await render.close();
    for (const k of Object.keys(calls)) calls[k] += readings.calls.r1[k] + readings.calls.r2[k];
    if (live || flag("--report")) {
      const used = new Set(readings.runs);
      const keep = store.all().filter((r) => used.has(r.hash));
      mkdirSync(runsDir, { recursive: true });
      writeFileSync(path, keep.length ? keep.map((r) => JSON.stringify(r)).join("\n") + "\n" : "");
    }
    const mine = readings.units.flatMap((u) => u.decisions.filter((d) => d.outcome === "applied").map((d) => ({
      set: id, tag: u.tag, family: u.family, question: d.question, value: d.value, rule: d.rule,
      readers: d.answers.map((a) => `${a.reader}${a.run ?? ""}:${a.answer}${a.note ? `(${a.note})` : ""}`).join(" "),
      cite: d.cites.length ? { packet: d.cites[0].packet, sheet: d.cites[0].sheet, text: String(d.cites[0].text).replace(/\s+/g, " ").slice(0, 300) } : null,
    })));
    applied.push(...mine);
    const missing = readings.calls.r1.not_recorded + readings.calls.r2.not_recorded;
    sets.push({ id, status: "read", units, packets, applied: mine.length, ...(missing ? { not_recorded: missing } : {}) });
    process.stderr.write(`  ${id}: ${units} units, ${packets} packets; applied ${mine.length}${missing ? `; ${missing} requests not recorded (run with --live)` : ""}\n`);
  }
  // A run over some of the sets is compared with their part of the record
  // only, and --report rewrites only that part: the other sets' decisions,
  // verdicts and statuses stay as recorded.
  const merged = mergeRun(recordFile, ids, sets, applied, eligible);
  const { cmp } = merged;
  const count = (xs, v) => xs.filter((d) => d.verdict === v).length;
  const summary = (setList, kept) => {
    const read = setList.filter((s) => s.status === "read");
    const L = [];
    const whole = ids.length === eligible.length || kept !== null;
    L.push(`UNSEEN AUDIT — ${whole ? `${eligible.length} eligible sets` : `${ids.length} of ${eligible.length} eligible sets`}, ${read.length} read (scheduled units and control packets both), ${setList.filter((s) => s.status === "no_snapshot").length} with no snapshot, ${setList.filter((s) => s.status.startsWith("no_") && s.status !== "no_snapshot").length} with units or packets only`);
    L.push(`  model calls: replayed ${calls.replayed}, live ${calls.live}, not recorded ${calls.not_recorded}, failed ${calls.failed}${kept?.length ? ` (this run's ${ids.length} sets)` : ""}`);
    const k = kept ?? [];
    const unaudited = k.length - count(k, "right") - count(k, "wrong") + cmp.unaudited;
    L.push(`  applied ${k.length + applied.length}: audited ${k.length + cmp.audited.length} (right ${count(k, "right") + cmp.right}, wrong ${count(k, "wrong") + cmp.wrong}, unaudited ${unaudited}); new ${cmp.new.length}; gone ${cmp.gone.length}`);
    for (const d of cmp.new) L.push(`  NEW  ${d.set.slice(0, 24)} ${d.tag} ${d.question}=${JSON.stringify(d.value)} [${d.rule}] ${d.cite ? `"${d.cite.text.slice(0, 120)}"` : ""}`);
    for (const d of cmp.gone) L.push(`  GONE ${d.set.slice(0, 24)} ${d.tag} ${d.question}=${JSON.stringify(d.value)} [${d.rule}]`);
    for (const d of [...k, ...cmp.audited].filter((x) => x.verdict === "wrong")) L.push(`  WRONG ${d.set.slice(0, 24)} ${d.tag} ${d.question}=${JSON.stringify(d.value)} [${d.rule}]`);
    const perSet = read.filter((s) => s.applied).sort((a, b) => b.applied - a.applied).map((s) => `${s.id.slice(0, 6)} ${s.applied}`).join(", ");
    if (perSet) L.push(`  per set: ${perSet}`);
    if (merged.withdrawn.length) L.push(`  withdrawn from the record, no longer unseen: ${merged.withdrawn.join(", ")}`);
    return L;
  };
  // What this run read; with --report, the record after it.
  for (const l of summary(sets, null)) console.error(l);
  if (flag("--report")) {
    const { decisions, sets: allSets } = merged;
    const L = summary(allSets, merged.kept);
    const out = {
      about: "Every decision the readers apply on the unseen corpus sets, with a person's verdict against its cites and the drawing (right, wrong, or unaudited until checked). mcp/scripts/control-intent-unseen-audit.mjs replays the recorded runs (unseen-runs/) and compares.",
      sets: allSets,
      totals: { eligible: eligible.length, read: allSets.filter((s) => s.status === "read").length, applied: decisions.length, right: count(decisions, "right"), wrong: count(decisions, "wrong"), unaudited: decisions.length - count(decisions, "right") - count(decisions, "wrong"), gone: cmp.gone.map((d) => ({ set: d.set, tag: d.tag, question: d.question, value: d.value, rule: d.rule })), ...(merged.withdrawn.length ? { withdrawn: merged.withdrawn } : {}) },
      decisions,
    };
    writeFileSync(recordPath, `${JSON.stringify(out, null, 1)}\n`);
    writeFileSync(join(dir, "06-unseen-audit.md"), `# Unseen audit — the readers on corpus sets never keyed or tuned on\n\n\`\`\`\n${L.join("\n")}\n\`\`\`\n`);
    console.error(`wrote ${recordPath} and 06-unseen-audit.md`);
  }
  process.exit(cmp.wrong || cmp.new.length || calls.not_recorded ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("control-intent-unseen-audit.mjs")) await main();
