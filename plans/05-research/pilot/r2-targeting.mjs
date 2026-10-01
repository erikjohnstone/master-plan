// Research R2: for every control-drawing-class dev miss, does today's sheet graph put the unit's governing
// control evidence in reach? Read-only; cached graphs only (a cache miss aborts, nothing is built); dev only.
//   a:bound_on_schematic  an L4.8 control schematic binds the tag to its schedule row
//   b:printed_unbound     the tag is printed on a schematic but not bound to a row
//   c:named_in_sequence   a sequence narrative's text names the tag
//   d:family_title_only   only a schematic or sequence TITLE names the unit's family (a typical detail)
//   e:nothing             none of the above
//
//   cd opentakeoff/mcp && node --import tsx ../../plans/05-research/pilot/r2-targeting.mjs
// (run r2-misses.mjs first; then rerun it to fill the CSV's targeting column)
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { classOf } from "./r2-classes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const MCP = join(ROOT, "opentakeoff/mcp"), corpus = join(ROOT, "opentakeoff-corpus");
const { resolveSetFiles } = await import(join(MCP, "scripts/corpusFiles.mjs"));
const { cachedSheetGraph } = await import(join(MCP, "scripts/sheetGraphCache.mjs"));
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));
const split = JSON.parse(readFileSync(join(corpus, "reports/assemblies/01-split.json"), "utf8"));
const misses = JSON.parse(readFileSync(join(HERE, "out/misses.json"), "utf8"));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const norm = (s) => String(s ?? "").toUpperCase().replace(/[\s\-–—_.]+/g, "");
const FAMILY_WORDS = {
  UNIT_HEATER: /UNIT\s+HEATER/i, CABINET_UNIT_HEATER: /CABINET|UNIT\s+HEATER/i, FAN: /EXHAUST\s+FAN|\bFANS?\b/i,
  PUMP: /PUMP/i, FCU: /FAN\s+COIL|SPLIT|MINI[-\s]?SPLIT|AIR\s+CONDITIONER/i, AHU: /AIR\s+HANDLING|\bAHU\b/i,
  "AHU→DOAS": /OUTDOOR\s+AIR|OUTSIDE\s+AIR|DOAS|AIR\s+HANDLING/i, BOILER: /BOILER|HEATING\s+WATER/i,
  AIR_COOLED_CHILLER: /CHILLER|CHILLED\s+WATER/i, HUMIDIFIER: /HUMIDIF/i, "FCU→FURNACE": /FURNACE|SPLIT/i,
};
const out = [];
for (const id of split.dev.sets) {
  const rows = misses.filter((x) => x.set === id && classOf(x)?.startsWith("R"));
  if (!rows.length) continue;
  const set = (spec.sets ?? spec).find((s) => s.id === id);
  const files = resolveSetFiles(corpus, spec, set);
  const g = await cachedSheetGraph(files[0], {
    expectedSha256: sha(files[0]), identity: files.slice(1).map(sha), names: files.slice(1).map((p) => basename(p)),
    compute: async () => { throw new Error(`cache miss for ${id}: not building`); },
  });
  const schematics = g?.control_schematics?.schematics ?? [];
  const narratives = g?.sequence_narratives ?? [];
  for (const x of rows) {
    const t = norm(x.tag);
    const onSchem = schematics.flatMap((s) => (s.equipment ?? []).filter((e) => norm(e.tag) === t).map((e) => ({ s, e })));
    const bound = onSchem.filter(({ e }) => e.schedule_binding_status === "bound");
    const narr = narratives.filter((b) => norm([b.title, ...(b.sections ?? []).map((sec) => `${sec.heading} ${sec.body}`)].join(" ")).includes(t));
    const fam = FAMILY_WORDS[x.family];
    const famTitles = fam ? [...schematics.map((s) => s.title), ...narratives.map((b) => b.title)].filter((title) => fam.test(String(title))) : [];
    const state = bound.length ? "a:bound_on_schematic" : onSchem.length ? "b:printed_unbound" : narr.length ? "c:named_in_sequence" : famTitles.length ? "d:family_title_only" : "e:nothing";
    out.push({ set: id, tag: x.tag, family: x.family, class: classOf(x), cat: x.cat, state,
      schematic: bound[0]?.s.title ?? onSchem[0]?.s.title ?? null, sequence: narr[0]?.title ?? null, family_titles: famTitles.slice(0, 3) });
  }
  console.error(`${id}: ${schematics.length} schematics, ${narratives.length} sequence blocks, ${rows.length} R rows`);
}
writeFileSync(join(HERE, "out/targeting.json"), JSON.stringify(out, null, 1));
const tally = {}, byClass = {};
for (const r of out) { tally[r.state] = (tally[r.state] ?? 0) + 1; byClass[`${r.class} ${r.state}`] = (byClass[`${r.class} ${r.state}`] ?? 0) + 1; }
console.log(out.length, "control-drawing rows", tally);
console.log(byClass);
