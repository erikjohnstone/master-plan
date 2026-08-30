/**
 * Extract slim golden answers from local run dumps (or synthesize from truth)
 * and write demos/<id>/golden/answer.json for checked-in frozen verify.
 *
 * Usage:
 *   node scripts/extract-demo-goldens.mjs
 *   node scripts/extract-demo-goldens.mjs --demo D10-bas-points-takeoff
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const corpus = resolve(root, "opentakeoff-corpus/demos");
const args = process.argv.slice(2);
const only = args.includes("--demo") ? args[args.indexOf("--demo") + 1] : null;

function citationsFor(spec) {
  if (Array.isArray(spec.citations)) return spec.citations;
  return spec.citation ? [spec.citation] : [];
}

function synthesizeFromTruth(truth) {
  return {
    schema_version: 1,
    demo_id: truth.demo_id,
    status: "done",
    source: "synthesized_from_truth",
    answer: Object.fromEntries(Object.entries(truth.expected || {}).map(([name, spec]) => [
      name,
      { value: spec.value, citations: citationsFor(spec) },
    ])),
  };
}

function slimFromRun(run, truth) {
  return {
    schema_version: 1,
    demo_id: run.demo_id || truth.demo_id,
    status: run.status || "done",
    source: `run-${run.run_number || "local"}`,
    latency_ms: run.latency_ms,
    answer: run.answer,
  };
}

const demos = readdirSync(corpus, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^D\d{2}-/.test(d.name))
  .map((d) => d.name)
  .filter((name) => !only || name === only || name.startsWith(only))
  .sort();

for (const name of demos) {
  const dir = resolve(corpus, name);
  const truthPath = resolve(dir, "truth.json");
  if (!existsSync(truthPath)) {
    console.warn(`skip ${name}: no truth.json`);
    continue;
  }
  const truth = JSON.parse(readFileSync(truthPath, "utf8"));
  let golden;
  const run1 = resolve(dir, "runs/run-1.json");
  if (existsSync(run1)) {
    const run = JSON.parse(readFileSync(run1, "utf8"));
    if (run?.answer && typeof run.answer === "object") {
      golden = slimFromRun(run, truth);
    }
  }
  if (!golden) golden = synthesizeFromTruth(truth);

  const outDir = resolve(dir, "golden");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "answer.json");
  writeFileSync(outPath, `${JSON.stringify(golden, null, 2)}\n`);
  console.log(`wrote ${name}/golden/answer.json (${golden.source}, ${Object.keys(golden.answer).length} fields)`);
}
