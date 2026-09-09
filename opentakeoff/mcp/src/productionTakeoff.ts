/** Shared production orchestration for BOTH MCP and the UI's existing CLI. */
import { compileTakeoff } from "../../web/src/lib/compileTakeoff.mjs";
import { compileSequencesTakeoff } from "../../web/src/lib/sequenceExtract.ts";
import type { SheetGraph } from "../../web/src/lib/sheetgraph.ts";
import { runBasMath } from "./basMath.ts";

export async function compileProductionTakeoff(session: unknown, graph: SheetGraph, kind: string,
  opts: { service?: string; bas_math?: unknown } = {}) {
  const compiled = compileTakeoff(session, graph, kind, opts);
  if (compiled.kind !== "bas_points") return compiled;
  try {
    const sequences = compileSequencesTakeoff(session, graph);
    const bas_math = await runBasMath({ blueprint: { tables: graph.tables,
      sequence_count: sequences.totals.sequences, options: opts.bas_math ?? {} } });
    return { ...compiled, bas_math };
  } catch (error) {
    // Preserve every original cell/cite/result. An unavailable math runtime is
    // explicit and never looks like a successfully calculated zero-point job.
    return { ...compiled, bas_math: { engine: "bas_math_v1", status: "unavailable",
      project_complete: false, error: error instanceof Error ? error.message : "BAS math unavailable" } };
  }
}
