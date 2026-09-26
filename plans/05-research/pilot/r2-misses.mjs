// Research R2 (plans/05-research/01-dev-miss-evidence.md): every dev miss of the assemblies typical eval
// (opentakeoff-corpus/reports/assemblies/05-typical-eval-dev.md), joined with its key's basis note and
// classified by the evidence that decides it (r2-classes.mjs, a hand classification from the notes).
// Dev keys only. Writes out/misses.json and ../dev-misses-by-evidence.csv; prints the counts.
//
//   node plans/05-research/pilot/r2-misses.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classOf } from "./r2-classes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const C = resolve(HERE, "../../../opentakeoff-corpus");
const split = JSON.parse(readFileSync(`${C}/reports/assemblies/01-split.json`, "utf8"));
const md = readFileSync(`${C}/reports/assemblies/05-typical-eval-dev.md`, "utf8");
const parseCsv = (text) => {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
};
const misses = []; let cat = null;
for (const line of md.split("\n")) {
  const h = /^(wrong_typical|option_wrong|unresolved) \((\d+)\):/.exec(line); if (h) { cat = h[1]; continue; }
  if (!cat) continue;
  const m = /^  (\S+) \| (.+?) \(([A-Z_→]+)\): (.*)$/.exec(line);
  if (!m) { if (line.startsWith("GATE")) cat = null; continue; }
  misses.push({ cat, set: m[1], tag: m[2], family: m[3], detail: m[4] });
}
const notes = new Map();
for (const set of new Set(misses.map((x) => x.set))) {
  if (!split.dev.sets.includes(set)) throw new Error(`${set} is not a dev document`);
  const rows = parseCsv(readFileSync(`${C}/keys/${set}.typicals.csv`, "utf8").split("\n").filter((l) => !l.startsWith("#")).join("\n"));
  const [hdr, ...body] = rows; const ix = Object.fromEntries(hdr.map((h, i) => [h, i]));
  for (const r of body) if (r.length > 3) notes.set(`${set}|${r[ix.tag]}`, { typical: r[ix.typical_id], options: r[ix.options], note: r[ix.basis_note] });
}
for (const x of misses) Object.assign(x, notes.get(`${x.set}|${x.tag}`) ?? { note: null });
writeFileSync(resolve(HERE, "out/misses.json"), JSON.stringify(misses, null, 1));

const by = {}, byCat = {};
for (const x of misses) {
  const c = classOf(x);
  if (!c) throw new Error(`unclassified: ${x.set} ${x.tag}`);
  by[c] = (by[c] ?? 0) + 1;
  byCat[`${c} / ${x.cat}`] = (byCat[`${c} / ${x.cat}`] ?? 0) + 1;
}
console.log(`${misses.length} dev misses, ${misses.filter((x) => !x.note).length} without a key row`);
console.log(by);
console.log(byCat);

let probe = new Map();
try { probe = new Map(JSON.parse(readFileSync(resolve(HERE, "out/targeting.json"), "utf8")).map((r) => [`${r.set}|${r.tag}`, r.state])); } catch { /* run r2-targeting.mjs first for that column */ }
const esc = (v) => /[",\r\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? "");
const rows = [["set", "tag", "family", "miss", "deciding_evidence", "targeting_today", "basis_note"]];
for (const x of misses) rows.push([x.set, x.tag, x.family, x.cat, classOf(x), probe.get(`${x.set}|${x.tag}`) ?? "", x.note]);
writeFileSync(resolve(HERE, "../dev-misses-by-evidence.csv"), rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n");
