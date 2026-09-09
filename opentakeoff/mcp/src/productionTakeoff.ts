/** Shared production orchestration for BOTH MCP and the UI's existing CLI. */
import { compileTakeoff } from "../../web/src/lib/compileTakeoff.mjs";
import { compileSequencesTakeoff } from "../../web/src/lib/sequenceExtract.ts";
import type { SheetGraph } from "../../web/src/lib/sheetgraph.ts";
import { runBasMath, runBasPointLists } from "./basMath.ts";
import { captureBasEvidence, mergeBasWorkflows } from "../../web/src/lib/basWorkflow.ts";
import { applyBasReview } from "../../web/src/lib/basReview.ts";

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
      const workflow = await captureBasEvidence(sources, points);
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
  opts: { service?: string; bas_math?: unknown; bas_review?: unknown } = {}) {
  if (opts.bas_review != null && kind !== 'bas_points' && kind !== 'T-BAS-01') throw new Error('BAS review is only available for the BAS points workflow');
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
  if (pointResult && 'bas_workflow' in pointResult && pointResult.bas_workflow) {
    const previous = session && typeof session === 'object' && 'basWorkflow' in session ? session.basWorkflow : null;
    const merged = mergeBasWorkflows(previous, pointResult.bas_workflow, true)!;
    // A read/recompile returns the retained history too, not only the fresh
    // extraction capture. Source evidence and decisions stay separate.
    pointResult.bas_workflow = merged;
    if (opts.bas_review != null) {
      pointResult.bas_workflow = await applyBasReview(merged, opts.bas_review, 'agent_proposal');
    }
    // Commit only after any requested review validates. Invalid requests leave
    // the prior Session review/capture state untouched.
    if (session && typeof session === 'object' && 'retainBasWorkflow' in session && typeof session.retainBasWorkflow === 'function') {
      const retained = session.retainBasWorkflow(pointResult.bas_workflow);
      if (retained === false && opts.bas_review != null) throw new Error('The loaded drawing set changed; the BAS review was not applied');
    }
  } else if (opts.bas_review != null) throw new Error('BAS evidence could not be captured; prior review history was preserved');
  return { ...compiled, bas_math, ...pointResult };
}
