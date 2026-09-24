// ASSEMBLIES goal — a census of the control schematics the sheet graph binds
// to scheduled units (AS-19's next lever: D6 evidence from the control
// drawings). Read-only: the graph's L4.8 control schematics
// (controlSchematic.ts) through the same cached graph the evals read.
//
//   node --import tsx scripts/assemblies-schematic-census.mjs <corpus-dir> [setId ...]
//
// Per dev document (the frozen split's dev side, never held-out): each
// schematic's title and sheet, its equipment tags and how each binds to a
// schedule row (bound, ambiguous, unbound), and its explicit printed I/O
// tokens by type. The totals say how many scheduled units a schematic binds
// to exactly one row, and how many of those carry I/O tokens. A schematic
// whose bound equipment is ONE unit gives that unit's own printed I/O: those
// units are the ones an I/O-count match could decide options for (a
// schematic that binds several units prints their I/O together).
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createHash } from "node:crypto";

const [corpusDir, ...only] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!corpusDir) {
  console.error("usage: node --import tsx scripts/assemblies-schematic-census.mjs <corpus-dir> [setId ...]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const split = JSON.parse(readFileSync(join(corpus, "reports", "assemblies", "01-split.json"), "utf8"));
const heldout = new Set(split.heldout.sets);
const bad = only.filter((id) => heldout.has(id));
if (bad.length) {
  console.error(`held-out documents are not censused: ${bad.join(", ")}`);
  process.exit(2);
}
const setIds = only.length ? only : split.dev.sets;
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));
const { resolveSetFiles } = await import("./corpusFiles.mjs");
const { cachedSheetGraph } = await import("./sheetGraphCache.mjs");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

const totals = { documents: 0, schematics: 0, with_points: 0, units_bound: 0, units_bound_with_points: 0, single_unit_schematics_with_points: 0, units_with_own_io: 0 };
for (const id of setIds) {
  const set = (spec.sets ?? spec).find((s) => s.id === id);
  const files = resolveSetFiles(corpus, spec, set);
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
  const schematics = graph?.control_schematics?.schematics ?? [];
  totals.documents += 1;
  totals.schematics += schematics.length;
  console.log(`\n${id} (graph ${built ? "built" : "cache"}): ${schematics.length} control schematic(s)`);
  const boundUnits = new Map();
  const ownIo = new Map();
  for (const s of schematics) {
    const pts = s.point_totals ?? { AI: 0, AO: 0, DI: 0, DO: 0, total: 0 };
    if (pts.total) totals.with_points += 1;
    const eq = (s.equipment ?? []).map((e) => `${e.tag}${e.schedule_binding_status === "bound" ? "" : `(${e.schedule_binding_status})`}`);
    const bound = (s.equipment ?? []).filter((e) => e.schedule_binding_status === "bound" && e.schedule_refs.length === 1);
    for (const e of bound) {
      const k = `${e.schedule_refs[0].sheet}|${e.schedule_refs[0].row_key}`;
      const u = boundUnits.get(k) ?? { tag: e.tag, schematics: 0, points: 0 };
      u.schematics += 1;
      u.points += pts.total;
      boundUnits.set(k, u);
    }
    const unitsHere = new Set(bound.map((e) => `${e.schedule_refs[0].sheet}|${e.schedule_refs[0].row_key}`));
    if (unitsHere.size === 1 && pts.total) {
      totals.single_unit_schematics_with_points += 1;
      const k = [...unitsHere][0];
      const o = ownIo.get(k) ?? { tag: bound[0].tag, schematics: [] };
      o.schematics.push({ sheet: s.sheet, title: String(s.title).slice(0, 60), AI: pts.AI, AO: pts.AO, BI: pts.DI, BO: pts.DO, status: s.semantic_status });
      ownIo.set(k, o);
    }
    console.log(`  ${s.sheet} · ${String(s.title).slice(0, 70)} — I/O AI ${pts.AI} AO ${pts.AO} DI ${pts.DI} DO ${pts.DO}; instruments ${s.instruments?.length ?? 0}; equipment ${eq.join(", ") || "none"}`);
  }
  const units = [...boundUnits.values()];
  totals.units_bound += units.length;
  totals.units_bound_with_points += units.filter((u) => u.points > 0).length;
  if (units.length) console.log(`  units bound to one schedule row: ${units.map((u) => `${u.tag}${u.points ? ` (${u.points} I/O)` : ""}${u.schematics > 1 ? ` ×${u.schematics} schematics` : ""}`).join(", ")}`);
  totals.units_with_own_io += ownIo.size;
  for (const o of ownIo.values()) {
    console.log(`  own I/O: ${o.tag} — ${o.schematics.map((x) => `${x.sheet} "${x.title}" AI ${x.AI} AO ${x.AO} BI ${x.BI} BO ${x.BO} (${x.status})`).join("; ")}`);
  }
}
console.log(`\nTOTAL: ${totals.documents} dev documents, ${totals.schematics} control schematics (${totals.with_points} with printed I/O tokens); ${totals.units_bound} scheduled units bound to one schedule row, ${totals.units_bound_with_points} of them on a schematic with I/O tokens; ${totals.single_unit_schematics_with_points} schematics bind one unit and print I/O, giving ${totals.units_with_own_io} units their own printed I/O`);
process.exit(0);
