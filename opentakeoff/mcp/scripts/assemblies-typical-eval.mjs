// ASSEMBLIES goal, instrument 3 — the TYPICAL EVAL (goals/ASSEMBLIES.md
// MEASURE 3; GATE 5 is read from it).
//
// SHOULD THIS BE ON THE SHARED PATH? What it measures is shared: the apply
// path (web/src/lib/assemblies/apply.ts: normalize, instances, derived
// attributes, select) over the compile (compileTakeoff(…, "hvac_equipment")
// over Session.graphForPipeline). The scoring below is eval-only; no surface
// imports it.
//
//   node --import tsx scripts/assemblies-typical-eval.mjs <corpus-dir> [setId ...]
//        [--heldout] [--report] [--detail]
//
//   --heldout  score the frozen held-out documents (reports/assemblies/
//              01-split.json) instead of dev. Gates only: never tune on them,
//              so only aggregates are printed.
//   --report   write reports/assemblies/05-typical-eval-<dev|heldout>.{json,md}.
//   --detail   (dev only) every instance that is not exact, with the record's
//              reason, what it waits for and the key's basis note.
//
// Snapshots come from the attribute eval's child (assemblies-attr-eval.mjs
// --single-json: the cached sheet graph, then the compile), so both
// instruments score the same compile.
//
// Scoring, one outcome per keyed instance (keys/<set>.typicals.csv):
//   exact          the record is decided (ok or overridden), its typical is
//                  the key's (or both say none: no_assembly or excluded) and
//                  every option the key decides has the key's value;
//   option_wrong   the right typical, a decided option differs;
//   wrong_typical  another typical, a typical where the key says none, or
//                  none where the key has one;
//   unresolved     the record waits for something (never counted correct);
//                  each attribute it says it waits for is checked against
//                  keys/<set>.attrs.csv: "honest" when the key says it is not
//                  printed, "dishonest" when the key has a printed value the
//                  pipeline did not read, "unverifiable" when the key does not
//                  cover it;
//   unmatched      no compile item for the keyed row.
// Options the key leaves open (a trailing "?", or "=?") are scored apart:
// the record may take the library default, or wait for a partner default.
// A record that is decided but rests on an attribute the attribute key says
// is NOT printed (an invented value) is a GATE 5 violation: "an assignment
// that depends on an unknown attribute without an unresolved disclosure".
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { canonTag, keyTables, matchItem, parseAttrKeyCsv, snapshotInChild } from "./assemblies-attr-eval.mjs";
import { canonicalAttributeFor } from "../../web/src/lib/assemblies/attributes.ts";
import { applyAssemblies, rowCite } from "../../web/src/lib/assemblies/apply.ts";
import { envFor, run } from "../../web/src/lib/assemblies/select.ts";
import { sanitizeAssemblyDefinitions } from "../../web/src/lib/assemblies/schema.ts";

export const TYPICAL_KEY_COLUMNS = ["sheet", "tag", "family", "typical_id", "options", "basis_note"];

/** GATE 5 (goals/ASSEMBLIES.md WP5): share of keyed instances exact. */
export const GATES = { dev: { exact: 0.98 }, heldout: { exact: 0.95 } };

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

/** "a=true;b=false?;c=?" → { a: { value: true, decided: true }, … }. */
export function parseOptions(text, where = "<key>") {
  const out = {};
  for (const part of String(text ?? "").split(";").map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^([a-z][a-z0-9_]*)=(true|false|\?)(\?)?$/);
    if (!m) throw new Error(`${where}: option "${part}" is not id=true|false[?] or id=?`);
    out[m[1]] = m[2] === "?" ? { value: null, decided: false } : { value: m[2] === "true", decided: !m[3] };
  }
  return out;
}

