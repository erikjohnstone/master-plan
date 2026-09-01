#!/usr/bin/env node
/**
 * Corpus eval for out/*.takeoff.json — updates eval/scoreboard.json.
 *
 *   node eval/runCorpusEval.mjs [/path/to/opentakeoff-corpus] [--out dir]
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreCorpusTakeoffs } from "./scoreTakeoffDocument.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const corpusRoot = resolve(args[0] && !args[0].startsWith("--") ? args[0] : "../../../opentakeoff-corpus");
const outDir = resolve(
  args.includes("--out") ? args[args.indexOf("--out") + 1] : resolve(ROOT, "out"),
);
const scorePath = resolve(ROOT, "eval/scoreboard.json");

const scored = scoreCorpusTakeoffs(corpusRoot, outDir);
const board = {
  as_of: new Date().toISOString(),
  note: "Scored from compile-key expectations + emitted takeoff.json corpus",
  corpus: corpusRoot,
  out_dir: outDir,
  metrics: scored.metrics,
  acceptance: scored.acceptance,
  sample_sets: scored.perSet.slice(0, 8),
};

writeFileSync(scorePath, `${JSON.stringify(board, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, metrics: board.metrics, acceptance: board.acceptance }, null, 2));
