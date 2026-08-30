/**
 * Frozen golden verify for every locked demo — no model calls.
 * Default is --fast (value + cite-form + bbox overlap, no OCR).
 * Pass --ocr for the slow full cite-ground path.
 *
 * Usage:
 *   node --import tsx scripts/verify-demo-suite.mjs
 *   node --import tsx scripts/verify-demo-suite.mjs --ocr
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = resolve(here, "../../../opentakeoff-corpus");
const demosRoot = resolve(corpus, "demos");
const verifyScript = resolve(here, "verify-demo.mjs");
const wantOcr = process.argv.includes("--ocr");
const fastFlags = wantOcr ? [] : ["--fast"];

const demos = readdirSync(demosRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^D\d{2}-/.test(d.name))
  .map((d) => d.name)
  .sort();

let failed = 0;
const started = Date.now();
for (const name of demos) {
  const dir = resolve(demosRoot, name);
  const truth = resolve(dir, "truth.json");
  const golden = resolve(dir, "golden/answer.json");
  if (!existsSync(truth)) {
    console.error(`FAIL ${name}: missing truth.json`);
    failed += 1;
    continue;
  }
  if (!existsSync(golden)) {
    console.error(`FAIL ${name}: missing golden/answer.json — run: node scripts/extract-demo-goldens.mjs`);
    failed += 1;
    continue;
  }

  // Skip separate truth-only OCR pass in fast mode — golden already checks
  // values against truth, and engine regressions cover extractability.
  if (wantOcr) {
    console.log(`\n=== ${name} truth-only ===`);
    let r = spawnSync(process.execPath, ["--import", "tsx", verifyScript, truth, "--truth-only", "--corpus", corpus], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    if (r.status !== 0) {
      console.error(r.stdout?.slice(-1500) || "");
      console.error(r.stderr?.slice(-1500) || "");
      console.error(`FAIL ${name} truth-only`);
      failed += 1;
      continue;
    }
    console.log(`OK ${name} truth-only`);
  }

  console.log(`=== ${name} golden${wantOcr ? "" : " (fast)"} ===`);
  const r = spawnSync(process.execPath, [
    "--import", "tsx", verifyScript, truth, golden, "--corpus", corpus, ...fastFlags,
  ], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(r.stdout?.slice(-2000) || "");
    console.error(r.stderr?.slice(-1500) || "");
    console.error(`FAIL ${name} golden`);
    failed += 1;
    continue;
  }
  console.log(`OK ${name} golden`);
}

const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\nverify-demo-suite: ${demos.length - failed}/${demos.length} demos ok (${elapsedSec}s, ${wantOcr ? "ocr" : "fast"})`);
if (failed) process.exit(1);