/** keys/<set>.typicals.csv → its rows, options parsed. */
export function parseTypicalKeyCsv(text, path = "<key>") {
  const data = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  if (!data.length) throw new Error(`${path}: no header line`);
  const head = splitCsvLine(data[0]).map((h) => h.trim());
  if (head.join(",") !== TYPICAL_KEY_COLUMNS.join(",")) throw new Error(`${path}: header reads "${head.join(",")}", expected "${TYPICAL_KEY_COLUMNS.join(",")}"`);
  return data.slice(1).map((line, i) => {
    const c = splitCsvLine(line);
    if (c.length !== TYPICAL_KEY_COLUMNS.length) throw new Error(`${path}: data line ${i + 1} has ${c.length} fields, not ${TYPICAL_KEY_COLUMNS.length}`);
    const r = Object.fromEntries(TYPICAL_KEY_COLUMNS.map((k, j) => [k, c[j]]));
    if (r.typical_id === "none" && r.options) throw new Error(`${path}: ${r.tag} is none but lists options`);
    return { ...r, options: parseOptions(r.options, `${path} ${r.tag}`) };
  });
}

/** The attributes an expression read, per the environment's sources. */
function attrsRead(src, env) {
  if (!src) return [];
  try { run(src, env); } catch { return []; }
  return [...env.sources.keys()].filter((k) => k.startsWith("attr.")).map((k) => k.slice(5));
}

/** The attributes a decided record rests on: its typical's selector and the
 * options its attributes decided. */
function recordDependsOn(app, inst, library) {
  const def = library.find((a) => a.id === app.assembly?.id && a.version === app.assembly?.version);
  if (!def) return [];
  const vars = Object.fromEntries(Object.entries(app.variables).map(([k, v]) => [k, { value: v.value, source: v.source }]));
  const out = new Set(attrsRead(def.applies_to.selector, envFor(inst, vars)));
  for (const o of def.options) {
    if (o.auto && app.options[o.id]?.source === "attr") for (const a of attrsRead(o.auto, envFor(inst, vars))) out.add(a);
  }
  return [...out];
}

/** The attribute key's lines for one instance, by canonical attribute. */
function keyedAttributes(attrKeyInst) {
  const m = new Map();
  for (const line of attrKeyInst?.lines ?? []) m.set(canonicalAttributeFor(attrKeyInst.family, line.attribute), line);
  return m;
}

/**
 * Score one set. `snapshot` is the attribute eval child's compile ({ items,
 * tables, pages }); `library` the assembly definitions; `settings` the
 * project settings the run applies (none by default).
 */
