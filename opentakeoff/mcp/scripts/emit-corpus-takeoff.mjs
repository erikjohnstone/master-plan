#!/usr/bin/env node
/**
 * Batch emit out/<set_id>.takeoff.json for corpus compile keys (shared path).
 *
 *   node --import tsx scripts/emit-corpus-takeoff.mjs /path/to/opentakeoff-corpus [--out dir] [--limit N] [setId ...]
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { buildEstimatorTakeoffDocument } from "../../web/src/lib/estimatorTakeoffDocument.mjs";
import { loadCachedKeySession } from "../test/helpers/loadKeySession.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const corpusRoot = resolve(arg("--corpus") || args.find((a) => !a.startsWith("--")) || "../../../opentakeoff-corpus");
const outDir = resolve(arg("--out") || resolve(HERE, "../../out"));
const limitRaw = arg("--limit");
const limit = limitRaw != null ? Number(limitRaw) : null;
const setsRaw = arg("--sets");
const filterIds = new Set(
  setsRaw
    ? setsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : args.filter((a) => !a.startsWith("--") && a !== corpusRoot && a !== outDir && a !== limitRaw && a !== setsRaw),
);

const CACHE_ID = "emit-takeoff-v1";
const crossDir = resolve(corpusRoot, "takeoffs/cross-set-compile");
const keys = readdirSync(crossDir)
  .filter((f) => f.endsWith(".compile.json"))
  .map((f) => JSON.parse(readFileSync(resolve(crossDir, f), "utf8")))
  .filter((k) => !filterIds.size || filterIds.has(k.set_id));

mkdirSync(outDir, { recursive: true });

async function emitOne(key) {
  const loaded = await loadCachedKeySession(corpusRoot, key, CACHE_ID);
  if (!loaded) return { set_id: key.set_id, skip: "pdf_or_parts_missing" };
  const { session, graph } = loaded;

  let sha256 = null;
  const pdfPath = resolve(corpusRoot, key.source_file);
  try {
    if (pdfPath.endsWith(".pdf")) {
      sha256 = createHash("sha256").update(readFileSync(pdfPath)).digest("hex");
    }
  } catch {
    /* parts-only */
  }

  const doc = buildEstimatorTakeoffDocument(graph, {
    file: key.source_file || key.set_id,
    sha256,
  });
  const outPath = resolve(outDir, `${key.set_id}.takeoff.json`);
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  return {
    set_id: key.set_id,
    out: outPath,
    valves: doc.valves.length,
    points: doc.points.length,
    sequences: doc.sequences?.length ?? 0,
    sheets: graph.sheets?.length ?? 0,
  };
}

const started = performance.now();
const results = [];
const skipped = [];
const todo = limit ? keys.slice(0, limit) : keys;

for (let i = 0; i < todo.length; i++) {
  const key = todo[i];
  try {
    const row = await emitOne(key);
    if (row.skip) skipped.push(row);
    else results.push(row);
    if ((i + 1) % 5 === 0) {
      console.error(`emit progress ${i + 1}/${todo.length} …`);
    }
  } catch (e) {
    skipped.push({ set_id: key.set_id, skip: "error", detail: String(e?.message || e).slice(0, 160) });
  }
}

const summary = {
  ok: true,
  corpus: corpusRoot,
  out: outDir,
  ms: Math.round(performance.now() - started),
  emitted: results.length,
  skipped: skipped.length,
  keys_total: keys.length,
};
writeFileSync(resolve(outDir, "_emit-summary.json"), `${JSON.stringify({ ...summary, results, skipped }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
