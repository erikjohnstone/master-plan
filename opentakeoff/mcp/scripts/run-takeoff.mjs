/**
 * Run one or N corpus takeoff validations (T-HVAC-01 / T-BAS-01).
 *
 * Usage:
 *   node --import tsx scripts/run-takeoff.mjs --takeoff T-HVAC-01 --run 1 --cold
 *   node --import tsx scripts/run-takeoff.mjs --takeoff T-BAS-01 --runs 5
 *   node --import tsx scripts/run-takeoff.mjs --takeoff T-HVAC-01 --run 5 --export
 */
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { Session } from "../src/session.ts";
import { compileCorpusTakeoff, takeoffWorkbookSheets, rowsToCsv } from "../src/corpusTakeoff.mjs";
import { verifyTakeoffGates, loadTruth } from "../src/verifyTakeoffGates.mjs";

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const corpus = resolve(root, "opentakeoff-corpus");
const args = process.argv.slice(2);
const takeoffId = arg(args, "--takeoff");
const runOne = arg(args, "--run") ? Number(arg(args, "--run")) : null;
const runsN = arg(args, "--runs") ? Number(arg(args, "--runs")) : null;
const cold = args.includes("--cold") || runOne === 1 || runOne === 5 || (runsN && true);
const doExport = args.includes("--export");
const skipInterrogation = args.includes("--skip-interrogation");
const groundSample = arg(args, "--ground-sample") ? Number(arg(args, "--ground-sample")) : 3;

if (!takeoffId || (!runOne && !runsN)) {
  console.error("usage: node --import tsx scripts/run-takeoff.mjs --takeoff T-HVAC-01|T-BAS-01 (--run N | --runs 5) [--cold] [--export] [--skip-interrogation]");
  process.exit(2);
}

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

const meta = TAKEOFFS[takeoffId];
if (!meta) {
  console.error(`unknown takeoff ${takeoffId}`);
  process.exit(2);
}

const fixture = JSON.parse(readFileSync(resolve(meta.dir, "fixture.json"), "utf8"));
const truth = loadTruth(resolve(meta.dir, "truth.json"));
const prompt = readFileSync(resolve(meta.dir, "prompt.txt"), "utf8").trim();
const source = resolve(corpus, fixture.source_file);

async function runOnce(runNumber, { forceCold }) {
  const t0 = Date.now();
  const session = new Session();
  // Cold = fresh Session + loadPlan (no reused graph cache across runs).
  await session.loadPlan(source);
  const graph = await session.graphForPipeline();
  const compiled = compileCorpusTakeoff(session, graph, meta.kind);
  compiled.prompt_frozen = prompt;
  compiled.run = runNumber;
  compiled.cold = !!forceCold;
  compiled.source_sha256 = createHash("sha256").update(readFileSync(source)).digest("hex");
  if (compiled.source_sha256 !== fixture.sha256) {
    throw new Error(`fixture sha256 mismatch: got ${compiled.source_sha256}`);
  }

  const verification = await verifyTakeoffGates(truth, compiled, session, {
    skipInterrogation,
    groundSamplePerCategory: groundSample,
  });

  const outDir = resolve(meta.dir, "runs");
  mkdirSync(outDir, { recursive: true });
  const runPath = resolve(outDir, `run-${runNumber}.json`);
  const payload = {
    takeoff_id: takeoffId,
    run: runNumber,
    cold: !!forceCold,
    latency_ms: Date.now() - t0,
    prompt,
    result: compiled,
    verification: {
      ok: verification.ok,
      failures: verification.failures,
      gates: Object.fromEntries(
        Object.entries(verification.gates).map(([k, v]) => [k, {
          name: v.name,
          ok: v.ok,
          failure_count: v.failures.length,
          check_count: v.checks.length,
        }]),
      ),
    },
    interrogation: verification.interrogation,
  };
  writeFileSync(runPath, `${JSON.stringify(payload, null, 2)}\n`);

  if (!verification.ok) {
    const failPath = resolve(meta.dir, "failures.md");
    const lines = [
      "",
      `## Run ${runNumber} FAIL ${new Date().toISOString()}`,
      ...verification.failures.map((f) => `- \`${f.class}\` gate ${f.gate}: ${f.detail}`),
      "",
    ];
    appendFileSync(failPath, lines.join("\n"));
  }

  if (doExport && runNumber === 5 && verification.ok) {
    await exportRun5(meta.dir, compiled, verification.interrogation);
  } else if (doExport && runNumber === 5 && !verification.ok) {
    console.error("Skipping Run 5 export — gates failed");
  }

  return { runPath, ok: verification.ok, failures: verification.failures, latency_ms: payload.latency_ms };
}

async function exportRun5(dir, compiled, interrogation) {
  const exportDir = resolve(dir, "export");
  const interrogDir = resolve(dir, "interrogation");
  mkdirSync(exportDir, { recursive: true });
  mkdirSync(interrogDir, { recursive: true });
  writeFileSync(resolve(interrogDir, "run-5.json"), `${JSON.stringify(interrogation, null, 2)}\n`);

  const sheets = takeoffWorkbookSheets(compiled, { interrogationLog: interrogation });
  for (const sheet of sheets) {
    const safe = sheet.name.replace(/[^\w.-]+/g, "_").slice(0, 40);
    writeFileSync(resolve(exportDir, `${safe}.csv`), rowsToCsv(sheet.rows));
  }
  writeFileSync(resolve(exportDir, "takeoff.json"), `${JSON.stringify(compiled, null, 2)}\n`);

  // XLSX via web buildXlsx (fflate lives in web/node_modules)
  try {
    const webNodeModules = resolve(root, "opentakeoff/web/node_modules");
    const prev = process.env.NODE_PATH || "";
    process.env.NODE_PATH = [webNodeModules, prev].filter(Boolean).join(":");
    const { createRequire } = await import("node:module");
    const require = createRequire(resolve(root, "opentakeoff/web/package.json"));
    // Ensure fflate resolves for dynamic import inside buildXlsx
    require.resolve("fflate");
    const xlsxMod = await import(pathToFileURL(resolve(root, "opentakeoff/web/src/lib/xlsx.js")).href);
    const bytes = await xlsxMod.buildXlsx(sheets);
    writeFileSync(resolve(exportDir, "run-5.xlsx"), bytes);
  } catch (err) {
    console.warn("xlsx export skipped:", err.message);
  }
  console.log(`Run 5 export written under ${exportDir}`);
}

const numbers = runsN
  ? Array.from({ length: runsN }, (_, i) => i + 1)
  : [runOne];

let passed = 0;
for (const n of numbers) {
  const forceCold = args.includes("--cold") || n === 1 || n === 5;
  console.log(`\n=== ${takeoffId} run ${n}/${numbers[numbers.length - 1]} cold=${forceCold} ===`);
  const r = await runOnce(n, { forceCold });
  console.log(JSON.stringify({
    run: n,
    ok: r.ok,
    latency_ms: r.latency_ms,
    failures: r.failures.slice(0, 8),
    runPath: r.runPath,
  }, null, 2));
  if (!r.ok) {
    console.error(`FAIL at run ${n} — protocol requires restart at 0/5 after system fix`);
    process.exit(1);
  }
  passed += 1;
}

console.log(`\n${takeoffId} ${passed}/${numbers.length} PASSED`);
