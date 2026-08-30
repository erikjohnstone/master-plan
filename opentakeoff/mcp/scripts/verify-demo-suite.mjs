/**
 * Frozen golden verify for every locked demo — no model calls.
 * Runs verify-demo.mjs against demos/<id>/golden/answer.json (and --truth-only).
 *
 * Usage: node --import tsx scripts/verify-demo-suite.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = resolve(here, "../../../opentakeoff-corpus");
const demosRoot = resolve(corpus, "demos");
const verifyScript = resolve(here, "verify-demo.mjs");

const demos = readdirSync(demosRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^D\d{2}-/.test(d.name))
  .map((d) => d.name)
  .sort();

let failed = 0;
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

  console.log(`=== ${name} golden ===`);
  r = spawnSync(process.execPath, ["--import", "tsx", verifyScript, truth, golden, "--corpus", corpus], {
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

console.log(`\nverify-demo-suite: ${demos.length - failed}/${demos.length} demos ok`);
if (failed) process.exit(1);
