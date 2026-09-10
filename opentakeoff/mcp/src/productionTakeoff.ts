/** Shared production orchestration for BOTH MCP and the UI's existing CLI. */
import { compileTakeoff } from "../../web/src/lib/compileTakeoff.mjs";
import { compileSequencesTakeoff } from "../../web/src/lib/sequenceExtract.ts";
import type { SheetGraph } from "../../web/src/lib/sheetgraph.ts";
import { runBasMath, runBasPointLists } from "./basMath.ts";
import { captureBasEvidence, mergeBasWorkflows } from "../../web/src/lib/basWorkflow.ts";
import { applyBasReview } from "../../web/src/lib/basReview.ts";
import { captureBasEquipmentTables } from "../../web/src/lib/basEquipmentEvidence.ts";
import { applyBasEquipmentReview, basEquipmentSummary } from "../../web/src/lib/basEquipmentReview.ts";
import { calculateBasAssignments } from './basAssignmentDemand.ts';
import { applyBasAssemblyReview, basAssemblySummary } from '../../web/src/lib/basAssemblyReview.ts';
import { calculateBasAssemblies } from './basAssemblyQuantities.ts';
import { applyBasEngineeringReview, inspectBasEngineering } from './basEngineeringReview.ts';
import { basEngineeringView, basEngineeringSummarySchema } from '../../web/src/lib/basEngineeringReview.ts';
import { basEngineeringInspectRequestSchema } from '../../web/src/lib/basEngineeringRegister.ts';

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
      let equipment, equipmentError;
      try { equipment = captureBasEquipmentTables(graph.tables); }
      catch (error) { equipmentError = error instanceof Error ? error.message : 'Equipment source capture unavailable'; }
      // An equipment extension failure must not disable the already-working
      // point/SOO capture. Its own write option will refuse before committing.
      const workflow = await captureBasEvidence(sources, points, equipment);
      return { bas_point_lists: points, bas_workflow: workflow,
        ...(equipmentError ? { bas_equipment_error: equipmentError } : {}) };
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
  opts: { service?: string; bas_math?: unknown; bas_review?: unknown; bas_equipment_review?: unknown; bas_assignment_demand?: unknown;
    bas_assembly_review?: unknown; bas_assembly_quantities?: unknown; bas_engineering_review?: unknown; bas_engineering_inspect?: unknown } = {}) {
  const hasAssemblyWrite = opts.bas_assembly_review != null || opts.bas_assembly_quantities != null;
  const hasEngineering = opts.bas_engineering_review != null || opts.bas_engineering_inspect != null;
  const hasReview = opts.bas_review != null || opts.bas_equipment_review != null || opts.bas_assignment_demand != null || hasAssemblyWrite || opts.bas_engineering_review != null;
  if ((hasReview || hasEngineering) && kind !== 'bas_points' && kind !== 'T-BAS-01') throw new Error('BAS review is only available for the BAS points workflow');
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
  let equipmentSummary;
  let assignmentCalculation;
  let assemblySummary, assemblyCalculation, assemblyError;
  let engineeringView, engineeringError;
  if (pointResult && 'bas_workflow' in pointResult && pointResult.bas_workflow) {
    const previous = session && typeof session === 'object' && 'basWorkflow' in session ? session.basWorkflow : null;
    const merged = mergeBasWorkflows(previous, pointResult.bas_workflow, true)!;
    // A read/recompile returns the retained history too, not only the fresh
    // extraction capture. Source evidence and decisions stay separate.
    pointResult.bas_workflow = merged;
    if (opts.bas_review != null) {
      pointResult.bas_workflow = await applyBasReview(merged, opts.bas_review, 'agent_proposal');
    }
    if (opts.bas_equipment_review != null) {
      pointResult.bas_workflow = await applyBasEquipmentReview(pointResult.bas_workflow, opts.bas_equipment_review, 'agent_proposal');
    }
    if (opts.bas_assignment_demand != null) {
      const calculated = await calculateBasAssignments(pointResult.bas_workflow, opts.bas_assignment_demand);
      pointResult.bas_workflow = calculated.workflow;
      assignmentCalculation = calculated.calculation;
    }
    if (opts.bas_assembly_review != null) pointResult.bas_workflow = await applyBasAssemblyReview(pointResult.bas_workflow, opts.bas_assembly_review, 'agent_proposal');
    if (opts.bas_assembly_quantities != null) {
      const calculated = await calculateBasAssemblies(pointResult.bas_workflow, opts.bas_assembly_quantities);
      pointResult.bas_workflow = calculated.workflow; assemblyCalculation = calculated.calculation;
    }
    if (opts.bas_engineering_review != null) {
      const reviewed = await applyBasEngineeringReview(pointResult.bas_workflow, opts.bas_engineering_review, 'agent_proposal');
      pointResult.bas_workflow = reviewed.workflow;
    }
    if (hasEngineering) {
      const captureId = opts.bas_engineering_inspect != null ? basEngineeringInspectRequestSchema.parse(opts.bas_engineering_inspect).capture_id
        : pointResult.bas_workflow.current_capture_id!;
      engineeringView = (await inspectBasEngineering(pointResult.bas_workflow, captureId)).view;
    } else if (pointResult.bas_workflow.engineering_events?.length) {
      try { engineeringView = await basEngineeringView(pointResult.bas_workflow, pointResult.bas_workflow.current_capture_id!); }
      catch (error) { engineeringError = error instanceof Error ? error.message : 'Engineering review unavailable'; }
    }
    if (pointResult.bas_workflow.captures.find(c => c.capture_id === pointResult.bas_workflow.current_capture_id)?.equipment_sources) {
      equipmentSummary = await basEquipmentSummary(pointResult.bas_workflow, pointResult.bas_workflow.current_capture_id!);
      try { assemblySummary = await basAssemblySummary(pointResult.bas_workflow, pointResult.bas_workflow.current_capture_id!); }
      catch (error) {
        if (hasAssemblyWrite) throw error;
        assemblyError = error instanceof Error ? error.message : 'Assembly source review unavailable';
      }
    }
    // Commit only after any requested review validates. Invalid requests leave
    // the prior Session review/capture state untouched.
    if ((hasReview || hasEngineering) && session && typeof session === 'object' && 'basWorkflow' in session && session.basWorkflow !== previous) {
      throw new Error('The BAS workspace changed during this operation; no stale decision or calculation was saved');
    }
    if (session && typeof session === 'object' && 'retainBasWorkflow' in session && typeof session.retainBasWorkflow === 'function') {
      const retained = session.retainBasWorkflow(pointResult.bas_workflow);
      if (retained === false && (hasReview || hasEngineering)) throw new Error('The loaded drawing set changed; the BAS review was not applied');
    }
  } else if (hasReview || hasEngineering) throw new Error('BAS evidence could not be captured; prior review history was preserved');
  return { ...compiled, bas_math, ...pointResult, ...(equipmentSummary ? { bas_equipment: equipmentSummary } : {}),
    ...(assignmentCalculation ? { bas_assignment_demand: assignmentCalculation } : {}),
    ...(assemblySummary ? { bas_assemblies: assemblySummary } : {}), ...(assemblyError ? { bas_assembly_error: assemblyError } : {}),
    ...(assemblyCalculation ? { bas_assembly_quantities: assemblyCalculation } : {}),
    ...(engineeringView ? { bas_engineering: basEngineeringSummarySchema.parse(engineeringView) } : {}), ...(engineeringError ? { bas_engineering_error: engineeringError } : {}) };
}