export function scoreTypicalSet({ setId, typKey, attrKey, snapshot, library, settings = {} }) {
  const project = { items: snapshot.items, tables: snapshot.tables, pages: snapshot.pages };
  const { instances, applications } = applyAssemblies({ project, library, settings });
  // A record is its row's: the cite of the row's own mark (its family may be
  // one the apply path derived, so it is not part of the key).
  const rowKey = (c, tag) => `${c?.sheet}|${c?.table_title}|${canonTag(tag)}|${JSON.stringify(c?.bbox ?? null)}|${c?.header}`;
  const recordOf = new Map();
  for (const app of applications) {
    if (app.layer === "controls") recordOf.set(rowKey(app.instance.cites[0], app.instance.tag), app);
  }
  const instOf = new Map(instances.map((i) => [i.item, i]));
  const itemIndex = new Map(snapshot.items.map((it, i) => [it, i]));
  const tables = keyTables(attrKey);
  const byTable = new Map();
  for (const it of snapshot.items) {
    const k = `${it.sheet_id}|${it.table_title}`;
    if (!byTable.has(k)) byTable.set(k, []);
    byTable.get(k).push(it);
  }
  // The keyed instance (sheet, tag, family) → its table in the attribute key.
  const attrInst = new Map();
  for (const t of tables.values()) {
    for (const inst of t.instances.values()) {
      const k = `${inst.sheet}|${canonTag(inst.tag)}|${inst.family}`;
      if (!attrInst.has(k)) attrInst.set(k, { table: t, inst });
    }
  }
  const used = new Map();
  const outcomes = [];
  for (const row of typKey) {
    const base = { set: setId, sheet: row.sheet, tag: row.tag, family: row.family, key_typical: row.typical_id, basis: row.basis_note };
    const ai = attrInst.get(`${row.sheet}|${canonTag(row.tag)}|${row.family}`);
    if (!ai) { outcomes.push({ ...base, outcome: "unmatched", why: "the attribute key has no such instance" }); continue; }
    const tableItems = [...ai.table.titles].flatMap((title) => byTable.get(`${ai.table.sheet}|${title}`) || []);
    const u = used.get(ai.table) ?? new Set();
    used.set(ai.table, u);
    const m = matchItem(ai.inst, tableItems, u);
    if (!m.item) { outcomes.push({ ...base, outcome: "unmatched", why: m.why }); continue; }
    const inst = instOf.get(itemIndex.get(m.item));
    const app = recordOf.get(rowKey(rowCite(m.item), m.item.tag));
    const got = { status: app?.status ?? "no_record", typical: app?.assembly?.id ?? null, reason: app?.reason ?? null, missing: app?.unresolved?.missing ?? [], candidates: app?.unresolved?.candidates ?? [] };
    const o = { ...base, item_family: inst?.family ?? m.item.family, derived: inst?.derived ?? {}, got };
    const keyNone = row.typical_id === "none";
    const decidedNone = got.status === "no_assembly" || got.status === "excluded";
    if (got.status === "unresolved" || got.status === "no_record") {
      const lines = keyedAttributes(ai.inst);
      o.outcome = "unresolved";
      o.waits = got.missing.map((ref) => {
        if (!ref.startsWith("attr.")) return { ref, honesty: "setting" };
        const attr = ref.slice(5);
        if (inst?.derived?.[attr] || attr === "terminals_served") return { ref, honesty: "derived" };
        const line = lines.get(attr);
        if (!line) return { ref, honesty: "unverifiable" };
        return line.value === "" ? { ref, honesty: "honest" } : { ref, honesty: "dishonest", key_value: line.value };
      });
      o.honest = o.waits.every((w) => w.honesty !== "dishonest");
      o.would_be = got.typical === row.typical_id || (keyNone && !got.typical && !got.candidates.length);
    } else if (keyNone || decidedNone) {
      o.outcome = keyNone && decidedNone ? "exact" : "wrong_typical";
    } else if (got.typical !== row.typical_id) {
      o.outcome = "wrong_typical";
    } else {
      const diffs = [];
      const open = [];
      let byDefault = 0;
      for (const [id, k] of Object.entries(row.options)) {
        const g = app.options[id];
        if (!k.decided) { open.push({ id, got: g?.value ?? null, source: g?.source ?? null }); continue; }
        if (!g || g.value !== k.value) diffs.push({ id, key: k.value, got: g?.value ?? null, source: g?.source ?? null });
        else if (g.source === "starter_default") byDefault += 1;
      }
      for (const id of Object.keys(app.options)) if (!(id in row.options)) diffs.push({ id, key: "(not keyed)", got: app.options[id].value, source: app.options[id].source });
      o.outcome = diffs.length ? "option_wrong" : "exact";
      o.option_diffs = diffs;
      o.open_options = open;
      o.decided_by_default = byDefault;
    }
    // A decided record must rest only on printed values (GATE 5).
    if (app && inst && (app.status === "ok" || app.status === "overridden") && app.assembly) {
      const lines = keyedAttributes(ai.inst);
      o.rests_on_unprinted = recordDependsOn(app, inst, library).filter((a) => !inst.derived?.[a] && lines.get(a)?.value === "");
    }
    outcomes.push(o);
  }
  return { outcomes };
}

const OUTCOMES = ["exact", "option_wrong", "wrong_typical", "unresolved", "unmatched"];

export function tally(outcomes) {
  const t = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
  for (const o of outcomes) t[o.outcome] += 1;
  const n = outcomes.length;
  return {
    instances: n, ...t,
    exact_pct: n ? t.exact / n : null,
    key_typical: outcomes.filter((o) => o.key_typical !== "none").length,
    key_none: outcomes.filter((o) => o.key_typical === "none").length,
    unresolved_dishonest: outcomes.filter((o) => o.outcome === "unresolved" && !o.honest).length,
    rests_on_unprinted: outcomes.filter((o) => o.rests_on_unprinted?.length).length,
    exact_with_default: outcomes.filter((o) => o.outcome === "exact" && o.decided_by_default > 0).length,
  };
}

