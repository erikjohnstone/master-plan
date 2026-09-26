// CONTROL INTENT goal, instrument 3: the BINDING EVAL (goals/CONTROL_INTENT.md
// MEASURE 3; GATE B1 is read from it).
//
// SHOULD THIS BE ON THE SHARED PATH? What it measures is shared: the control-
// evidence map applyAssemblies returns (web/src/lib/controlIntent/evidence.ts
// finds the packets in compiledProjectOf, binding.ts binds them). The scoring
// below is eval-only; no surface imports it.
//
//   node --import tsx scripts/control-intent-binding-eval.mjs <corpus-dir> [setId ...]
//        [--heldout] [--report] [--detail]
//
//   --heldout  the frozen held-out documents: aggregates only (gates; never
//              tuned on).
//   --report   write reports/control-intent/03-binding-eval-<dev|heldout>.{json,md}.
//   --detail   (dev only) every missed and every false binding.
//
// Truth is keys/<set>.binding.csv: one row per (keyed instance, governing
// packet), or one row with packet "none". Instances are matched to compile
// items exactly as the typical eval matches them (the attribute key's table,
// then the tag).
//
// A key names its packet by sheet and printed title. The packets the
// pipeline found on that sheet that the key names are, in this order:
//   · those whose title is the key's (letters and digits compared, spacing
//     and punctuation ignored), or starts with it or it with theirs when the
//     shorter is 20 characters or more (a key may abbreviate a long title);
//   · else the sheet's own packet (its title-block title) when that title
//     contains the key's (a key may name the sheet a detail fills);
//   · else the one packet whose text contains the key's title (a key may
//     name a packet by a label printed in it), with any packet printed under
//     the same title on that sheet.
// A key packet none of these finds is "not found": all its pairs are missed.
// A binding HITS a keyed packet when its packet is one of those, or lies
// inside one on the same sheet, or contains one (a sheet's packet); inside
// and containing hits are counted apart.
//   pair recall   keyed (instance, packet) pairs with a hit / all keyed pairs
//   precision     bindings of keyed instances that hit one of the instance's
//                 keyed packets / all their bindings (an instance keyed "none"
//                 has only false bindings)
//   unit recall   keyed instances with a governing packet that get at least
//                 one hit / those instances
// Proposals (a family detail whose title qualifier the row does not print)
// and ambiguous bindings are reported apart; GATE B1 reads the confirmed
// bindings. Pairs the key marks "semantic" (only meaning connects them) are
// reported apart too, and counted in the gate's recall.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonTag, keyTables, matchItem, parseAttrKeyCsv, snapshotInChild } from "./assemblies-attr-eval.mjs";
import { applyAssemblies } from "../../web/src/lib/assemblies/apply.ts";
import { sanitizeAssemblyDefinitions } from "../../web/src/lib/assemblies/schema.ts";

export const BINDING_KEY_COLUMNS = ["sheet", "tag", "family", "packet_sheet", "packet_title", "binding", "note"];
/** GATE B1 (goals/CONTROL_INTENT.md WP2). */
export const GATES = { dev: { recall: 0.95, precision: 0.98, unit_recall: 0.95 }, heldout: { recall: 0.85, precision: 0.95 } };

function splitCsvLine(line) {
  const out = [];
  let f = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(f); f = ""; }
    else f += c;
  }
  out.push(f);
  return out;
}

export function parseBindingKeyCsv(text, path = "<key>") {
  const data = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  if (!data.length) throw new Error(`${path}: no header line`);
  const head = splitCsvLine(data[0]).map((h) => h.trim());
  if (head.join(",") !== BINDING_KEY_COLUMNS.join(",")) throw new Error(`${path}: header reads "${head.join(",")}", expected "${BINDING_KEY_COLUMNS.join(",")}"`);
  return data.slice(1).map((line, i) => {
    const c = splitCsvLine(line);
    if (c.length !== BINDING_KEY_COLUMNS.length) throw new Error(`${path}: data line ${i + 1} has ${c.length} fields, not ${BINDING_KEY_COLUMNS.length}`);
    return Object.fromEntries(BINDING_KEY_COLUMNS.map((k, j) => [k, c[j]]));
  });
}

