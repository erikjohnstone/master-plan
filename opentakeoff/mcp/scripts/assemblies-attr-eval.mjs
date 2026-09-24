// ASSEMBLIES goal, instrument 2 — the ATTRIBUTE EVAL (goals/ASSEMBLIES.md
// MEASURE 2; GATE 2 is read from it).
//
// SHOULD THIS BE ON THE SHARED PATH? What it measures is shared: the
// normalizer (web/src/lib/assemblies/normalize.ts) applied to the compile
// (compileTakeoff(…, "hvac_equipment") over Session.graphForPipeline). The
// scoring below is eval-only; no surface imports it.
//
//   node --import tsx scripts/assemblies-attr-eval.mjs <corpus-dir> [setId ...]
//        [--heldout] [--null] [--report] [--detail]
//
//   --heldout  score the frozen held-out documents (reports/assemblies/
//              01-split.json) instead of dev. Gates only: never tune on them,
//              so only aggregates are printed.
//   --null     score a normalizer that knows nothing: the floor.
//   --report   write reports/assemblies/02-attr-eval-<dev|heldout>.{json,md}.
//   --detail   (dev only) list every wrong, invented, missed and
//              out-of-scope value with its cite and rule.
//
// Per set, a child process gets the sheet graph from the content-addressed
// sheet-graph cache (scripts/sheetGraphCache.mjs: its key covers the graph
// build, never the compile or this normalizer; OPENTAKEOFF_GRAPH_NO_CACHE=1
// rebuilds) and compiles hvac_equipment. The parent normalizes and scores,
// so a normalizer edit re-scores without rebuilding anything.
//
// Scoring, one outcome per key line (instance x attribute; reports/
// assemblies/key-work/README.md "How a key is scored"):
//   the key has a value:  exact | wrong | missed (the normalizer has none)
//   the key has none (not printed, a blank cell, a printed '-', a cell that
//   is not one value):    correctly-unknown | invented (it reports one)
// A value counts against a key line only when its cite lies in that key's
// table: the same sheet, and the key's title or the title a printed part of
// it carries. Otherwise it is "out of key scope", neither right nor wrong.
// Every value reported from a table keyed "rows: none" is invented. Compile
// items in a keyed table that match no keyed instance (a row past the draw's
// 30-row cap, a printed unit the key does not cover) are out of key scope
// (ASSEMBLIES_BUG_CATALOGUE AS-13), counted but not scored.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { attributeSpec, canonicalAttributeFor, keyValueToCanonical } from "../../web/src/lib/assemblies/attributes.ts";
import { vfdDrivenTags } from "../../web/src/lib/assemblies/normalize.ts";
import { compileTableTitle, compiledProjectOf, sheetPage, tableContextOf } from "../../web/src/lib/assemblies/apply.ts";

export const KEY_COLUMNS = ["sheet", "table_title", "tag", "family", "attribute", "value", "unit", "source_header", "note"];

/** GATE 2 (goals/ASSEMBLIES.md WP2): share of keyed printed values. */
export const GATES = {
  dev: { exact: 0.98, wrong: 0.005, invented: 0 },
  heldout: { exact: 0.95, wrong: 0.01, invented: 0 },
};

function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; continue; }
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) { cells.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells;
}

/** The compile's own rule for a table title (apply.ts, shared). */
export { compileTableTitle };

/** keys/<set>.attrs.csv → its lines, plus the printed titles of tables keyed
 * in parts (from the key's own "#   sheet | title | family | rows | render:
 * part N, printed as "…"" header lines). */