export function gateVerdict(total, side) {
  const checks = [
    { name: "exact", ok: total.exact_pct !== null && total.exact_pct >= GATES[side].exact, need: `>= ${(GATES[side].exact * 100).toFixed(1)}%` },
    { name: "undisclosed", ok: total.rests_on_unprinted === 0, need: "= 0" },
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
  return [...m.entries()].map(([k, os]) => [k, tally(os)]).sort((a, b) => b[1].instances - a[1].instances || String(a[0]).localeCompare(String(b[0])));
};

export function summarize(outcomes) {
  return {
    total: tally(outcomes),
    by_key: group(outcomes, (o) => (o.key_typical === "none" ? "key: none" : "key: a typical")),
    by_family: group(outcomes, (o) => o.family),
    by_typical: group(outcomes, (o) => o.key_typical),
    by_set: group(outcomes, (o) => o.set),
  };
}

const pct = (x) => (x === null ? "   —  " : `${(x * 100).toFixed(1).padStart(5)}%`);
const HEAD = `${"".padEnd(34)}  inst  exact opt-wr typ-wr unres unmat | exact%  dishon undiscl`;
const row = (label, t) => `${String(label).slice(0, 34).padEnd(34)} ${String(t.instances).padStart(5)} ${String(t.exact).padStart(6)} ${String(t.option_wrong).padStart(6)} ${String(t.wrong_typical).padStart(6)} ${String(t.unresolved).padStart(5)} ${String(t.unmatched).padStart(5)} | ${pct(t.exact_pct)} ${String(t.unresolved_dishonest).padStart(6)} ${String(t.rests_on_unprinted).padStart(7)}`;

export function renderText(summary, { side, detail, outcomes, settingsLabel }) {
  const L = [];
  L.push(`TYPICAL EVAL (instrument 3) — ${side}, project settings: ${settingsLabel}`);
  L.push(`exact includes ${summary.total.exact_with_default} instance(s) where a drawing-decided option matched through the library default`);
  L.push("");
  L.push(HEAD);
  L.push(row("ALL", summary.total));
  for (const [k, t] of summary.by_key) L.push(row(`  ${k}`, t));
  if (side === "dev") {
    L.push("");
    L.push("per set");
    for (const [k, t] of summary.by_set) L.push(row(`  ${k}`, t));
    L.push("");
    L.push("per family");
    for (const [k, t] of summary.by_family) L.push(row(`  ${k}`, t));
    L.push("");
    L.push("per key typical");
    for (const [k, t] of summary.by_typical) L.push(row(`  ${k}`, t));
  }
  if (detail) {
    for (const kind of ["wrong_typical", "option_wrong", "unresolved", "unmatched"]) {
      const os = outcomes.filter((o) => o.outcome === kind);
      if (!os.length) continue;
      L.push("");
      L.push(`${kind} (${os.length}):`);
      for (const o of os) {
        const g = o.got ? `got ${o.got.status}${o.got.typical ? ` ${o.got.typical}` : ""}` : "";
        const extra = kind === "option_wrong" ? ` — ${o.option_diffs.map((d) => `${d.id}: key ${d.key}, got ${d.got} (${d.source})`).join("; ")}`
          : kind === "unresolved" ? ` — waits for ${o.waits.map((w) => `${w.ref} [${w.honesty}${w.key_value ? ` key "${w.key_value}"` : ""}]`).join(", ") || "(nothing named)"}${o.got.candidates.length ? `; candidates ${o.got.candidates.join(", ")}` : ""}`
          : kind === "unmatched" ? ` — ${o.why}` : o.got?.reason ? ` — ${o.got.reason}` : "";
        L.push(`  ${o.set} | ${o.tag} (${o.family}${o.item_family && o.item_family !== o.family ? `→${o.item_family}` : ""}): key ${o.key_typical}, ${g}${extra}`);
      }
    }
    const undiscl = outcomes.filter((o) => o.rests_on_unprinted?.length);
    if (undiscl.length) {
      L.push("");
      L.push(`decided records resting on a value the attribute key says is not printed (${undiscl.length}):`);
      for (const o of undiscl) L.push(`  ${o.set} | ${o.tag}: ${o.rests_on_unprinted.join(", ")}`);
    }
  }
  const verdict = gateVerdict(summary.total, side);
  L.push("");
  L.push(`GATE 5 (${side}): ${verdict.checks.map((c) => `${c.name} ${c.name === "exact" ? pct(summary.total.exact_pct).trim() : summary.total.rests_on_unprinted} (need ${c.need}) ${c.ok ? "ok" : "FAIL"}`).join(" · ")} → ${verdict.pass ? "PASS" : "FAIL"}`);
  return L.join("\n");
}

// ── CLI ─────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const positional = argv.filter((a) => !a.startsWith("--"));
  const [corpusDir, ...only] = positional;
  if (!corpusDir) {
    console.error("usage: node --import tsx scripts/assemblies-typical-eval.mjs <corpus-dir> [setId ...] [--heldout] [--report] [--detail]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
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
  const lib = resolve(fileURLToPath(new URL("../../web/src/lib/assemblies/", import.meta.url)));
  const libraryPath = join(lib, "starter", "us-typicals-v1.json");
  // Through the load gate, as every surface loads it.
  const { assemblies: library, rejected } = sanitizeAssemblyDefinitions(JSON.parse(readFileSync(libraryPath, "utf8")).assemblies);
  if (rejected.length) {
    console.error(`the library gate rejected ${rejected.length} assemblies: ${rejected.map((r) => `${r.id}: ${r.errors[0]}`).join("; ")}`);
    process.exit(2);
  }

  const outcomes = [];
  const errors = [];
  for (const id of setIds) {
    const typPath = join(corpus, "keys", `${id}.typicals.csv`);
    const attrPath = join(corpus, "keys", `${id}.attrs.csv`);
    if (!existsSync(typPath) || !existsSync(attrPath)) { errors.push({ id, error: `no key ${existsSync(typPath) ? attrPath : typPath}` }); continue; }
    const typKey = parseTypicalKeyCsv(readFileSync(typPath, "utf8"), typPath);
    const attrKey = parseAttrKeyCsv(readFileSync(attrPath, "utf8"), attrPath);
    const snap = await snapshotInChild(corpus, id);
    if (snap.error) { errors.push({ id, error: snap.error.split("\n")[0] }); continue; }
    outcomes.push(...scoreTypicalSet({ setId: id, typKey, attrKey, snapshot: snap, library }).outcomes);
  }
  const summary = summarize(outcomes);
  const text = renderText(summary, { side, detail, outcomes, settingsLabel: "none (the auto-proposal alone)" });
  console.log(text);
  if (errors.length) {
    console.log(`\nERRORS (${errors.length}) — these documents were not scored, so no gate can pass:`);
    for (const e of errors) console.log(`  ${e.id}: ${e.error}`);
  }
  if (flag("--report")) {
    const dir = join(corpus, "reports", "assemblies");
    mkdirSync(dir, { recursive: true });
    const digest = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);
    const verdict = gateVerdict(summary.total, side);
    const json = {
      generated_at: new Date().toISOString(),
      side,
      settings: {},
      library_sha256: digest(libraryPath),
      apply_ts_sha256: digest(join(lib, "apply.ts")),
      select_ts_sha256: digest(join(lib, "select.ts")),
      normalize_ts_sha256: digest(join(lib, "normalize.ts")),
      documents: setIds,
      errors,
      gate: { ...GATES[side], pass: verdict.pass && !errors.length },
      total: summary.total,
      by_key: Object.fromEntries(summary.by_key),
      ...(side === "dev" ? {
        by_set: Object.fromEntries(summary.by_set),
        by_family: Object.fromEntries(summary.by_family),
        by_typical: Object.fromEntries(summary.by_typical),
      } : {}),
    };
    const base = join(dir, `05-typical-eval-${side}`);
    writeFileSync(`${base}.json`, `${JSON.stringify(json, null, 2)}\n`);
    writeFileSync(`${base}.md`, `# Typical eval — ${side}\n\n\`\`\`\n${text}\n\`\`\`\n`);
    console.log(`\nwrote ${base}.json and .md`);
  }
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("assemblies-typical-eval.mjs")) await main();
