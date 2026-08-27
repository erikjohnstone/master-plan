// CLI for the project-level takeoff pipeline (src/takeoff.ts) — walks an
// entire loaded plan set and emits a structured, typed takeoff + failure
// report. No LLM, no per-file/per-tag hardcoding: every real decision comes
// from the existing deterministic engine (sheetgraph.ts, symbolsweep.ts,
// session.ts's sweepScheduleRow).
//
//   node --import tsx scripts/takeoff-pipeline.mjs <set.pdf> [more.pdf ...]
//     [--categories=valve,actuator,damper]   # default: those 3 (this
//                                             # initiative's own stated
//                                             # starting scope); pass "all"
//                                             # for every hvacTaxonomy family
//     [--out=path.json]                      # default: stdout summary only
import { Session } from "../src/session.ts";
import { buildPlanSetTakeoff } from "../src/takeoff.ts";
import fs from "node:fs";

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const flag = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
if (!files.length) {
  console.error("usage: node --import tsx scripts/takeoff-pipeline.mjs <set.pdf> [more.pdf ...] [--categories=valve,actuator,damper|all] [--out=path.json]");
  process.exit(2);
}
const catArg = flag("categories", "valve,actuator,damper");
const categories = catArg === "all" ? null : catArg.split(",").map((s) => s.trim());
const outPath = flag("out", null);

const s = new Session();
for (let i = 0; i < files.length; i++) await s.loadPlan(files[i], { merge: i > 0 });

const result = await buildPlanSetTakeoff(s, { categories });
result.set_files = files;

console.log(`\n═ project-level takeoff — ${files.map((f) => f.split("/").pop()).join(", ")} ═`);
console.log(`scope: ${categories ? categories.join(", ") : "all equipment-kind schedules"}`);
console.log(`tables seen: ${result.tables_seen.length} (${result.tables_seen.filter((t) => t.kind === "equipment").length} equipment-kind)`);
console.log(`schedule rows in scope: ${result.stats.schedule_rows_total}`);
console.log(`resolved: ${result.stats.resolved}  refused: ${result.stats.refused}  errored: ${result.stats.errored}`);
console.log(`total real drawn instances found: ${result.stats.total_drawn_instances}\n`);

for (const it of result.items) {
  const loc = it.status === "resolved" ? `qty=${it.quantity}${it.corroborated ? "" : " (uncorroborated)"}` : `${it.status}: ${it.reason?.slice(0, 90)}`;
  console.log(`  ${it.tag.padEnd(10)} ${(it.equipment_type || "(unclassified)").padEnd(28)} ${loc}`);
}

if (result.failures.length) {
  console.log(`\n═ failures (${result.failures.length}) ═`);
  const byType = new Map();
  for (const f of result.failures) byType.set(f.type, (byType.get(f.type) || 0) + 1);
  for (const [type, n] of byType) console.log(`  ${type}: ${n}`);
}

if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nwrote ${outPath}`);
}