export function parseAttrKeyCsv(text, path = "<key>") {
  const all = text.split(/\r?\n/);
  const data = all.filter((l) => l.trim() && !/^\s*#/.test(l));
  if (!data.length) throw new Error(`${path}: no header line`);
  const head = splitCsvLine(data[0]).map((h) => h.trim());
  if (head.join(",") !== KEY_COLUMNS.join(",")) throw new Error(`${path}: header reads "${head.join(",")}", expected "${KEY_COLUMNS.join(",")}"`);
  const rows = data.slice(1).map((line, i) => {
    const c = splitCsvLine(line);
    if (c.length !== KEY_COLUMNS.length) throw new Error(`${path}: data line ${i + 1} has ${c.length} fields, not ${KEY_COLUMNS.length}`);
    return Object.fromEntries(KEY_COLUMNS.map((k, j) => [k, c[j]]));
  });
  const parts = [];
  for (const line of all) {
    const m = line.match(/^#\s+(\S+#\d+) \| (.*?) \| [A-Z_]+ \| .*? \| render: part \d+, printed as "([^"]+)"/);
    if (m) parts.push({ sheet: m[1], table_title: m[2] === "(untitled)" ? "" : m[2], printed: m[3] });
  }
  return { rows, parts };
}

/** Tag identity for matching a compile item to a key instance: case,
 * whitespace and dash glyphs never distinguish two units. */
const DASHES = /[‐-―−﹘﹣－]/g;
export const canonTag = (t) => String(t ?? "").toUpperCase().replace(DASHES, "-").replace(/\s+/g, "");
const dashlessTag = (t) => canonTag(t).replace(/[-.]/g, "");

/** Keyed tables of one key: sheet|title → { titles in scope, table-level
 * "rows: none", instances by tag }. */
export function keyTables(key) {
  const tables = new Map();
  for (const r of key.rows) {
    const k = `${r.sheet}|${r.table_title}`;
    let t = tables.get(k);
    if (!t) tables.set(k, t = { sheet: r.sheet, table_title: r.table_title, titles: new Set([r.table_title]), none: null, instances: new Map() });
    if (r.tag === "" && r.attribute === "") { t.none = r; continue; }
    let inst = t.instances.get(r.tag);
    if (!inst) t.instances.set(r.tag, inst = { sheet: r.sheet, table_title: r.table_title, tag: r.tag, family: r.family, lines: [] });
    inst.lines.push(r);
  }
  for (const p of key.parts) tables.get(`${p.sheet}|${p.table_title}`)?.titles.add(compileTableTitle(p.printed));
  return tables;
}

/** Which slice a key line reports in: a value read from the table's notes,
 * one the key author read from the row's structure, or a grid cell. */
export function lineSlice(line) {
  if (/^\[?NOTES?\b/i.test(line.source_header)) return "notes";
  if (/author's reading/.test(line.note)) return "reading";
  return "grid";
}

export function sameCanonical(attr, a, b) {
  const spec = attributeSpec(attr);
  if (spec.kind === "number") {
    return typeof a === "number" && typeof b === "number"
      && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (spec.kind === "text") {
    const t = (s) => String(s).toUpperCase().replace(/\s+/g, " ").trim();
    return t(a) === t(b);
  }
  return String(a) === String(b);
}

export function matchItem(inst, tableItems, used) {
  let pool = tableItems.filter((it) => !used.has(it) && canonTag(it.tag) === canonTag(inst.tag));
  let how = "tag";
  if (!pool.length) {
    pool = tableItems.filter((it) => !used.has(it) && dashlessTag(it.tag) === dashlessTag(inst.tag));
    how = "tag without dashes";
    if (new Set(pool.map((it) => it.tag)).size > 1) return { item: null, why: `${pool.length} compile items match ${inst.tag} only without dashes` };
  }
  if (!pool.length) return { item: null, why: "no compile item with this tag in the keyed table" };
  const same = pool.filter((it) => it.family === inst.family);
  const item = (same.length ? same : pool)[0];
  used.add(item);
  return { item, how };
}

const citeInTable = (cite, t) => Boolean(cite) && cite.sheet === t.sheet && t.titles.has(cite.table_title);

/**
 * Score one set. `snapshot` is the child's compile ({ items, tables });
 * `normalize(item, family, table)` returns { attributes, unknown }.
 */
export function scoreSet({ setId, key, snapshot, normalize }) {
  const tables = keyTables(key);
  const byTable = new Map();
  for (const it of snapshot.items) {
    const k = `${it.sheet_id}|${it.table_title}`;
    if (!byTable.has(k)) byTable.set(k, []);
    byTable.get(k).push(it);
  }
  const memo = new Map();
  const read = new WeakMap();
  // The units the project's drive schedules name as their loads.
  const driven = vfdDrivenTags(snapshot.items);
  const norm = (it) => {
    if (!memo.has(it)) {
      const table = tableContextOf(it, snapshot.tables, snapshot.pages, read);
      memo.set(it, normalize(it, it.family, table && driven.size ? { ...table, driven } : table));
    }
    return memo.get(it);
  };
  const outcomes = [];
  const instances = [];
  const outOfScopeItems = [];
  const unscored = [];
  for (const t of tables.values()) {
    const tableItems = [...t.titles].flatMap((title) => byTable.get(`${t.sheet}|${title}`) || []);
    if (t.none) {
      for (const it of tableItems) {
        for (const [attribute, got] of Object.entries(norm(it).attributes)) {
          outcomes.push({ set: setId, sheet: t.sheet, table_title: t.table_title, tag: it.tag, family: it.family, attribute,
            keyed: false, slice: "grid", outcome: "invented", key_value: "", key_note: t.none.note, got });
        }
      }
      continue;
    }
    const used = new Set();
    for (const inst of t.instances.values()) {
      const m = matchItem(inst, tableItems, used);
      instances.push({ set: setId, sheet: t.sheet, table_title: t.table_title, tag: inst.tag, family: inst.family,
        matched: Boolean(m.item), how: m.how ?? null, why: m.why ?? null, item_family: m.item?.family ?? null });
      const n = m.item ? norm(m.item) : null;
      const scoredAttrs = new Set();
      for (const line of inst.lines) {
        const attribute = canonicalAttributeFor(inst.family, line.attribute);
        scoredAttrs.add(attribute);
        const got = n?.attributes?.[attribute] ?? null;
        const keyed = line.value !== "";
        let outcome;
        if (got && !citeInTable(got.cite, t)) outcome = "out_of_scope";
        else if (keyed) {
          outcome = !got ? "missed"
            : sameCanonical(attribute, got.value, keyValueToCanonical(inst.family, line.attribute, line.value, line.unit)) ? "exact" : "wrong";
        } else outcome = got ? "invented" : "correctly_unknown";
        outcomes.push({ set: setId, sheet: t.sheet, table_title: t.table_title, tag: inst.tag, family: inst.family, attribute,
          keyed, slice: lineSlice(line), outcome, key_value: line.value, key_unit: line.unit, key_note: line.note,
          source_header: line.source_header, got,
          unknown: got ? null : (n ? (n.unknown?.[attribute]?.reason ?? null) : m.why) });
      }
      for (const [attribute, got] of Object.entries(n?.attributes ?? {})) {
        if (!scoredAttrs.has(attribute)) unscored.push({ set: setId, tag: inst.tag, family: inst.family, attribute, got });
      }
    }
    for (const it of tableItems) {
      if (used.has(it)) continue;
      outOfScopeItems.push({ set: setId, sheet: t.sheet, table_title: t.table_title, tag: it.tag, family: it.family,
        values: Object.keys(norm(it).attributes).length });
    }
  }
  return { outcomes, instances, outOfScopeItems, unscored };
}

const OUTCOMES = ["exact", "wrong", "missed", "out_of_scope", "correctly_unknown", "invented"];

export function tally(outcomes) {
  const t = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
  let printed = 0;
  let empty = 0;
  for (const o of outcomes) {
    t[o.outcome] += 1;
    if (o.keyed) printed += 1; else empty += 1;
  }
  return { lines: outcomes.length, printed, empty, ...t,
    exact_pct: printed ? t.exact / printed : null, wrong_pct: printed ? t.wrong / printed : null };
}

export function gateVerdict(total, side) {
  const g = GATES[side];
  const checks = [
    { name: "exact", ok: total.exact_pct !== null && total.exact_pct >= g.exact, need: `>= ${(g.exact * 100).toFixed(1)}%` },
    { name: "wrong", ok: total.wrong_pct !== null && total.wrong_pct <= g.wrong, need: `<= ${(g.wrong * 100).toFixed(1)}%` },
    { name: "invented", ok: total.invented <= g.invented, need: `= ${g.invented}` },
  ];
  return { pass: checks.every((c) => c.ok), checks };
}

const group = (outcomes, keyOf) => {
  const m = new Map();
  for (const o of outcomes) {
    const k = keyOf(o);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(o);
  }
  return [...m.entries()].map(([k, os]) => [k, tally(os)]).sort((a, b) => b[1].printed - a[1].printed || String(a[0]).localeCompare(String(b[0])));
};

export function summarize(results) {
  const outcomes = results.flatMap((r) => r.outcomes);
  return {
    total: tally(outcomes),
    by_slice: group(outcomes, (o) => o.slice),
    by_family: group(outcomes, (o) => o.family),
    by_attribute: group(outcomes, (o) => o.attribute),
    by_set: group(outcomes, (o) => o.set),
    instances: results.flatMap((r) => r.instances),
    out_of_scope_items: results.flatMap((r) => r.outOfScopeItems),
    unscored: results.flatMap((r) => r.unscored),
  };
}

const pct = (x) => (x === null ? "   —  " : `${(x * 100).toFixed(1).padStart(5)}%`);
const HEAD = `${"".padEnd(34)}  lines printed  exact  wrong missed    oos | empty c-unkn invent | exact%  wrong%`;
const row = (label, t) => `${String(label).slice(0, 34).padEnd(34)} ${String(t.lines).padStart(6)} ${String(t.printed).padStart(7)} ${String(t.exact).padStart(6)} ${String(t.wrong).padStart(6)} ${String(t.missed).padStart(6)} ${String(t.out_of_scope).padStart(6)} | ${String(t.empty).padStart(5)} ${String(t.correctly_unknown).padStart(6)} ${String(t.invented).padStart(6)} | ${pct(t.exact_pct)} ${pct(t.wrong_pct)}`;

export function renderText(summary, { side, detail, results, normalizer }) {
  const L = [];
  const matched = summary.instances.filter((i) => i.matched).length;
  L.push(`ATTRIBUTE EVAL (instrument 2) — ${side}, normalizer: ${normalizer}`);
  L.push(`key instances matched to a compile item: ${matched}/${summary.instances.length}; `
    + `out-of-key-scope compile items in keyed tables: ${summary.out_of_scope_items.length}; unscored values (extensions): ${summary.unscored.length}`);
  L.push("");
  L.push(HEAD);
  L.push(row("ALL", summary.total));
  for (const [k, t] of summary.by_slice) L.push(row(`  slice: ${k}`, t));
  L.push("");
  L.push("per family");
  for (const [k, t] of summary.by_family) L.push(row(`  ${k}`, t));
  L.push("");
  L.push("per set");
  for (const [k, t] of summary.by_set) L.push(row(`  ${k}`, t));
  L.push("");
  L.push("per attribute");
  for (const [k, t] of summary.by_attribute) L.push(row(`  ${k}`, t));
  const unmatched = summary.instances.filter((i) => !i.matched);
  if (unmatched.length) {
    L.push("");
    L.push(`key instances with no compile item (${unmatched.length}):`);
    for (const i of unmatched) L.push(`  ${i.set} ${i.sheet} "${i.table_title}" ${i.tag} (${i.family}): ${i.why}`);
  }
  if (detail) {
    const outcomes = results.flatMap((r) => r.outcomes);
    for (const kind of ["invented", "wrong", "out_of_scope", "missed"]) {
      const os = outcomes.filter((o) => o.outcome === kind);
      if (!os.length) continue;
      L.push("");
      L.push(`${kind} (${os.length}):`);
      for (const o of os) {
        const got = o.got ? ` got ${JSON.stringify(o.got.value)} from "${o.got.cite?.header}" = "${o.got.printed}" [${o.got.rule}]` : "";
        const why = !o.got && o.unknown ? ` — ${o.unknown}` : "";
        L.push(`  ${o.set} | ${o.tag} ${o.family}.${o.attribute}: key ${JSON.stringify(o.key_value)}${o.key_unit ? ` ${o.key_unit}` : ""} (${o.source_header || o.key_note})${got}${why}`);
      }
    }
    if (summary.out_of_scope_items.length) {
      L.push("");
      L.push("compile items in keyed tables that match no keyed instance:");
      for (const i of summary.out_of_scope_items) L.push(`  ${i.set} "${i.table_title}" ${i.tag} (${i.family}), ${i.values} value(s)`);
    }
  }
  const verdict = gateVerdict(summary.total, side);
  L.push("");
  L.push(`GATE 2 (${side}): ${verdict.checks.map((c) => `${c.name} ${c.name === "invented" ? summary.total.invented : pct(summary.total[`${c.name}_pct`]).trim()} (need ${c.need}) ${c.ok ? "ok" : "FAIL"}`).join(" · ")} → ${verdict.pass ? "PASS" : "FAIL"}`);
  return L.join("\n");
}

// ── CLI ─────────────────────────────────────────────────────────────────────
async function snapshotSet(corpus, spec, set) {
  const { resolveSetFiles } = await import("./corpusFiles.mjs");
  const { cachedSheetGraph } = await import("./sheetGraphCache.mjs");
  const { compileTakeoff } = await import("../../web/src/lib/compileTakeoff.mjs");
  const files = resolveSetFiles(corpus, spec, set);
  const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
  const t0 = Date.now();
  let built = false;
  const graph = await cachedSheetGraph(files[0], {
    expectedSha256: sha(files[0]),
    identity: files.slice(1).map(sha),
    names: files.slice(1).map((p) => basename(p)),
    compute: async () => {
      built = true;
      const { Session } = await import("../src/session.ts");
      const session = new Session();
      for (let i = 0; i < files.length; i++) await session.loadPlan(files[i], { merge: i > 0 });
      return session.graphForPipeline();
    },
  });
  // The compile reads the graph alone (corpusTakeoff.mjs sheetRecords: the UI
  // path); a Session would only add page accounting, which is not scored.
  const hvac = compileTakeoff(null, graph, "hvac_equipment");
  // The rows, their tables and their pages' text spans, assembled by the
  // apply path's own builder (apply.ts compiledProjectOf); only reading a
  // page is this script's own: the PDF opened by path. The parent reads the
  // notes from the spans (scheduleNotes.ts), so a notes-reader change never
  // needs a new snapshot.
  const { openPdf, textSpans } = await import("../src/pdf.ts");
  const fileOf = new Map(files.map((f) => [basename(f), f]));
  const docs = new Map();
  const { items, tables, pages } = await compiledProjectOf(hvac, graph, async (sheet) => {
    const at = sheetPage(sheet);
    const file = at && fileOf.get(at.file);
    if (!file) return null;
    if (!docs.has(at.file)) docs.set(at.file, await openPdf(file));
    return textSpans(await docs.get(at.file).page(at.page));
  });
  for (const doc of docs.values()) await doc.destroy();
  return { id: set.id, graph: built ? "built" : "cache", seconds: Math.round((Date.now() - t0) / 1000), items, tables, pages };
}

/** One set's compile snapshot (snapshotSet), taken in a child process so a
 * crash or a runaway graph build cannot take the caller down. Resolves to
 * the snapshot, or to { id, error }. */
export function snapshotInChild(corpus, id) {
  const thisScript = fileURLToPath(import.meta.url);
  const TIMEOUT_MS = Number(process.env.OPENTAKEOFF_EVAL_TIMEOUT_MS) || 45 * 60 * 1000;
  return new Promise((res) => {
    const started = Date.now();
    process.stderr.write(`· ${id} …\n`);
    const child = spawn(process.execPath, ["--import", "tsx", thisScript, corpus, "--single-json", id], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stderr.write(`  ${id}: ${value.error ? "ERROR" : `graph from ${value.graph}, ${value.items.length} compile items`} in ${Math.round((Date.now() - started) / 1000)}s\n`);
      res(value);
    };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish({ id, error: `timed out after ${TIMEOUT_MS}ms` }); }, TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", (code) => {
      if (code !== 0 || !out.trim()) return finish({ id, error: `child exited ${code} with no result` });
      try { finish(JSON.parse(out)); } catch (e) { finish({ id, error: `bad child JSON: ${e?.message || e}` }); }
    });
    child.on("error", (e) => finish({ id, error: String(e?.message || e) }));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const singleIdx = argv.indexOf("--single-json");
  const positional = argv.filter((a, i) => !a.startsWith("--") && !(singleIdx >= 0 && i === singleIdx + 1));
  const [corpusDir, ...only] = positional;
  if (!corpusDir) {
    console.error("usage: node --import tsx scripts/assemblies-attr-eval.mjs <corpus-dir> [setId ...] [--heldout] [--null] [--report] [--detail]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
  const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));

  if (singleIdx >= 0) {
    const set = spec.sets.find((s) => s.id === argv[singleIdx + 1]);
    let result;
    try {
      if (!set) throw new Error(`unknown set id: ${argv[singleIdx + 1]}`);
      result = await snapshotSet(corpus, spec, set);
    } catch (e) {
      result = { id: argv[singleIdx + 1], error: String(e?.stack || e?.message || e) };
    }
    // Wait for the write, then exit: nothing after this line may run in the child.
    await new Promise((r) => process.stdout.write(JSON.stringify(result), r));
    process.exit(0);
  }

  const side = flag("--heldout") ? "heldout" : "dev";
  const detail = flag("--detail");
  if (detail && side === "heldout") {
    console.error("--detail is dev-only: held-out documents are scored at gates, never tuned on");
    process.exit(2);
  }
  const split = JSON.parse(readFileSync(join(corpus, "reports", "assemblies", "01-split.json"), "utf8"));
  const sideSets = split[side].sets;
  const unknownOnly = only.filter((id) => !sideSets.includes(id));
  if (unknownOnly.length) {
    console.error(`not ${side} documents: ${unknownOnly.join(", ")}`);
    process.exit(2);
  }
  const setIds = only.length ? only : sideSets;
  const normalizer = flag("--null") ? "null" : "normalize.ts";
  const normalize = flag("--null")
    ? (it, family) => ({ family, tag: it.tag, attributes: {}, unknown: {} })
    : (await import("../../web/src/lib/assemblies/normalize.ts")).normalizeCompileItem;

  const snapshot = (id) => snapshotInChild(corpus, id);

  const results = [];
  const errors = [];
  for (const id of setIds) {
    const keyPath = join(corpus, "keys", `${id}.attrs.csv`);
    if (!existsSync(keyPath)) { errors.push({ id, error: `no key ${keyPath}` }); continue; }
    const key = parseAttrKeyCsv(readFileSync(keyPath, "utf8"), keyPath);
    const snap = await snapshot(id);
    if (snap.error) { errors.push({ id, error: snap.error.split("\n")[0] }); continue; }
    results.push({ id, ...scoreSet({ setId: id, key, snapshot: snap, normalize }) });
  }
  const summary = summarize(results);
  const text = renderText(summary, { side, detail, results, normalizer });
  console.log(text);
  if (errors.length) {
    console.log(`\nERRORS (${errors.length}) — these documents were not scored, so no gate can pass:`);
    for (const e of errors) console.log(`  ${e.id}: ${e.error}`);
  }
  if (flag("--report")) {
    const dir = join(corpus, "reports", "assemblies");
    mkdirSync(dir, { recursive: true });
    const digest = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);
    const lib = resolve(fileURLToPath(new URL("../../web/src/lib/assemblies/", import.meta.url)));
    const verdict = gateVerdict(summary.total, side);
    const json = {
      generated_at: new Date().toISOString(),
      side,
      normalizer,
      normalize_ts_sha256: digest(join(lib, "normalize.ts")),
      attributes_ts_sha256: digest(join(lib, "attributes.ts")),
      documents: setIds,
      errors,
      gate: { ...GATES[side], pass: verdict.pass && !errors.length },
      total: summary.total,
      by_slice: Object.fromEntries(summary.by_slice),
      by_family: Object.fromEntries(summary.by_family),
      by_attribute: Object.fromEntries(summary.by_attribute),
      by_set: Object.fromEntries(summary.by_set),
      instances_unmatched: summary.instances.filter((i) => !i.matched),
      out_of_scope_items: summary.out_of_scope_items.length,
      unscored_values: summary.unscored.length,
    };
    const base = join(dir, `02-attr-eval-${side}`);
    writeFileSync(`${base}.json`, `${JSON.stringify(json, null, 2)}\n`);
    writeFileSync(`${base}.md`, `# Attribute eval — ${side}\n\n\`\`\`\n${text}\n\`\`\`\n`);
    console.log(`\nwrote ${base}.json and .md`);
  }
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("assemblies-attr-eval.mjs")) await main();
