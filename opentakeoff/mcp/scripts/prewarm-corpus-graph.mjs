#!/usr/bin/env node
/**
 * Prewarm vector-pipeline graph cache for all corpus compile keys (shared path).
 * Run before bulk emit so emit hits warm cache and finishes in seconds/set.
 *
 *   node --import tsx scripts/prewarm-corpus-graph.mjs --corpus DIR [--shard i/n] [--limit N]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { cachedGraphForKey } from "../test/helpers/loadKeySession.mjs";
import { VECTOR_PIPELINE_CACHE_ID } from "./graphCacheConstants.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const corpusRoot = resolve(arg("--corpus") || "../../../opentakeoff-corpus");
const limit = arg("--limit") ? Number(arg("--limit")) : null;
const shardSpec = arg("--shard");
const [shardIndex, shardCount] = shardSpec ? shardSpec.split("/").map(Number) : [null, null];
const crossDir = resolve(corpusRoot, "takeoffs/cross-set-compile");

const keys = readdirSync(crossDir)
  .filter((f) => f.endsWith(".compile.json"))
  .map((f) => JSON.parse(readFileSync(resolve(crossDir, f), "utf8")))
  .sort((a, b) => a.set_id.localeCompare(b.set_id))
  .filter((k, idx) => shardCount == null || idx % shardCount === shardIndex);

const todo = limit ? keys.slice(0, limit) : keys;
const started = performance.now();
const results = [];
const skipped = [];

for (let i = 0; i < todo.length; i++) {
  const key = todo[i];
  const t0 = performance.now();
  try {
    const graph = await cachedGraphForKey(corpusRoot, key, VECTOR_PIPELINE_CACHE_ID);
    if (!graph) {
      skipped.push({ set_id: key.set_id, skip: "pdf_or_parts_missing" });
    } else {
      results.push({
        set_id: key.set_id,
        ms: Math.round(performance.now() - t0),
        sheets: graph.sheets?.length ?? 0,
        tables: graph.tables?.length ?? 0,
      });
    }
  } catch (e) {
    skipped.push({ set_id: key.set_id, skip: "error", detail: String(e?.message || e).slice(0, 160) });
  }
  console.error(`prewarm ${i + 1}/${todo.length} ${key.set_id} — ok ${results.length} skip ${skipped.length}`);
}

const summary = {
  ok: true,
  cache_id: VECTOR_PIPELINE_CACHE_ID,
  corpus: corpusRoot,
  ms: Math.round(performance.now() - started),
  warmed: results.length,
  skipped: skipped.length,
  shard: shardSpec ?? null,
};
const outPath = resolve(HERE, "../../out", `_prewarm-${shardSpec || "all"}.json`);
writeFileSync(outPath, `${JSON.stringify({ ...summary, results, skipped }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
