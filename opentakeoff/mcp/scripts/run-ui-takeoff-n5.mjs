/**
 * UI-surface N=5 for corpus takeoffs — hits the SAME /__ot/compile-corpus-takeoff
 * endpoint the Takeoff UI uses (Session + ODL + compileCorpusTakeoff).
 *
 * Usage:
 *   node --import tsx scripts/run-ui-takeoff-n5.mjs --takeoff T-HVAC-01 --runs 5
 *   node --import tsx scripts/run-ui-takeoff-n5.mjs --takeoff T-BAS-01 --runs 5
 */
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Session } from "../src/session.ts";
import { verifyTakeoffGates, loadTruth } from "../src/verifyTakeoffGates.mjs";

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const corpus = resolve(root, "opentakeoff-corpus");
const args = process.argv.slice(2);
const takeoffId = arg(args, "--takeoff");
const runsN = Number(arg(args, "--runs") || "5");
const uiBase = (arg(args, "--ui") || process.env.OT_UI_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const skipInterrogation = args.includes("--skip-interrogation");
const groundSample = arg(args, "--ground-sample") ? Number(arg(args, "--ground-sample")) : 3;

const TAKEOFFS = {
  "T-HVAC-01": {
    dir: resolve(corpus, "takeoffs/T-HVAC-01-navfac-equipment"),
    kind: "hvac_equipment",
  },
  "T-BAS-01": {
    dir: resolve(corpus, "takeoffs/T-BAS-01-navfac-points"),
    kind: "bas_points",
  },
};

if (!takeoffId || !TAKEOFFS[takeoffId]) {
  console.error("usage: run-ui-takeoff-n5.mjs --takeoff T-HVAC-01|T-BAS-01 --runs 5");
  process.exit(2);
}

const meta = TAKEOFFS[takeoffId];
const fixture = JSON.parse(readFileSync(resolve(meta.dir, "fixture.json"), "utf8"));
const truth = loadTruth(resolve(meta.dir, "truth.json"));
const prompt = readFileSync(resolve(meta.dir, "prompt.txt"), "utf8").trim();
const source = resolve(corpus, fixture.source_file);
const sourceSha = createHash("sha256").update(readFileSync(source)).digest("hex");
if (sourceSha !== fixture.sha256) throw new Error(`fixture sha256 mismatch`);

const uiRunsDir = resolve(meta.dir, "ui-runs");
mkdirSync(uiRunsDir, { recursive: true });
const logPath = resolve(uiRunsDir, "CHANGELOG.md");
if (!existsSync(logPath)) {
  writeFileSync(logPath, `# UI N=5 — ${takeoffId}\n\nSurface: Takeoff UI via /__ot/compile-corpus-takeoff (Session+ODL).\n\n`);
}

async function compileViaUiApi(kind) {
  const res = await fetch(`${uiBase}/__ot/compile-corpus-takeoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, pdfPath: source }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch {
    throw new Error(`UI compile non-JSON HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(body.error || `UI compile HTTP ${res.status}`);
  return body;
}

async function runOnce(runNumber) {
  const t0 = Date.now();
  const compiled = await compileViaUiApi(meta.kind);
  compiled.prompt_frozen = prompt;
  compiled.run = runNumber;
  compiled.cold = true;
  compiled.surface = "takeoff_ui";
  compiled.source_sha256 = sourceSha;

  // Gate 3/5 need a live Session for vector groundedness + interrogation —
  // same PDF, independent of how compile was produced.
  const session = new Session();
  await session.loadPlan(source);
  await session.graphForPipeline();

  const verification = await verifyTakeoffGates(truth, compiled, session, {
    skipInterrogation,
    groundSamplePerCategory: groundSample,
  });

  const out = {
    takeoff_id: takeoffId,
    run: runNumber,
    surface: "takeoff_ui",
    elapsed_ms: Date.now() - t0,
    pass: verification.pass,
    gates: verification.gates,
    totals: compiled.totals,
    compiled,
    verification,
  };
  writeFileSync(resolve(uiRunsDir, `run-${runNumber}.json`), JSON.stringify(out, null, 2));
  appendFileSync(logPath, `- run ${runNumber}: ${verification.pass ? "PASS" : "FAIL"} (${Date.now() - t0}ms) surface=takeoff_ui items/rows=${compiled.totals?.items ?? compiled.totals?.rows}\n`);
  console.log(JSON.stringify({
    run: runNumber,
    pass: verification.pass,
    totals: compiled.totals,
    gates: Object.fromEntries(Object.entries(verification.gates || {}).map(([k, v]) => [k, v.pass ?? v.ok ?? v])),
    elapsed_ms: Date.now() - t0,
  }));
  return out;
}

let passed = 0;
for (let i = 1; i <= runsN; i++) {
  const r = await runOnce(i);
  if (!r.pass) {
    console.error(`UI N=5 FAILED at run ${i} — restart at 0/5 after system fix`);
    process.exit(1);
  }
  passed++;
}
appendFileSync(logPath, `\nLOCKED UI ${passed}/${runsN} at ${new Date().toISOString()}\n`);
console.log(`UI LOCKED ${takeoffId} ${passed}/${runsN}`);
