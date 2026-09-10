// Real production CLI A/B. No evaluator/engine overrides beyond cache control;
// no mutation of either checkout or original corpus. Only development inputs.
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { compareRoutingGraphs as compare, routingComparisonFailed } from "./basRoutingComparison.mjs";

const [baselineRoot, candidateRoot, inventoryPath, outputDir, ...ids] = process.argv.slice(2);
if (!ids.length) throw new Error("usage: compare-bas-routing.mjs BASELINE_OPENTAKEOFF CANDIDATE_OPENTAKEOFF INVENTORY OUTPUT_DIR DEVELOPMENT_ID...");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const cases = ids.map(id => {
  const item = inventory.selected.find(x => x.id === id);
  if (!item || item.split !== "development") throw new Error(`Not a development document: ${id}`);
  const pdf = join(inventory.source_roots.collection, item.relative_path);
  if (createHash("sha256").update(readFileSync(pdf)).digest("hex") !== item.sha256) throw new Error(`Source changed: ${id}`);
  return { id, pdf, sha256: item.sha256 };
});
const out = resolve(outputDir);
mkdirSync(out, { recursive: true });
async function graph(root, item, label, cold) {
  const graphFile = join(out, `${item.id}-${label}.json`);
  const logFile = join(out, `${item.id}-${label}.log`);
  const fd = openSync(logFile, "w");
  const start = performance.now();
  const outcome = await new Promise((accept, reject) => {
    const child = spawn("/usr/bin/time", ["-l", process.execPath, "--import", "tsx",
      "scripts/production-graph-cli.mjs", "--mode", "graph", "--pdf", item.pdf, "--out", graphFile], {
      cwd: join(resolve(root), "mcp"), stdio: ["ignore", fd, fd],
      env: { ...process.env, OPENTAKEOFF_GRAPH_NO_CACHE: cold ? "1" : "0" },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => accept({ code, signal }));
  }).finally(() => closeSync(fd));
  if (outcome.code !== 0) {
    const failure = { id: item.id, label, ...outcome, wall_ms: Math.round(performance.now() - start), log_file: logFile };
    writeFileSync(join(out, `${item.id}-${label}-failure.json`), JSON.stringify(failure, null, 2) + "\n");
    throw new Error(`${item.id} ${label} exit=${outcome.code} signal=${outcome.signal}; inspect ${logFile}`);
  }
  const log = readFileSync(logFile, "utf8");
  const result = JSON.parse(readFileSync(graphFile, "utf8"));
  if (result.vector_pipeline?.vectorgrid?.refused) throw new Error(`${label}: VectorGrid refused; not a comparable run`);
  if (result.vector_pipeline?.l45_enabled || result.vector_pipeline?.ocr_assists) throw new Error(`${label}: prohibited assisted extraction enabled`);
  return { graph: result, stats: { label, forced_cold: cold, wall_ms: Math.round(performance.now() - start),
    rss_bytes: Number(log.match(/(\d+)\s+maximum resident set size/)?.[1] ?? 0), graph_file: graphFile, log_file: logFile } };
}
const results = [];
for (const item of cases) {
  console.log(`START ${item.id} baseline`);
  const a = await graph(baselineRoot, item, "baseline-cold", true);
  console.log(`START ${item.id} candidate`);
  const b = await graph(candidateRoot, item, "candidate-cold", true);
  // A no-cache run does not populate the cache. The normal repeat may already
  // hit a cache from a prior production run; the label is not proof of a miss.
  const fill = await graph(candidateRoot, item, "candidate-cache-fill", false);
  const warm = await graph(candidateRoot, item, "candidate-warm", false);
  const delta = compare(a.graph, b.graph);
  const replay = compare(b.graph, fill.graph), cachedReplay = compare(fill.graph, warm.graph);
  results.push({ id: item.id, source_sha256: item.sha256, delta, replay, cachedReplay,
    stats: [a.stats, b.stats, fill.stats, warm.stats] });
  writeFileSync(join(out, "summary.json"), JSON.stringify({ scope: "Table/graph preservation and process wall/RSS. Added regions are observations, not correctness or installed-quantity certification. No symbol sweep or takeoff/reference scorer is substituted by this comparison.", results }, null, 2) + "\n");
  console.log(`DONE ${item.id} ${JSON.stringify(delta)}`);
}
process.exitCode = results.some(routingComparisonFailed) ? 1 : 0;
