#!/usr/bin/env node
/**
 * Batch emit out/<set_id>.takeoff.json for corpus compile keys (shared path).
 *
 *   node --import tsx scripts/emit-corpus-takeoff.mjs --corpus /path/to/opentakeoff-corpus [--out dir] [--limit N] [--resume] [--sets id1,id2]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { buildEstimatorTakeoffDocument } from "../../web/src/lib/estimatorTakeoffDocument.mjs";
import { loadCachedKeySession } from "../test/helpers/loadKeySession.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const DEFAULT_OUT = resolve(HERE, "../../out");

function parseArgs(argv) {
  const positional = [];
  let corpus = null;
  let out = null;
  let limit = null;
  let resume = false;
  let sets = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--corpus") corpus = argv[++i];
    else if (a === "--out") out = argv[++i];
    else if (a === "--limit") limit = Number(argv[++i]);
    else if (a === "--sets") sets = argv[++i];
    else if (a === "--resume") resume = true;
    else if (a === "--help" || a === "-h") {
      console.error("usage: emit-corpus-takeoff.mjs --corpus DIR [--out DIR] [--limit N] [--resume] [--sets id1,id2]");
      process.exit(0);
    } else if (!a.startsWith("-")) positional.push(a);
  }
  if (!corpus && positional[0]) corpus = positional[0];
  return {
    corpusRoot: resolve(corpus || DEFAULT_CORPUS),
    outDir: resolve(out || DEFAULT_OUT),
    limit: Number.isFinite(limit) && limit > 0 ? limit : null,
    resume,
    filterIds: sets ? new Set(sets.split(",").map((s) => s.trim()).filter(Boolean)) : new Set(),
  };
}

const opts = parseArgs(process.argv.slice(2));
const { corpusRoot, outDir, limit, resume, filterIds } = opts;

const CACHE_ID = "emit-takeoff-v1";
const crossDir = resolve(corpusRoot, "takeoffs/cross-set-compile");
if (!existsSync(crossDir)) {
  console.error(`missing cross-set-compile dir: ${crossDir}`);
  process.exit(2);
}

const keys = readdirSync(crossDir)
  .filter((f) => f.endsWith(".compile.json"))
  .map((f) => JSON.parse(readFileSync(resolve(crossDir, f), "utf8")))
  .filter((k) => !filterIds.size || filterIds.has(k.set_id));

mkdirSync(outDir, { recursive: true });

async function emitOne(key) {
  const outPath = resolve(outDir, `${key.set_id}.takeoff.json`);
  if (resume && existsSync(outPath)) {
    return { set_id: key.set_id, out: outPath, skip: "already_exists" };
  }

  const loaded = await loadCachedKeySession(corpusRoot, key, CACHE_ID);
  if (!loaded) return { set_id: key.set_id, skip: "pdf_or_parts_missing" };
  const { graph } = loaded;

  let sha256 = null;
  const pdfPath = resolve(corpusRoot, key.source_file);
  try {
    if (pdfPath.endsWith(".pdf") && existsSync(pdfPath)) {
      sha256 = createHash("sha256").update(readFileSync(pdfPath)).digest("hex");
    }
  } catch {
    /* parts-only */
  }

  const doc = buildEstimatorTakeoffDocument(graph, {
    file: key.source_file || key.set_id,
    sha256,
  });
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  return {
    set_id: key.set_id,
    out: outPath,
    valves: doc.valves.length,
    dampers: doc.dampers.length,
    points: doc.points.length,
    sequences: doc.sequences?.length ?? 0,
    sheets: graph.sheets?.length ?? 0,
    tables: graph.tables?.length ?? 0,
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
    if (row.skip === "already_exists") {
      skipped.push(row);
    } else if (row.skip) {
      skipped.push(row);
    } else {
      results.push(row);
    }
    if ((i + 1) % 1 === 0 || i + 1 === todo.length) {
      console.error(`emit ${i + 1}/${todo.length} ${key.set_id} — ok ${results.length} skip ${skipped.length}`);
    }
  } catch (e) {
    skipped.push({ set_id: key.set_id, skip: "error", detail: String(e?.message || e).slice(0, 200) });
  }
}

const summary = {
  ok: true,
  corpus: corpusRoot,
  out: outDir,
  ms: Math.round(performance.now() - started),
  emitted: results.length,
  skipped: skipped.length,
  resumed_skipped: skipped.filter((s) => s.skip === "already_exists").length,
  keys_total: keys.length,
  todo: todo.length,
};
writeFileSync(resolve(outDir, "_emit-summary.json"), `${JSON.stringify({ ...summary, results, skipped }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
