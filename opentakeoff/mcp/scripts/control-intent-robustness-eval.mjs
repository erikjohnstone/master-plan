// CONTROL INTENT goal, WP4.2 — the ROBUSTNESS SUITE (GATE D).
//
// SHOULD THIS BE ON THE SHARED PATH? What it measures is shared: the readers
// and the combiner every surface reads through (web/src/lib/controlIntent/
// record.ts), over the compile the other instruments score (the attribute
// eval's child). The perturbations are eval-only: a rebinding passed through
// readControlIntent's `rebind` hook (no surface passes one), and the corpus's
// raster rendition of a dev document. No surface imports this script.
//
//   node --import tsx scripts/control-intent-robustness-eval.mjs <corpus-dir>
//        [--live] [--report] [--only negative,swap,modeloff,replay,rerun,raster]
//
// On the frozen dev documents (reports/assemblies/01-split.json), never on a
// held-out one:
//   negative  the goal's negative controls, 004 and baker-county-eoc: the
//             option decisions the readers apply, and, with PQ1 = no, every
//             unit's controls record "none" (a project-level record, such as
//             the building meters, is not a unit's).
//   swap      two rebindings, as a binder mistake would bind:
//             · family: every packet the binder binds to a unit (confirmed)
//               is rebound, with the kind it has, to a unit that reads today
//               of another family (a drive's detail never to a unit whose
//               row prints a VFD: that is the binder's own rule, no mistake);
//             · tag: every packet a title binds (tag, list or range) is
//               rebound to a unit of the same family its title does not name.
//             A decision rests on the swap when a reading behind it cites a
//             swapped packet, or it is an absence (read through bindings).
//             GATE D: ≥ 99% of those never apply (they fail verification or
//             disagree); the reader answers that cite a swapped packet and
//             fail verification are counted too.
//   modeloff  R0 alone, scored with the reading eval's key and scorer
//             (control-intent-reading-eval.mjs): 0 applied-wrong.
//   replay    the recorded readings, read and applied twice with the key's
//             answers: byte-identical records and lines.
//   rerun     a re-run of the models against the recorded replay: at most 2%
//             of the decisions either makes change (outcome or value), every
//             change listed; and the cost per document (model calls, tokens,
//             wall time; GATE D: ≤ 5 minutes each).
//   raster    each dev document the corpus also stages as an image-only
//             rendition (a set "<id>-raster"): its applied decisions ⊆ the
//             vector document's.
//
// Model calls. The swap, the raster and the re-run read their own runs,
// recorded under reports/control-intent/robustness-runs/<item>/<set>.jsonl
// (a run the dev documents' runs already hold is not copied). Without --live
// they replay those runs: the whole suite reads no model and is reproducible
// (the re-run replays the last live re-run, and its wall times are the ones
// recorded then, in rerun/meta.json). With --live (CEREBRAS_API_KEY) the swap
// and the raster call the models for what is not recorded, and the re-run
// calls them afresh for every request (an empty store), replacing its runs.
//
// --report writes reports/control-intent/05-robustness-dev.{json,md}.
// Snapshots need the environment the other instruments run in: without
// OPENTAKEOFF_VECTORGRID_PYTHON the table sidecar falls back to the system
// python3 and the compile may read fewer schedules (a warning is printed).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAttrKeyCsv, snapshotInChild } from "./assemblies-attr-eval.mjs";
import { parseProjectKeyCsv, parseTypicalKeyCsv, readingTools, scoreTypicalSet, snapshotProject } from "./assemblies-typical-eval.mjs";
import { scoreReadings, summarize } from "./control-intent-reading-eval.mjs";
import { resolveSetFiles } from "./corpusFiles.mjs";
import { sanitizeAssemblyDefinitions } from "../../web/src/lib/assemblies/schema.ts";
import { applyAssemblies } from "../../web/src/lib/assemblies/apply.ts";
import { readControlIntent } from "../../web/src/lib/controlIntent/record.ts";
import { httpTransport, memoryRunStore } from "../../web/src/lib/controlIntent/runs.ts";
import { printsDrive, tagKey, titleTags } from "../../web/src/lib/controlIntent/binding.ts";
import { subjectFamily } from "../../web/src/lib/controlIntent/evidence.ts";
import { pdfCropRenderer } from "../src/controlIntentCrops.ts";

