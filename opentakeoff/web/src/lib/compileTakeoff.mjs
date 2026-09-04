/**
 * The ONE corpus-takeoff dispatcher — every caller (MCP tool, the /__ot
 * compile endpoint's CLI, and every script) should reach compileCorpusTakeoff
 * through THIS function, not the bare one in corpusTakeoff.mjs.
 *
 * corpusTakeoff.mjs's own compileCorpusTakeoff() only handles the 3 kinds it
 * owns directly (hvac_equipment, bas_points, control_valves) and throws on
 * "sequences"/"embedded_coil_gaps" — by design, since routing "sequences" to
 * sequenceExtract.ts's compileSequencesTakeoff from inside corpusTakeoff.mjs
 * itself would be circular (sequenceExtract.ts already imports FROM
 * corpusTakeoff.mjs). Before this module existed, that ternary was hand-
 * duplicated in mcp/src/tools.ts and mcp/scripts/production-graph-cli.mjs —
 * two copies that could (and did, via the orphaned compile-corpus-takeoff-
 * cli.mjs and takeoff-census.mjs) silently miss one call site and throw.
 * One dispatcher, one place to add a sixth kind.
 */
import { compileCorpusTakeoff, compileEmbeddedCoilGaps } from "./corpusTakeoff.mjs";
import { compileSequencesTakeoff } from "./sequenceExtract.ts";

export function compileTakeoff(session, graph, kind, opts = {}) {
  if (kind === "sequences" || kind === "T-SOO-01") return compileSequencesTakeoff(session, graph);
  if (kind === "embedded_coil_gaps" || kind === "T-VALVE-EMBEDDED-01") return compileEmbeddedCoilGaps(session, graph);
  return compileCorpusTakeoff(session, graph, kind, opts);
}
