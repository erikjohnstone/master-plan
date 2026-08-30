/**
 * Production sheet-graph CLI — same Session + ODL path MCP tools use.
 *
 * Modes:
 *   --mode graph              → write SheetGraph JSON to --out (or stdout if small)
 *   --mode compile --kind …   → compileCorpusTakeoff JSON on stdout
 *
 * Usage:
 *   node --import tsx scripts/production-graph-cli.mjs \
 *     --mode graph|compile --pdf /abs/plan.pdf [--pdf …] [--kind …] [--out /path.json]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Session } from "../src/session.ts";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";

function argsOf(argv, name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && argv[i + 1]) out.push(argv[++i]);
  }
  return out;
}
function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

const mode = arg(process.argv, "--mode") || "graph";
const kind = arg(process.argv, "--kind");
const service = arg(process.argv, "--service");
const outPath = arg(process.argv, "--out");
const pdfs = argsOf(process.argv, "--pdf").map((p) => resolve(p));
if (!pdfs.length) {
  console.error("usage: production-graph-cli.mjs --mode graph|compile --pdf <path> [--pdf …] [--kind …] [--service CHW|HHW] [--out …]");
  process.exit(2);
}
if (mode === "compile" && !kind) {
  console.error("--kind required for --mode compile");
  process.exit(2);
}

const session = new Session();
await session.loadPlan(pdfs[0]);
for (let i = 1; i < pdfs.length; i++) {
  await session.loadPlan(pdfs[i], { merge: true });
}
const graph = await session.graphForPipeline();

if (mode === "graph") {
  const json = JSON.stringify(graph);
  if (outPath) {
    writeFileSync(outPath, json);
    process.stdout.write(`${JSON.stringify({ ok: true, bytes: json.length, out: outPath })}\n`);
  } else {
    // Large graphs can stress pipe buffering — prefer --out from the middleware.
    process.stdout.write(`${json}\n`);
  }
  process.exit(0);
}

const compiled = compileCorpusTakeoff(session, graph, kind, service ? { service } : {});
process.stdout.write(`${JSON.stringify(compiled)}\n`);