const compact = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** A sheet id in one spelling: page 1 may be written with or without "#1". */
const sheetId = (s) => String(s ?? "").replace(/#1$/, "");
const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const inside = (pt, b) => pt[0] >= b[0] - 1 && pt[0] <= b[2] + 1 && pt[1] >= b[1] - 1 && pt[1] <= b[3] + 1;

/** The found packets a key row names (see the header), and how. */
export function keyPackets(row, packets) {
  const onSheet = packets.filter((p) => sheetId(p.sheet) === sheetId(row.packet_sheet));
  const k = compact(row.packet_title);
  if (!k) return { how: "none", packets: [] };
  const byTitle = onSheet.filter((p) => {
    const t = compact(p.title);
    if (p.scope === "sheet") return t === k;
    if (t === k) return true;
    const [short, long] = t.length <= k.length ? [t, k] : [k, t];
    return short.length >= 20 && long.startsWith(short);
  });
  if (byTitle.length) return { how: "title", packets: byTitle };
  const bySheet = onSheet.filter((p) => p.scope === "sheet" && compact(p.title).includes(k));
  if (bySheet.length) return { how: "sheet_title", packets: bySheet };
  const byLabel = onSheet.filter((p) => p.scope !== "sheet" && compact(p.spans.map((s) => s.str).join(" ")).includes(k));
  // One packet prints the label; a packet printed with the same title on the
  // sheet (a detail's caption and its points-table heading) is the same one.
  if (byLabel.length === 1) return { how: "label", packets: onSheet.filter((p) => p === byLabel[0] || (p.scope !== "sheet" && compact(p.title) === compact(byLabel[0].title))) };
  return { how: "not_found", packets: [] };
}

/** How a binding's packet hits a keyed packet: "same", "inside" (it lies in
 * the keyed packet), "contains" (the keyed packet lies in it), or null. */
export function hitOf(bound, keyed) {
  for (const k of keyed) {
    if (bound.id === k.id) return "same";
  }
  for (const k of keyed) {
    if (sheetId(bound.sheet) !== sheetId(k.sheet)) continue;
    if (inside(center(bound.region), k.region)) return "inside";
    if (inside(center(k.region), bound.region)) return "contains";
  }
  return null;
}

/** Score one set's bindings against its key. */
export function scoreBindingSet({ setId, bindKey, attrKey, snapshot, library }) {
  const project = { items: snapshot.items, tables: snapshot.tables, pages: snapshot.pages, printed_points: snapshot.printed_points ?? [], ...(snapshot.control ? { control: snapshot.control } : {}) };
  const { control } = applyAssemblies({ project, library });
  const packets = control.packets;
  const byId = new Map(packets.map((p) => [p.id, p]));
  const itemIndex = new Map(snapshot.items.map((it, i) => [it, i]));
  const tables = keyTables(attrKey);
  const byTable = new Map();
  for (const it of snapshot.items) {
    const k = `${it.sheet_id}|${it.table_title}`;
    if (!byTable.has(k)) byTable.set(k, []);
    byTable.get(k).push(it);
  }
  const attrInst = new Map();
  for (const t of tables.values()) for (const inst of t.instances.values()) {
    const k = `${inst.sheet}|${canonTag(inst.tag)}|${inst.family}`;
    if (!attrInst.has(k)) attrInst.set(k, { table: t, inst });
  }
  // Key rows grouped per instance.
  const instances = new Map();
  for (const row of bindKey) {
    const k = `${row.sheet}|${canonTag(row.tag)}|${row.family}`;
    if (!instances.has(k)) instances.set(k, { sheet: row.sheet, tag: row.tag, family: row.family, rows: [] });
    instances.get(k).rows.push(row);
  }
  const used = new Map();
  const pairs = [];
  const bindings = [];
  const units = [];
  const notFound = new Map();
  for (const [k, inst] of instances) {
    const ai = attrInst.get(k);
    let item = null, why = null;
    if (!ai) why = "the attribute key has no such instance";
    else {
      const tableItems = [...ai.table.titles].flatMap((title) => byTable.get(`${ai.table.sheet}|${title}`) || []);
      const u = used.get(ai.table) ?? new Set();
      used.set(ai.table, u);
      const m = matchItem(ai.inst, tableItems, u);
      item = m.item; why = m.why;
    }
    const idx = item ? itemIndex.get(item) : null;
    const found = idx != null ? (control.bindings[idx] ?? []) : [];
    const keyed = inst.rows.filter((r) => r.packet_title && r.packet_title !== "none").map((r) => {
      const kp = keyPackets(r, packets);
      if (kp.how === "not_found") notFound.set(`${r.packet_sheet}|${r.packet_title}`, (notFound.get(`${r.packet_sheet}|${r.packet_title}`) ?? 0) + 1);
      return { row: r, ...kp };
    });
    const unit = { set: setId, tag: inst.tag, family: inst.family, matched: Boolean(item), why: item ? null : why, keyed: keyed.length, hit: 0 };
    for (const kp of keyed) {
      const hits = found.map((b) => ({ b, hit: hitOf(byId.get(b.packet), kp.packets) })).filter((x) => x.hit);
      const confirmedHits = hits.filter((x) => !x.b.proposal);
      pairs.push({ set: setId, tag: inst.tag, family: inst.family, kind: kp.row.binding || "(blank)", packet_sheet: kp.row.packet_sheet, packet_title: kp.row.packet_title, key_how: kp.how,
        hit: confirmedHits.length > 0, hit_any: hits.length > 0, hit_how: (confirmedHits[0] ?? hits[0])?.hit ?? null, via: (confirmedHits[0] ?? hits[0])?.b.kind ?? null, matched: Boolean(item), note: kp.row.note });
      if (confirmedHits.length) unit.hit++;
    }
    units.push(unit);
    for (const b of found) {
      const p = byId.get(b.packet);
      const hit = keyed.map((kp) => hitOf(p, kp.packets)).find(Boolean) ?? null;
      bindings.push({ set: setId, tag: inst.tag, family: inst.family, packet_sheet: p.sheet, packet_title: p.title, packet_scope: p.scope, kind: b.kind, evidence: b.evidence,
        proposal: Boolean(b.proposal), ambiguous: Boolean(b.ambiguous), correct: Boolean(hit), hit_how: hit, key_none: keyed.length === 0 });
    }
  }
  return { setId, packets: packets.length, pairs, bindings, units, not_found: [...notFound].map(([k, n]) => ({ packet: k, pairs: n })) };
}

export function summarize(results) {
  const pairs = results.flatMap((r) => r.pairs);
  const bindings = results.flatMap((r) => r.bindings);
  const units = results.flatMap((r) => r.units);
  const confirmed = bindings.filter((b) => !b.proposal);
  const byKind = {};
  for (const p of pairs) {
    const k = byKind[p.kind] ??= { pairs: 0, hit: 0 };
    k.pairs++;
    if (p.hit) k.hit++;
  }
  const bindKinds = {};
  for (const b of bindings) {
    const k = bindKinds[b.kind] ??= { bindings: 0, correct: 0, proposal: 0 };
    k.bindings++;
    if (b.correct) k.correct++;
    if (b.proposal) k.proposal++;
  }
  const nonSemantic = pairs.filter((p) => p.kind !== "semantic");
  const withPackets = units.filter((u) => u.keyed > 0);
  const ratio = (a, b) => (b ? a / b : null);
  return {
    packets: results.reduce((s, r) => s + r.packets, 0),
    pairs: pairs.length,
    pair_hits: pairs.filter((p) => p.hit).length,
    recall: ratio(pairs.filter((p) => p.hit).length, pairs.length),
    recall_without_semantic: ratio(nonSemantic.filter((p) => p.hit).length, nonSemantic.length),
    recall_with_proposals: ratio(pairs.filter((p) => p.hit_any).length, pairs.length),
    bindings: bindings.length,
    confirmed_bindings: confirmed.length,
    precision: ratio(confirmed.filter((b) => b.correct).length, confirmed.length),
    precision_with_proposals: ratio(bindings.filter((b) => b.correct).length, bindings.length),
    proposals: bindings.filter((b) => b.proposal).length,
    ambiguous: bindings.filter((b) => b.ambiguous).length,
    hits_inside: pairs.filter((p) => p.hit && p.hit_how === "inside").length,
    hits_containing: pairs.filter((p) => p.hit && p.hit_how === "contains").length,
    key_packets_not_found: results.flatMap((r) => r.not_found).length,
    units_with_packets: withPackets.length,
    unit_recall: ratio(withPackets.filter((u) => u.hit > 0).length, withPackets.length),
    unmatched_instances: units.filter((u) => !u.matched).length,
    none_units_bound: [...new Set(bindings.filter((b) => b.key_none).map((b) => `${b.set}|${b.tag}`))].length,
    by_key_kind: byKind,
    by_binding_kind: bindKinds,
  };
}

const pct = (x) => (x == null ? "n/a" : `${(100 * x).toFixed(1)}%`);

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const [corpusDir, ...only] = argv.filter((a) => !a.startsWith("--"));
  if (!corpusDir) {
    console.error("usage: node --import tsx scripts/control-intent-binding-eval.mjs <corpus-dir> [setId ...] [--heldout] [--report] [--detail]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
  const side = flag("--heldout") ? "heldout" : "dev";
  if (flag("--detail") && side === "heldout") {
    console.error("--detail is dev-only: held-out documents are scored at gates, never tuned on");
    process.exit(2);
  }
  const split = JSON.parse(readFileSync(join(corpus, "reports", "assemblies", "01-split.json"), "utf8"));
  const sideSets = split[side].sets;
  const unknown = only.filter((id) => !sideSets.includes(id));
  if (unknown.length) { console.error(`not ${side} documents: ${unknown.join(", ")}`); process.exit(2); }
  const setIds = only.length ? only : sideSets;
  const here = fileURLToPath(new URL(".", import.meta.url));
  const starter = join(here, "../../web/src/lib/assemblies/starter");
  const raw = [
    ...JSON.parse(readFileSync(join(starter, "us-typicals-v1.json"), "utf8")).assemblies,
    ...JSON.parse(readFileSync(join(starter, "us-hookups-v1.json"), "utf8")).assemblies,
  ];
  const { assemblies: library } = sanitizeAssemblyDefinitions(raw);
  const results = [];
  const errors = [];
  for (const id of setIds) {
    const bindPath = join(corpus, "keys", `${id}.binding.csv`);
    const attrPath = join(corpus, "keys", `${id}.attrs.csv`);
    if (!existsSync(bindPath) || !existsSync(attrPath)) { errors.push({ id, error: "no binding or attribute key" }); continue; }
    const snap = await snapshotInChild(corpus, id);
    if (snap.error) { errors.push({ id, error: snap.error }); continue; }
    const r = scoreBindingSet({ setId: id, bindKey: parseBindingKeyCsv(readFileSync(bindPath, "utf8"), bindPath), attrKey: parseAttrKeyCsv(readFileSync(attrPath, "utf8"), attrPath), snapshot: snap, library });
    results.push(r);
  }
  const total = summarize(results);
  const lines = [];
  lines.push(`# Control intent: binding eval (${side})`, "");
  lines.push(`packets found: ${total.packets}; keyed pairs: ${total.pairs}; key packets not found: ${total.key_packets_not_found}; unmatched instances: ${total.unmatched_instances}`);
  lines.push(`pair recall ${pct(total.recall)} (${total.pair_hits}/${total.pairs}; without semantic ${pct(total.recall_without_semantic)}; with proposals ${pct(total.recall_with_proposals)}; hits inside ${total.hits_inside}, containing ${total.hits_containing})`);
  lines.push(`precision ${pct(total.precision)} over ${total.confirmed_bindings} confirmed bindings (with proposals ${pct(total.precision_with_proposals)} over ${total.bindings}); proposals ${total.proposals}; ambiguous ${total.ambiguous}; units keyed "none" but bound ${total.none_units_bound}`);
  lines.push(`unit recall ${pct(total.unit_recall)} (${total.units_with_packets} instances with a governing packet)`);
  lines.push("", "| key kind | pairs | hit | recall |", "|---|---:|---:|---:|");
  for (const [k, v] of Object.entries(total.by_key_kind)) lines.push(`| ${k} | ${v.pairs} | ${v.hit} | ${pct(v.hit / v.pairs)} |`);
  lines.push("", "| binding kind | bindings | correct | proposals |", "|---|---:|---:|---:|");
  for (const [k, v] of Object.entries(total.by_binding_kind)) lines.push(`| ${k} | ${v.bindings} | ${v.correct} | ${v.proposal} |`);
  if (side === "dev") {
    lines.push("", "| set | packets | pairs | recall | bindings | precision |", "|---|---:|---:|---:|---:|---:|");
    for (const r of results) {
      const s = summarize([r]);
      lines.push(`| ${r.setId} | ${r.packets} | ${s.pairs} | ${pct(s.recall)} | ${s.confirmed_bindings} | ${pct(s.precision)} |`);
    }
  }
  const gate = GATES[side];
  lines.push("", `GATE B1 (${side}): recall ${pct(total.recall)} ≥ ${pct(gate.recall)} ${total.recall >= gate.recall ? "✓" : "✗"}; precision ${pct(total.precision)} ≥ ${pct(gate.precision)} ${total.precision >= gate.precision ? "✓" : "✗"}${gate.unit_recall ? `; unit recall ${pct(total.unit_recall)} ≥ ${pct(gate.unit_recall)} ${total.unit_recall >= gate.unit_recall ? "✓" : "✗"}` : ""}`);
  if (errors.length) lines.push("", ...errors.map((e) => `ERROR ${e.id}: ${e.error}`));
  if (flag("--detail")) {
    lines.push("", "## Missed pairs");
    for (const r of results) for (const p of r.pairs.filter((x) => !x.hit)) lines.push(`- ${r.setId} ${p.tag} (${p.family}) → ${p.packet_sheet.replace(/^.*\.pdf/, "")} "${p.packet_title}" [${p.kind}; key ${p.key_how}${p.hit_any ? "; proposal only" : ""}${p.matched ? "" : "; INSTANCE UNMATCHED"}]`);
    lines.push("", "## False bindings");
    for (const r of results) for (const b of r.bindings.filter((x) => !x.correct)) lines.push(`- ${r.setId} ${b.tag} (${b.family}) → ${b.packet_sheet.replace(/^.*\.pdf/, "")} "${b.packet_title}" [${b.kind}${b.proposal ? ", proposal" : ""}${b.ambiguous ? ", ambiguous" : ""}${b.key_none ? ", key none" : ""}] ${b.evidence}`);
    lines.push("", "## Key packets not found");
    for (const r of results) for (const n of r.not_found) lines.push(`- ${r.setId} ${n.packet.replace(/^[^|]*\.pdf/, "")} (${n.pairs} pairs)`);
  }
  console.log(lines.join("\n"));
  if (flag("--report")) {
    const dir = join(corpus, "reports", "control-intent");
    mkdirSync(dir, { recursive: true });
    const base = join(dir, `03-binding-eval-${side}`);
    const json = side === "dev" ? { side, total, results } : { side, total };
    writeFileSync(`${base}.json`, JSON.stringify(json, null, 1));
    writeFileSync(`${base}.md`, lines.filter((l) => side === "dev" || !l.startsWith("- ")).join("\n") + "\n");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
