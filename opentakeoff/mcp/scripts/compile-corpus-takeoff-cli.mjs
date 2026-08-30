/**
 * CLI bridge: same MCP Session + ODL graph + compileCorpusTakeoff as the
 * compile_corpus_takeoff tool. Used by the Vite UI middleware so browser and
 * API stay on one production path.
 *
 * Usage:
 *   node --import tsx scripts/compile-corpus-takeoff-cli.mjs \
 *     --kind hvac_equipment|bas_points|T-HVAC-01|T-BAS-01 \
 *     --pdf /abs/path/to/plan.pdf
 */
import { resolve } from "node:path";
import { Session } from "../src/session.ts";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

const kind = arg(process.argv, "--kind");
const pdf = arg(process.argv, "--pdf");
if (!kind || !pdf) {
  console.error("usage: compile-corpus-takeoff-cli.mjs --kind <kind> --pdf <path>");
  process.exit(2);
}

const session = new Session();
await session.loadPlan(resolve(pdf));
const graph = await session.graphForPipeline();
const compiled = compileCorpusTakeoff(session, graph, kind);
process.stdout.write(`${JSON.stringify(compiled)}\n`);
