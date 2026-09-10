/** SHOULD THIS BE ON THE SHARED PATH? Yes: one UI/MCP projection of retained
 * checks, provenance and dependencies. No extraction, arithmetic or approval. */
import { verifyBasWorkflow } from './basWorkflow.ts';
import { basEngineeringHeads, assertBasEngineeringInspection } from './basEngineeringReview.ts';
import { basEngineeringRatingBases, validateBasEngineeringRegister } from './basEngineeringRegister.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import { ENGINEERING_LABELS } from './basEngineeringLabels.ts';
import { basExportLeaves, prepareBasWorkbook, assertBasSheetSize, type BasWorkbookSheet, type BasWorkbookCell } from './basWorkbook.ts';

export const BAS_ENGINEERING_EXPORT_VERSION = 'bas_engineering_workbook_1';
export const BAS_ENGINEERING_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** A service receipt is accepted only for precisely this workflow and active
 * capture. Entry points obtain it from inspectBasEngineering (actual Python),
 * never from a caller-supplied boolean or a persisted verification claim. */
export async function basEngineeringWorkbook(rawWorkflow: unknown, inspection?: { workflow: unknown; view: unknown }) {
  const workflow = await verifyBasWorkflow(rawWorkflow);
  if (!(workflow.engineering_events?.length)) throw new Error('No saved engineering reviews to export. Drafts are not exported.');
  if (inspection) {
    if (!workflow.current_capture_id) throw new Error('Engineering replay export requires an active capture');
    await assertBasEngineeringInspection(workflow, await verifyBasWorkflow(inspection.workflow), inspection.view, workflow.current_capture_id);
  }
  const digest = await sha256Hex(new TextEncoder().encode(canonicalBasJson(workflow)));
  const sheets: BasWorkbookSheet[] = [];
  const sheet = (name: string, headers: string[], widths: number[], freezeColumns = 1) => {
    const s: BasWorkbookSheet = { name, rows: [headers], presentation: { widths, freezeColumns, filter: true } };
    sheets.push(s);
    return (...row: BasWorkbookCell[]) => { assertBasSheetSize(name, s.rows.length + 1, row.length); s.rows.push(row); };
  };
  const summary = sheet('Review', ['Engineering saved review', 'Value'], [32, 110], 0);
  summary('Export contract', BAS_ENGINEERING_EXPORT_VERSION);
  summary('Workflow SHA-256', digest);
  summary('Workflow revision', workflow.revision);
  summary('Active capture', workflow.current_capture_id ?? 'None');
  summary('Calculation verification', inspection ? 'All saved engineering results replayed in shared Python at export' : 'Recorded results only. Shared Python replay is required before use.');
  summary('Coverage', 'Selected declared constraints only. A pass is not complete design coverage, approval or engineering certification.');
  summary('Installed quantity', 'Not established by engineering checks');
  summary('Saved engineering reviews', workflow.engineering_events.length);
  summary('Drafts and current edits', 'Not included. Only saved review history is exported.');
  summary('Reimport and source evidence', 'Keep the evidence-and-decisions JSON archive and original PDFs. This workbook is a saved review, not a live calculator or an approved release.');
  summary('Text fidelity', 'Decimals are exact text. Null is Unknown / not provided. Oversized or XML-incompatible text uses [Full text: id]. Concatenate that reference’s ordered JSON text parts, then JSON-parse to recover the exact string.');
  sheets[0].presentation.filter = false;
  const checks = sheet('Checks', ['Review state', 'Check', 'Equipment', 'Saved outcome', 'Scope decision', 'Reason', 'Exclusion reason', 'Applicability source spans', 'Resource IDs', 'Check ID', 'Review ID', 'Capture ID'], [24, 32, 25, 20, 18, 65, 50, 45, 35, 28, 36, 36], 2);
  const constraints = sheet('Constraints', ['Check ID', 'Rule', 'Saved outcome', 'Explanation', 'Input paths', 'Missing inputs', 'Normalized comparisons (exact JSON)', 'Review ID'], [28, 35, 20, 70, 45, 45, 70, 36]);
  const inputs = sheet('Inputs', ['Check ID', 'Original input path', 'Type', 'Original value', 'Review ID'], [28, 52, 16, 80, 36]);
  const calculations = sheet('Network results', ['Check ID', 'Saved result path', 'Type', 'Saved value', 'Review ID'], [28, 52, 16, 80, 36]);
  const resources = sheet('Resources', ['Resource', 'Equipment', 'Scope', 'Component', 'Roles', 'Reason', 'Source spans', 'Resource ID', 'Equipment ID', 'Scope ID', 'Component ID', 'Review ID'], [28, 25, 42, 28, 30, 60, 45, 30, 36, 36, 36, 36]);
  const findings = sheet('Findings', ['Review state', 'Scope finding', 'Code', 'Check ID', 'Resource ID', 'Equipment ID', 'Assignment ID', 'Scope ID', 'Review ID'], [24, 55, 50, 36, 36, 36, 36, 36, 36]);
  const history = sheet('History', ['Review state', 'Saved at (UTC)', 'Origin', 'Reason', 'Review ID', 'Operation ID', 'Capture ID', 'Previous review', 'Equipment decision', 'Assembly decision', 'SOO decision', 'Review rule', 'Math rule', 'Input schema', 'Result schema'], [24, 28, 20, 65, 36, 36, 36, 36, 36, 36, 36, 30, 40, 30, 30]);
  const source = sheet('Source locations', ['Source text', 'Document names', 'PDF page (1-based)', 'Sheet keys', 'Bounding box (image px)', 'Page width (px)', 'Page height (px)', 'Page rotation', 'Span rotation', 'Source index', 'Span ID', 'Page ID', 'PDF SHA-256', 'Capture ID'], [90, 45, 18, 30, 32, 18, 18, 18, 18, 16, 50, 45, 36, 36]);
  const usedSpans = new Map<string, Set<string>>();
  const link = (capture: string, ids: string[]) => { const set = usedSpans.get(capture) ?? new Set<string>(); ids.forEach(id => set.add(id)); usedSpans.set(capture, set); return canonicalBasJson(ids); };
  const headsByCapture = new Map(workflow.captures.map(c => [c.capture_id, basEngineeringHeads(workflow, c.capture_id)]));
  const equipmentByEvent = new Map(workflow.equipment_events?.map(e => [e.event_id, e.register]));
  const assemblyByEvent = new Map(workflow.assembly_events?.map(e => [e.event_id, e.register]));
  // Newest first for reading, without changing any stored ordering or identity.
  for (const event of [...workflow.engineering_events].reverse()) {
    const heads = headsByCapture.get(event.capture_id)!;
    const state = event.event_id !== heads.engineering ? 'Superseded review'
      : event.capture_id !== workflow.current_capture_id ? 'Historical capture'
        : event.expected_equipment_head !== heads.equipment || event.expected_assembly_head !== heads.assembly || event.expected_sequence_head !== heads.sequence
          ? 'Stale dependencies' : 'Current dependencies';
    const equipment = equipmentByEvent.get(event.expected_equipment_head)!;
    const members = new Map(equipment.equipment.map(e => [e.equipment_id, e]));
    const scopes = new Map(equipment.scopes.map(s => [s.scope_id, s]));
    const assembly = event.expected_assembly_head ? assemblyByEvent.get(event.expected_assembly_head) : null;
    // Saved numerical success must not conceal excluded/unresolved source or
    // component applicability. Reuse the same ownership diagnostics as UI/MCP.
    const capture = workflow.captures.find(c => c.capture_id === event.capture_id)!;
    const validation = await validateBasEngineeringRegister(capture, equipment, assembly ?? null, event.register);
    for (const finding of [...validation.issues, ...validation.equipment_issues]) findings(state, finding.code.replace(/_/g, ' '), finding.code,
      'check_id' in finding ? finding.check_id ?? null : null, 'resource_id' in finding ? finding.resource_id ?? null : null,
      'equipment_id' in finding ? finding.equipment_id ?? null : null, 'assignment_id' in finding ? finding.assignment_id ?? null : null,
      'scope_id' in finding ? finding.scope_id ?? null : null, event.event_id);
    const components = new Map(assembly?.components.map(c => [c.component_id, c]));
    const targets = new Map(event.register.targets.map(t => [t.check_id, t]));
    const results = new Map(event.result.checks.map(c => [c.check_id, c]));
    history(state, event.created_at, event.origin, event.reason, event.event_id, event.operation_id, event.capture_id,
      event.expected_head, event.expected_equipment_head, event.expected_assembly_head, event.expected_sequence_head,
      event.rule_version, event.result.rule_version, event.register.input.schema_version, event.result.schema_version);
    for (const check of event.register.input.checks) {
      const target = targets.get(check.check_id)!, result = results.get(check.check_id)!;
      checks(state, ENGINEERING_LABELS[check.kind], check.equipment_ids.map(id => members.get(id)!.tag).join('\n'), result.status,
        target.disposition, check.reason, target.exclusion_reason, link(event.capture_id, target.source_span_ids),
        canonicalBasJson(target.resource_ids), check.check_id, event.event_id, event.capture_id);
      for (const leaf of basExportLeaves(check)) inputs(check.check_id, leaf.path, leaf.type, leaf.value, event.event_id);
      // Target reason is independent of the check reason. Keep both.
      for (const leaf of basExportLeaves(target, 'target')) inputs(check.check_id, leaf.path, leaf.type, leaf.value, event.event_id);
      for (const rating of basEngineeringRatingBases(check)) link(event.capture_id, rating.basis.source_span_ids);
      for (const c of result.constraints) constraints(check.check_id, c.rule_id, c.status, c.message,
        canonicalBasJson(c.input_paths), canonicalBasJson(c.missing_inputs), canonicalBasJson(c.normalized), event.event_id);
      if (result.network_calculation !== null) for (const leaf of basExportLeaves(result.network_calculation))
        calculations(check.check_id, leaf.path, leaf.type, leaf.value, event.event_id);
    }
    for (const r of event.register.resources) {
      const scope = scopes.get(r.scope_id)!;
      resources(r.label, members.get(r.equipment_id)!.tag, canonicalBasJson({ building: scope.building, level: scope.level, system: scope.system, phase: scope.phase }),
        r.component_id ? components.get(r.component_id)!.label : null, r.roles.join('\n'), r.reason, link(event.capture_id, r.source_span_ids),
        r.resource_id, r.equipment_id, r.scope_id, r.component_id, event.event_id);
    }
  }
  for (const capture of workflow.captures) {
    const needed = usedSpans.get(capture.capture_id);
    if (!needed?.size) continue;
    const docs = new Map(capture.sources.map(d => [d.source_id, d]));
    for (const page of capture.narrative_sources!.pages) for (const span of page.spans) {
      if (!needed.has(span.span_id)) continue;
      const doc = docs.get(page.source_id)!;
      source(span.text, canonicalBasJson(doc.names), page.page_number, canonicalBasJson(page.sheet_keys), canonicalBasJson(span.bbox_px),
        page.width_px, page.height_px, page.rotation, span.rotation ?? 'Not provided', span.source_index, span.span_id, page.page_id, doc.sha256, capture.capture_id);
    }
  }
  return { schema_version: BAS_ENGINEERING_EXPORT_VERSION, workflow_sha256: digest,
    sheets: prepareBasWorkbook(sheets.filter(s => !['Network results', 'Findings'].includes(s.name) || s.rows.length > 1)) };
}