export const GATE_D = { swap_not_applied_min: 0.99, modeloff_applied_wrong: 0, rerun_changed_max: 0.02, wall_s_max: 300 };
const ITEMS = ["negative", "swap", "modeloff", "replay", "rerun", "raster"];
/** The goal's negative controls, by the start of their dev id. */
const NEGATIVE = ["004_", "baker-county-eoc"];

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
const readJsonl = (path) => (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const mark = (k) => `${k.prefix}-${k.n}${k.suffix}`;
const rowCells = (item) => Object.fromEntries(Object.entries(item?.cells ?? {}).map(([h, c]) => [h, String(c?.text ?? "")]));

/** How a binding's evidence reads when an eval rebinds a packet to a unit. */
const rebindEvidence = (kind, title, u) => ({
  tag: `its title "${title}" names ${u.tag}`, list_range: `its title "${title}" names ${u.tag} in a list or range`,
  cross_reference: `its schedule refers to "${title}"`, label_list: `"${title}" is labelled for ${u.tag}`,
  tag_body: `${u.tag} is printed inside "${title}"`, sibling: `"${title}" is about the same subject as its packet`,
  family_detail: `"${title}" is a detail for its family (${u.family})`, component_of: `its row puts it in the unit "${title}" is for`,
  system: `"${title}" is its plant's drawing`,
}[kind] ?? `"${title}" is its`);

/** The rebindings of one mode: item → the bindings that replace its own. */
export function swapPlan(mode, { project, first, readable }) {
  const own = new Map();
  for (const inst of first.instances) {
    for (const b of first.control.bindings[inst.item] ?? []) {
      if (b.proposal) continue;
      const e = own.get(b.packet) ?? own.set(b.packet, { kind: b.kind, families: new Set(), items: new Set() }).get(b.packet);
      e.families.add(inst.family);
      e.items.add(inst.item);
    }
  }
  const scheduled = first.instances.map((i) => tagKey(i.tag)).filter(Boolean);
  const packets = new Map(first.control.packets.map((p) => [p.id, p]));
  const plan = new Map();
  const used = new Map();
  for (const [pid, e] of own) {
    const p = packets.get(pid);
    let cands;
    if (mode === "family") {
      const drive = subjectFamily(p.title) === "VARIABLE_FREQUENCY_DRIVE";
      cands = readable.filter((u) => !e.families.has(u.family) && !e.items.has(u.item) && !(drive && printsDrive(rowCells(project.items[u.item]))));
    } else {
      if (e.kind !== "tag" && e.kind !== "list_range") continue;
      const named = new Set(titleTags(`${p.title} ${p.subtitle ?? ""}`, scheduled).map((x) => mark(x.key)));
      cands = readable.filter((u) => e.families.has(u.family) && !e.items.has(u.item) && !(tagKey(u.tag) && named.has(mark(tagKey(u.tag)))));
    }
    if (!cands.length) continue;
    const u = [...cands].sort((a, b) => (used.get(a.item) ?? 0) - (used.get(b.item) ?? 0) || a.item - b.item)[0];
    used.set(u.item, (used.get(u.item) ?? 0) + 1);
    (plan.get(u.item) ?? plan.set(u.item, []).get(u.item)).push({ packet: pid, kind: e.kind, evidence: rebindEvidence(e.kind, p.title, u) });
  }
  return plan;
}

/** What the swap's readings decided for the rebound units. */
export function swapOutcome(readings, plan, titleOf) {
  const s = { units: 0, questions: 0, rest: 0, applied: 0, proposal: 0, unresolved: 0, elsewhere: 0, elsewhere_applied: 0, answers: 0, unverified: 0, applied_list: [] };
  for (const u of readings.units) {
    const swaps = plan.get(u.item);
    if (!swaps) continue;
    s.units += 1;
    s.questions += u.questions.length;
    const swapped = new Set(swaps.map((b) => b.packet));
    for (const a of u.answers) {
      if (a.reader === "rp" || !a.cites.some((c) => swapped.has(c.packet))) continue;
      s.answers += 1;
      if (a.note === "unverified" || a.note === "refuted") s.unverified += 1;
    }
    for (const d of u.decisions) {
      if (d.outcome === "none") continue;
      const rests = /absence/.test(d.rule) || d.answers.some((a) => a.cites.some((c) => swapped.has(c.packet)));
      if (!rests) { s.elsewhere += 1; if (d.outcome === "applied") s.elsewhere_applied += 1; continue; }
      s.rest += 1;
      s[d.outcome] += 1;
      if (d.outcome === "applied") s.applied_list.push({ tag: u.tag, family: u.family, packets: swaps.map((b) => `${titleOf(b.packet)} [${b.kind}]`), question: d.question, value: d.value, rule: d.rule });
    }
  }
  return s;
}

/** The decisions two readings of one document make that differ (outcome or
 * value), over the decisions either makes. */
export function decisionDiff(a, b) {
  const key = (u, d) => `${u.item}|${d.question}`;
  const A = new Map(a.units.flatMap((u) => u.decisions.filter((d) => d.outcome !== "none").map((d) => [key(u, d), { u, d }])));
  const B = new Map(b.units.flatMap((u) => u.decisions.filter((d) => d.outcome !== "none").map((d) => [key(u, d), { u, d }])));
  const changes = [];
  let total = 0;
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    total += 1;
    const x = A.get(k)?.d, y = B.get(k)?.d;
    if (x?.outcome === y?.outcome && JSON.stringify(x?.value) === JSON.stringify(y?.value)) continue;
    const u = (A.get(k) ?? B.get(k)).u;
    const readers = (d) => (d ? d.answers.map((r) => `${r.reader}${r.run ?? ""}:${r.answer}${r.note ? `(${r.note})` : ""}`).join(" ") : "");
    changes.push({ tag: u.tag, question: k.split("|")[1], from: x ? `${x.outcome} ${JSON.stringify(x.value)}` : "none", to: y ? `${y.outcome} ${JSON.stringify(y.value)}` : "none", from_readers: readers(x), to_readers: readers(y) });
  }
  return { total, changes };
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const onlyAt = argv.indexOf("--only");
  const only = onlyAt >= 0 ? String(argv[onlyAt + 1] ?? "").split(",").filter(Boolean) : ITEMS;
  const [corpusDir] = argv.filter((a, i) => !a.startsWith("--") && !(onlyAt >= 0 && i === onlyAt + 1));
  if (!corpusDir || only.some((x) => !ITEMS.includes(x))) {
    console.error(`usage: node --import tsx scripts/control-intent-robustness-eval.mjs <corpus-dir> [--live] [--report] [--only ${ITEMS.join(",")}]`);
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
  const dev = split.dev.sets;
  const lib = resolve(fileURLToPath(new URL("../../web/src/lib/assemblies/", import.meta.url)));
  const { assemblies: library } = sanitizeAssemblyDefinitions(JSON.parse(readFileSync(join(lib, "starter", "us-typicals-v1.json"), "utf8")).assemblies);
  const transport = live ? httpTransport({ endpoint: process.env.OPENTAKEOFF_AI_ENDPOINT || "https://api.cerebras.ai", apiKey: process.env.CEREBRAS_API_KEY }) : null;
  const runsDir = join(corpus, "reports", "control-intent", "runs");
  const robustDir = join(corpus, "reports", "control-intent", "robustness-runs");
  const snaps = new Map();
  const snapshot = async (id) => {
    if (!snaps.has(id)) snaps.set(id, await snapshotInChild(corpus, id));
    return snaps.get(id);
  };
  const renderer = (id) => {
    const set = spec.sets.find((s) => s.id === id);
    const byName = new Map((set ? resolveSetFiles(corpus, spec, set) : []).map((f) => [f.split("/").pop(), f]));
    return pdfCropRenderer((file) => byName.get(file) ?? null);
  };
  /** Read a document with the dev runs plus an item's own; with --live, record what the item called that the dev
   * runs do not hold. `fresh`: an empty store (the re-run). */
  const readItem = async (item, id, project, opts = {}) => {
    const devRuns = readJsonl(join(runsDir, `${id}.jsonl`));
    const path = join(robustDir, item, `${id}.jsonl`);
    const recorded = opts.fresh && live ? [] : [...(opts.fresh ? [] : devRuns), ...readJsonl(path)];
    const store = memoryRunStore(recorded);
    const render = live ? renderer(opts.renderId ?? id) : null;
    const t0 = Date.now();
    const readings = await readControlIntent({ project, library }, { store, transport, render, concurrency: 6, ...(opts.rebind ? { rebind: opts.rebind } : {}) });
    const wall = (Date.now() - t0) / 1000;
    await render?.close();
    if (live) {
      const devHashes = new Set(opts.fresh ? [] : devRuns.map((r) => r.hash));
      const pinned = new Set(readings.runs);
      const mine = store.all().filter((r) => pinned.has(r.hash) && !devHashes.has(r.hash)).sort((a, b) => a.hash.localeCompare(b.hash));
      mkdirSync(join(robustDir, item), { recursive: true });
      if (mine.length) writeFileSync(path, mine.map((r) => JSON.stringify(r)).join("\n") + "\n");
    }
    return { readings, wall };
  };
  const replayOnly = async (id, project, readers) => {
    const store = memoryRunStore(readJsonl(join(runsDir, `${id}.jsonl`)));
    return readControlIntent({ project, library }, { store, transport: null, render: null, concurrency: 6, ...(readers ? { readers } : {}) });
  };

  const out = { generated_at: new Date().toISOString(), live, documents: dev, gate: GATE_D, items: {} };
  const L = [];
  const log = (s = "") => { L.push(s); console.log(s); };
  log(`ROBUSTNESS SUITE (GATE D) — dev, ${live ? "live model calls where not recorded (the re-run: afresh)" : "recorded runs only (no model is called)"}`);
  const errors = [];
  const snapOk = async (id) => { const s = await snapshot(id); if (s.error) errors.push({ id, error: String(s.error).split("\n")[0] }); return s.error ? null : s; };

  if (only.includes("negative")) {
    log("\n── negative controls: with PQ1 = no, every unit's controls record is none");
    const rows = [];
    for (const start of NEGATIVE) {
      const id = dev.find((d) => d.startsWith(start));
      if (!id) { errors.push({ id: start, error: "no such dev document" }); continue; }
      const snap = await snapOk(id);
      if (!snap) continue;
      const project = snapshotProject(snap);
      const readings = await replayOnly(id, project);
      const options = readings.units.flatMap((u) => u.decisions.filter((d) => d.question.startsWith("opt.")).map((d) => ({ u, d })));
      const applied = options.filter((x) => x.d.outcome === "applied").map((x) => ({ tag: x.u.tag, question: x.d.question, value: x.d.value, rule: x.d.rule, cite: String(x.d.cites[0]?.text ?? "").slice(0, 100) }));
      const no = applyAssemblies({ project, library, settings: { answers: { PQ1: "no" } }, readings });
      const controls = no.applications.filter((a) => a.layer === "controls");
      const none = (a) => !a.assembly || ["not_in_scope", "no_assembly", "excluded"].includes(a.status);
      const units = controls.filter((a) => a.instance.family !== "project");
      const project_open = controls.filter((a) => a.instance.family === "project" && !none(a)).map((a) => a.assembly?.id ?? a.status);
      const row = { id, packets: project.control?.packets?.length ?? 0, units_read: readings.units.length, options_applied: applied.length, proposals: options.filter((x) => x.d.outcome === "proposal").length, applied, pq1_no: { unit_records: units.length, units_not_none: units.filter((a) => !none(a)).map((a) => `${a.instance.tag} ${a.status}`), project_open } };
      rows.push(row);
      log(`  ${id.slice(0, 40).padEnd(40)} packets ${row.packets}; units read ${row.units_read}; option decisions applied ${row.options_applied}, proposals ${row.proposals}; PQ1 = no: ${row.pq1_no.unit_records} unit records, ${row.pq1_no.units_not_none.length} not none${project_open.length ? `; the project's own open: ${project_open.join(", ")}` : ""}`);
      for (const a of applied) log(`      applied ${a.tag} ${a.question} = ${JSON.stringify(a.value)} [${a.rule}] "${a.cite}"`);
    }
    const pass = rows.length === NEGATIVE.length && rows.every((r) => r.pq1_no.units_not_none.length === 0);
    out.items.negative = { rows, premise_no_packets: rows.every((r) => r.packets === 0), pass };
    log(`  negative controls: ${pass ? "PASS" : "FAIL"} (no unit is in scope with PQ1 = no)${rows.some((r) => r.packets) ? "; the premise, no control packets, does not hold: the option decisions above are what their packets print" : ""}`);
  }

  if (only.includes("swap")) {
    log("\n── adversarial swap: readings through a packet rebound to another unit must not apply (≥ 99%)");
    out.items.swap = {};
    for (const mode of ["family", "tag"]) {
      const total = { swaps: 0, units: 0, questions: 0, rest: 0, applied: 0, proposal: 0, unresolved: 0, elsewhere: 0, elsewhere_applied: 0, answers: 0, unverified: 0, calls: 0, applied_list: [] };
      for (const id of dev) {
        const snap = await snapOk(id);
        if (!snap) continue;
        const project = snapshotProject(snap);
        const first = applyAssemblies({ project, library });
        const byItem = new Map(first.instances.map((i) => [i.item, i]));
        const base = await replayOnly(id, project);
        const readable = base.units.map((u) => byItem.get(u.item)).filter(Boolean);
        const plan = swapPlan(mode, { project, first, readable });
        if (!plan.size) continue;
        const { readings } = await readItem(`swap-${mode}`, id, project, { rebind: (item, bindings) => plan.get(item) ?? bindings });
        const titles = new Map(first.control.packets.map((p) => [p.id, p.title]));
        const s = swapOutcome(readings, plan, (p) => titles.get(p));
        total.swaps += [...plan.values()].flat().length;
        for (const k of ["units", "questions", "rest", "applied", "proposal", "unresolved", "elsewhere", "elsewhere_applied", "answers", "unverified"]) total[k] += s[k];
        total.applied_list.push(...s.applied_list.map((a) => ({ id, ...a })));
        total.calls += readings.calls.r1.live + readings.calls.r2.live;
        if (readings.calls.r1.not_recorded + readings.calls.r2.not_recorded) errors.push({ id, error: `swap-${mode}: ${readings.calls.r1.not_recorded + readings.calls.r2.not_recorded} model requests not recorded (run with --live)` });
      }
      const notApplied = total.rest ? (total.rest - total.applied) / total.rest : 1;
      const pass = notApplied >= GATE_D.swap_not_applied_min;
      out.items.swap[mode] = { ...total, not_applied_share: notApplied, pass };
      log(`  ${mode === "family" ? "another family" : "another tag, same family"}: ${total.swaps} packets rebound to ${total.units} units asked ${total.questions} questions; decisions resting on the swap ${total.rest}: applied ${total.applied}, proposal ${total.proposal}, unresolved ${total.unresolved} → ${total.rest ? `${pct(total.rest - total.applied, total.rest)} not applied` : "none read through them"} ${pass ? "PASS" : "FAIL"}`);
      log(`      reader answers citing a swapped packet ${total.answers}: ${total.unverified} unverified (${pct(total.unverified, total.answers)}); decided elsewhere (the zone plan) ${total.elsewhere}, applied ${total.elsewhere_applied}${live ? `; live calls ${total.calls}` : ""}`);
      for (const a of total.applied_list) log(`      APPLIED ${a.id.slice(0, 16)} ${a.tag} (${a.family}) ← ${a.packets.join(" + ")}: ${a.question} = ${JSON.stringify(a.value)} [${a.rule}]`);
    }
  }

  if (only.includes("modeloff")) {
    log("\n── model-off: R0 alone, 0 applied-wrong");
    const reading = await readingTools(corpus, "r0");
    const decisions = [], stats = [];
    for (const id of dev) {
      const typPath = join(corpus, "keys", `${id}.typicals.csv`), attrPath = join(corpus, "keys", `${id}.attrs.csv`), pPath = join(corpus, "keys", `${id}.project.csv`);
      if (!existsSync(typPath) || !existsSync(attrPath)) { errors.push({ id, error: "no keys" }); continue; }
      const snap = await snapOk(id);
      if (!snap) continue;
      const typKey = parseTypicalKeyCsv(readFileSync(typPath, "utf8"), typPath);
      const attrKey = parseAttrKeyCsv(readFileSync(attrPath, "utf8"), attrPath);
      const settings = existsSync(pPath) ? { answers: parseProjectKeyCsv(readFileSync(pPath, "utf8")) } : {};
      const readings = await reading.read(id, snapshotProject(snap), library, settings);
      const { outcomes } = scoreTypicalSet({ setId: id, typKey, attrKey, snapshot: snap, library, settings, readings });
      const scored = scoreReadings({ setId: id, typKey, outcomes, readings });
      decisions.push(...scored.decisions);
      stats.push(...scored.readerStats);
    }
    await reading.close();
    const s = summarize(decisions, stats);
    const wrong = s.total["applied-wrong"];
    const pass = wrong === GATE_D.modeloff_applied_wrong;
    out.items.modeloff = { applied: s.applied, applied_wrong: wrong, absence: s.absence, invented: s.total.INVENTED, pass };
    log(`  R0 alone: applied ${s.applied}, applied-wrong ${wrong}, INVENTED ${s.total.INVENTED}; absences applied ${s.absence["applied-right"] + s.absence["applied-wrong"]}, left as proposals ${s.absence["proposal-right"] + s.absence["proposal-wrong"]} → ${pass ? "PASS" : "FAIL"}`);
  }

  if (only.includes("replay")) {
    log("\n── replay: the recorded readings, applied twice, byte-identical");
    const rows = [];
    for (const id of dev) {
      const snap = await snapOk(id);
      if (!snap) continue;
      const pPath = join(corpus, "keys", `${id}.project.csv`);
      const settings = existsSync(pPath) ? { answers: parseProjectKeyCsv(readFileSync(pPath, "utf8")) } : {};
      const pass1 = async () => {
        const project = snapshotProject(snap);
        const readings = await replayOnly(id, project);
        const a = applyAssemblies({ project, library, settings, readings });
        return { hash: createHash("sha256").update(JSON.stringify({ readings: readings.units, applications: a.applications, lines: a.lines })).digest("hex"), lines: a.lines.length, calls: readings.calls };
      };
      const one = await pass1(), two = await pass1();
      rows.push({ id, identical: one.hash === two.hash, lines: one.lines, replayed: one.calls.r1.replayed + one.calls.r2.replayed, not_recorded: one.calls.r1.not_recorded + one.calls.r2.not_recorded });
    }
    const pass = rows.length > 0 && rows.every((r) => r.identical && r.not_recorded === 0);
    out.items.replay = { rows, pass };
    log(`  ${rows.filter((r) => r.identical).length} of ${rows.length} documents byte-identical (${rows.reduce((s, r) => s + r.replayed, 0)} runs replayed, ${rows.reduce((s, r) => s + r.not_recorded, 0)} not recorded) → ${pass ? "PASS" : "FAIL"}`);
  }

  if (only.includes("rerun")) {
    log(`\n── re-run: the models read the dev documents again (${live ? "afresh, now" : "the last live re-run, replayed"}) against the recorded replay: ≤ 2% of decisions change`);
    const metaPath = join(robustDir, "rerun", "meta.json");
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : { walls: {} };
    const rows = [];
    let total = 0;
    const changes = [];
    for (const id of dev) {
      const snap = await snapOk(id);
      if (!snap) continue;
      const project = snapshotProject(snap);
      const replay = await replayOnly(id, project);
      const { readings, wall } = await readItem("rerun", id, project, { fresh: true });
      if (!live && readings.calls.r1.not_recorded + readings.calls.r2.not_recorded) errors.push({ id, error: `rerun: ${readings.calls.r1.not_recorded + readings.calls.r2.not_recorded} requests the last live re-run did not record (run with --live)` });
      if (live) meta.walls[id] = Math.round(wall);
      const d = decisionDiff(replay, readings);
      total += d.total;
      changes.push(...d.changes.map((c) => ({ id, ...c })));
      const runs = readJsonl(join(robustDir, "rerun", `${id}.jsonl`));
      rows.push({ id, decisions: d.total, changed: d.changes.length, calls: runs.length, tokens: runs.reduce((s, r) => s + (r.usage?.total_tokens ?? 0), 0), wall_s: meta.walls[id] ?? null });
    }
    if (live) { mkdirSync(join(robustDir, "rerun"), { recursive: true }); writeFileSync(metaPath, `${JSON.stringify({ ...meta, recorded_at: new Date().toISOString() }, null, 2)}\n`); }
    const share = total ? changes.length / total : 0;
    const walls = rows.map((r) => r.wall_s).filter((w) => w !== null);
    const maxWall = walls.length ? Math.max(...walls) : null;
    const pass = share <= GATE_D.rerun_changed_max;
    const costPass = maxWall !== null && maxWall <= GATE_D.wall_s_max;
    out.items.rerun = { rows, decisions: total, changed: changes.length, share, changes, pass };
    out.items.cost = { calls: rows.reduce((s, r) => s + r.calls, 0), tokens: rows.reduce((s, r) => s + r.tokens, 0), max_wall_s: maxWall, total_wall_s: walls.reduce((s, w) => s + w, 0), recorded_at: meta.recorded_at ?? null, pass: costPass };
    log(`  ${changes.length} of ${total} decisions changed (${pct(changes.length, total)}) → ${pass ? "PASS" : "FAIL"}`);
    for (const c of changes) log(`      ${c.id.slice(0, 16)} ${c.tag} ${c.question}: ${c.from} → ${c.to}  [${c.from_readers || "-"} → ${c.to_readers || "-"}]`);
    log(`  cost (the ${live ? "live re-run just now" : `live re-run of ${meta.recorded_at ?? "?"}`}): ${out.items.cost.calls} model calls, ${out.items.cost.tokens} tokens; wall per document at most ${maxWall ?? "?"} s, ${out.items.cost.total_wall_s} s in all → ${costPass ? "PASS" : "FAIL"} (≤ ${GATE_D.wall_s_max} s)`);
    for (const r of rows) log(`      ${r.id.slice(0, 40).padEnd(40)} ${String(r.calls).padStart(4)} calls ${String(r.tokens).padStart(8)} tokens ${String(r.wall_s ?? "?").padStart(4)} s; ${r.changed}/${r.decisions} changed`);
  }

  if (only.includes("raster")) {
    log("\n── raster: a dev document's image-only rendition applies nothing its vector document does not");
    const rows = [];
    for (const id of dev) {
      const rid = `${id}-raster`;
      if (!spec.sets.some((s) => s.id === rid)) continue;
      const vsnap = await snapOk(id), rsnap = await snapOk(rid);
      if (!vsnap || !rsnap) continue;
      const vector = await replayOnly(id, snapshotProject(vsnap));
      const rproject = snapshotProject(rsnap);
      const { readings } = await readItem("raster", rid, rproject);
      const applied = (r) => new Map(r.units.flatMap((u) => u.decisions.filter((d) => d.outcome === "applied").map((d) => [`${u.tag}|${d.question}`, JSON.stringify(d.value)])));
      const A = applied(vector), B = applied(readings);
      const outside = [...B].filter(([k, v]) => A.get(k) !== v).map(([k, v]) => `${k} = ${v}`);
      rows.push({ id: rid, vector_applied: A.size, items: rproject.items.length, packets: rproject.control?.packets?.length ?? 0, applied: B.size, outside });
      log(`  ${rid}: ${rproject.items.length} items, ${rproject.control?.packets?.length ?? 0} control packets, ${B.size} applied (the vector document: ${A.size}); not the vector document's: ${outside.length}`);
      for (const o of outside) log(`      NOT THE VECTOR'S ${o}`);
    }
    const pass = rows.length > 0 && rows.every((r) => r.outside.length === 0);
    out.items.raster = { rows, pass: rows.length ? pass : null };
    log(`  raster: ${rows.length ? (pass ? "PASS" : "FAIL") : "n/a (no rendition staged)"}`);
  }

  const verdicts = [
    ["negative", out.items.negative?.pass], ["swap (family)", out.items.swap?.family?.pass], ["swap (tag)", out.items.swap?.tag?.pass],
    ["model-off", out.items.modeloff?.pass], ["replay", out.items.replay?.pass], ["re-run", out.items.rerun?.pass], ["cost", out.items.cost?.pass], ["raster", out.items.raster?.pass],
  ].filter(([, v]) => v !== undefined);
  out.verdict = Object.fromEntries(verdicts);
  out.errors = errors;
  log(`\nGATE D (dev): ${verdicts.map(([k, v]) => `${k} ${v === null ? "n/a" : v ? "ok" : "FAIL"}`).join(" · ")}`);
  if (errors.length) log(`\nERRORS: ${errors.map((e) => `${e.id}: ${e.error}`).join("; ")}`);
  if (flag("--report")) {
    const dir = join(corpus, "reports", "control-intent");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "05-robustness-dev.json"), `${JSON.stringify(out, null, 2)}\n`);
    writeFileSync(join(dir, "05-robustness-dev.md"), `# Robustness suite (GATE D) — dev\n\n\`\`\`\n${L.join("\n")}\n\`\`\`\n`);
    console.log("wrote reports/control-intent/05-robustness-dev.{json,md}");
  }
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("control-intent-robustness-eval.mjs")) await main();
