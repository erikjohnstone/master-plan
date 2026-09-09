/** Shared production orchestration for BOTH MCP and the UI's existing CLI. */
import { compileTakeoff } from "../../web/src/lib/compileTakeoff.mjs";
import { compileSequencesTakeoff } from "../../web/src/lib/sequenceExtract.ts";
import type { SheetGraph } from "../../web/src/lib/sheetgraph.ts";
import { runBasMath, runBasPointLists } from "./basMath.ts";
import { captureBasPoints } from "../../web/src/lib/basWorkflow.ts";

/** Snapshot the source context before awaiting either Python operation. A
 * math-policy error and an evidence error are independent, never a fake zero.
 * Legacy internal callers without a Session keep their existing result shape.
 */
async function pointListsForSession(session: unknown, graph: SheetGraph) {
  if (!session || typeof session !== "object" || !("basSourcesForPipeline" in session)
      || typeof session.basSourcesForPipeline !== "function") return undefined;
  try {
    const sources = session.basSourcesForPipeline();
    const points = await runBasPointLists({ sources, tables: graph.tables });
    try {
      const workflow = await captureBasPoints(sources.documents, points);
      if ('retainBasWorkflow' in session && typeof session.retainBasWorkflow === 'function') session.retainBasWorkflow(workflow);
      return { bas_point_lists: points, bas_workflow: workflow };
    } catch (error) {
      // Retention is a separate failure domain. Preserve useful unresolved
      // source observations even when they cannot form a source-owned capture.
      return { bas_point_lists: points, bas_workflow_error: error instanceof Error ? error.message : 'BAS evidence capture unavailable' };
    }
  } catch (error) {
    return { bas_point_lists: { schema_version: "bas_point_lists_v1" as const, status: "unavailable" as const,
      project_complete: false as const, error: error instanceof Error ? error.message : "BAS point sources unavailable" } };
  }
}

export async function compileProductionTakeoff(session: unknown, graph: SheetGraph, kind: string,
  opts: { service?: string; bas_math?: unknown } = {}) {
  const compiled = compileTakeoff(session, graph, kind, opts);
  if (compiled.kind !== "bas_points") return compiled;
  // SHOULD THIS BE ON THE SHARED PATH? Yes: both UI CLI and MCP call here.
  // Source observations do not rewrite existing tables, printed totals or math.
  const pointLists = pointListsForSession(session, graph);
  let bas_math;
  try {
    const sequences = compileSequencesTakeoff(session, graph);
    bas_math = await runBasMath({ blueprint: { tables: graph.tables,
      sequence_count: sequences.totals.sequences, options: opts.bas_math ?? {} } });
  } catch (error) {
    // Preserve every original cell/cite/result. An unavailable math runtime is
    // explicit and never looks like a successfully calculated zero-point job.
    bas_math = { engine: "bas_math_v1" as const, status: "unavailable" as const,
      project_complete: false as const, error: error instanceof Error ? error.message : "BAS math unavailable" };
  }
  const pointResult = await pointLists;
  return { ...compiled, bas_math, ...pointResult };
}
