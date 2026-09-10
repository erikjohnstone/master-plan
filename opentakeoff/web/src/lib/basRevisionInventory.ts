/** Shared, source-owned inventory for pinned revision sides. It retains raw
 * evidence and declared/calculated quantities, but computes no delta or approval. */
import { z } from 'zod';
import { basCaptureIdentityPayload, verifyBasWorkflow, type BasWorkflow } from './basWorkflow.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import { basDrawingCapturePages } from './basDrawingRevision.ts';
import { BAS_REVISION_INVENTORY_RULE, basRevisionBasisSchema, basRevisionHeadsSchema, selectBasRevisionState } from './basRevisionBasis.ts';
import { buildBasEquipmentCandidates } from './basEquipmentEvidence.ts';
import { interpretBasSequences } from './basSequenceReconciliation.ts';
import { basActiveAssociations } from './basReview.ts';
import { BAS_COMPONENT_SOURCE_RULE, interpretBasComponentRequirements } from './basComponentRequirements.ts';
import { basEngineeringRatingBases } from './basEngineeringRegister.ts';
import { validateBasAssemblyRegister } from './basAssemblyRegister.ts';

export const BAS_REVISION_ITEM_LIMIT = 100000;
export const BAS_REVISION_INVENTORY_BYTES = 64 * 1024 * 1024;
/** Operational bounds only, not BAS quantity arithmetic. No truncation. */
export function assertBasRevisionInventorySize(itemCount: number, encodedBytes: number) {
  if (![itemCount, encodedBytes].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid revision inventory size');
  if (itemCount > BAS_REVISION_ITEM_LIMIT) throw new Error('Revision inventory exceeds the 100,000-item limit');
  if (encodedBytes > BAS_REVISION_INVENTORY_BYTES) throw new Error('Revision inventory exceeds the 64 MiB encoded limit');
}
const sha = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1).max(4096);
const text = z.string().max(BAS_REVISION_INVENTORY_BYTES);
const box = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine(b => b[2] >= b[0] && b[3] >= b[1], 'Unordered revision source box');
export const BAS_REVISION_ITEM_KINDS = ['drawing_page', 'point_matrix', 'point_row', 'sequence_region', 'sequence_clause',
  'sequence_requirement', 'sequence_link', 'equipment_table', 'equipment_row', 'scope', 'equipment', 'assignment',
  'component_requirement', 'assembly_component', 'responsibility_claim', 'responsibility_resolution',
  'engineering_resource', 'engineering_check', 'assigned_observation', 'assembly_quantity'] as const;
const kind = z.enum(BAS_REVISION_ITEM_KINDS);
const source = z.object({ page_id: id, span_id: id.nullable(), text, bbox_px: box.nullable() }).strict();
const reference = z.object({ relation: id, kind, subject_id: id, source_event_id: sha.nullable() }).strict();
const quantity = z.object({ metric: id, dimension: id, basis: id, value: z.number().int().nonnegative().safe().nullable(),
  status: z.enum(['retained_value', 'unknown', 'not_a_quantity', 'saved_result_requires_python_replay']), value_path: id }).strict();
export const basRevisionItemSchema = z.object({ item_id: sha, capture_id: sha, kind, subject_id: id, label: text,
  source_event_id: sha.nullable(), calculation_id: sha.nullable(), rule_version: id, interpretation_rules: z.array(id).max(20),
  origin: z.enum(['retained_pdf_evidence', 'retained_point_interpretation', 'source_rule', 'operator_input', 'agent_proposal', 'saved_python_result']),
  source_refs: z.array(source).max(200000), references: z.array(reference).max(100000),
  source_scope: z.enum(['inside', 'crosses_boundary', 'outside', 'unlocated']),
  dependency_status: z.enum(['not_applicable', 'pinned_dependencies_match', 'pinned_dependencies_differ']),
  original_json: text, content_fingerprint: sha, quantities: z.array(quantity).max(100000),
}).strict();
export type BasRevisionItem = z.infer<typeof basRevisionItemSchema>;
const dependency = z.enum(['not_selected', 'pinned_dependencies_match', 'pinned_dependencies_differ']);
export const basRevisionInventorySchema = z.object({ schema_version: z.literal('bas_revision_inventory_v1'),
  rule_version: z.literal(BAS_REVISION_INVENTORY_RULE), basis: basRevisionBasisSchema,
  capabilities: z.array(z.object({ capture_id: sha, heads: basRevisionHeadsSchema,
    selection_status: z.enum(['current_selection', 'historical_selection']),
    dependency_status: z.object({ assembly: dependency, engineering: dependency, assigned: dependency, assembled: dependency }).strict(),
    text: z.enum(['retained', 'unavailable_legacy_capture']), points: z.literal('retained_discovered_matrices_only'),
    equipment: z.enum(['retained_discovered_tables_only', 'unavailable_legacy_capture']), component_rule: id.nullable(),
    narrative_discovery_complete: z.literal(false), narrative_interpretation_complete: z.literal(false),
  }).strict()).max(10000), items: z.array(basRevisionItemSchema).max(BAS_REVISION_ITEM_LIMIT),
  unresolved_references: z.array(z.object({ item_id: sha, reference,
    reason: z.enum(['not_in_selected_inventory', 'different_selected_event']) }).strict()),
  source_bytes: z.literal('not_verified'), calculation_verification: z.literal('saved_results_not_python_replayed'),
  semantic_comparison: z.literal('not_performed'), quantity_comparison: z.literal('not_performed'), approved: z.literal(false),
}).strict();
export type BasRevisionInventory = z.infer<typeof basRevisionInventorySchema>;
type Source = z.infer<typeof source>;
type Reference = z.infer<typeof reference>;
type Quantity = z.infer<typeof quantity>;
const digest = (v: unknown) => sha256Hex(new TextEncoder().encode(canonicalBasJson(v)));
const uniqueSources = (refs: Source[]) => [...new Map(refs.map(s => [canonicalBasJson(s), s])).values()];
const link = (relation: string, kind: BasRevisionItem['kind'], subject_id: string, source_event_id: string | null = null): Reference =>
  ({ relation, kind, subject_id, source_event_id });
const retained = (metric: string, dimension: string, basis: string, value: number | null, value_path: string): Quantity =>
  ({ metric, dimension, basis, value, value_path, status: value === null ? 'unknown' : 'retained_value' });

/** Derive from verified retained records, never from client-supplied item arrays.
 * Abort/error yields no partial inventory or workflow mutation. */
export async function buildBasRevisionInventory(raw: unknown, rawBasis: unknown, signal?: AbortSignal) {
  const basis = basRevisionBasisSchema.parse(rawBasis); signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(raw); signal?.throwIfAborted();
  return inventoryForVerifiedBasRevision(workflow, basis, signal);
}

/** Shared implementation for a caller-owned, already verified workflow. Two
 * comparison sides reuse this exact path; no unvalidated public request may
 * bypass buildBasRevisionInventory/verifyBasWorkflow through this internal seam. */
export async function inventoryForVerifiedBasRevision(workflow: BasWorkflow, rawBasis: unknown, signal?: AbortSignal) {
  const basis = basRevisionBasisSchema.parse(rawBasis); signal?.throwIfAborted();
  const selected = selectBasRevisionState(workflow, basis);
  const pending: Array<{ item: Omit<BasRevisionItem, 'item_id' | 'content_fingerprint'>; identity: unknown }> = [];
  const capabilities = [];
  let encodedBytes = 0;
  for (const state of selected.states) {
    signal?.throwIfAborted();
    const { capture, heads } = state, canonical = basCaptureIdentityPayload(capture);
    const pages = new Map(capture.narrative_sources?.pages.map(p => [p.page_id, p]) ?? []);
    const aliases = new Map(capture.narrative_sources?.pages.flatMap(p => p.sheet_keys.map(k => [k, p.page_id] as const)) ?? []);
    const spans = new Map(capture.narrative_sources?.pages.flatMap(p => p.spans.map(s => [s.span_id,
      { page_id: p.page_id, span_id: s.span_id, text: s.text, bbox_px: s.bbox_px }] as const)) ?? []);
    const selectedPages = new Set(selected.source_set.pages.filter(p => p.capture_id === capture.capture_id).map(p => p.page_id));
    const fromSpans = (ids: string[]): Source[] => ids.map(id => {
      const s = spans.get(id); if (!s) throw new Error('Revision inventory references a foreign source span'); return s;
    });
    const fromCell = (page_id: string | null, c: { text: string; bbox: number[] | null } | null | undefined): Source[] =>
      page_id && c ? [{ page_id, span_id: null, text: c.text, bbox_px: c.bbox as Source['bbox_px'] }] : [];
    const ownPages = new Set(basDrawingCapturePages(capture).map(p => p.page_id));
    type Metadata = Partial<Pick<BasRevisionItem, 'origin' | 'source_event_id' | 'calculation_id' | 'dependency_status' | 'interpretation_rules'>>;
    const add = (k: BasRevisionItem['kind'], subject_id: string, label: string, original: unknown, refs: Source[] = [],
      references: Reference[] = [], quantities: Quantity[] = [], meta: Metadata = {}, identity: unknown = original) => {
      assertBasRevisionInventorySize(pending.length + 1, encodedBytes);
      const source_refs = uniqueSources(refs);
      if (source_refs.some(s => !ownPages.has(s.page_id))) throw new Error('Revision inventory source is not owned by its capture');
      const inside = source_refs.filter(s => selectedPages.has(s.page_id)).length;
      const source_scope: BasRevisionItem['source_scope'] = !source_refs.length ? 'unlocated' : !inside ? 'outside' : inside === source_refs.length ? 'inside' : 'crosses_boundary';
      const item = { capture_id: capture.capture_id, kind: k, subject_id, label, source_event_id: null, calculation_id: null,
        rule_version: BAS_REVISION_INVENTORY_RULE, interpretation_rules: [], origin: 'retained_pdf_evidence' as const, dependency_status: 'not_applicable' as const,
        ...meta, source_refs, references, source_scope, original_json: canonicalBasJson(original), quantities };
      const encoded = new TextEncoder().encode(canonicalBasJson(item)).byteLength;
      encodedBytes += encoded;
      assertBasRevisionInventorySize(pending.length + 1, encodedBytes);
      pending.push({ item, identity });
    };
    const pointRows = new Map<string, Source[]>(), matrixRefs = new Map<string, Source[]>();
    for (const [i, m] of capture.points.matrices.entries()) {
      const refs = fromCell(m.page_id, m.raw.title ?? { text: 'Point matrix', bbox: m.raw.region }); matrixRefs.set(m.matrix_id, refs);
      add('point_matrix', m.matrix_id, m.raw.title?.text || 'Untitled point matrix', m, refs, [], [],
        { origin: 'retained_point_interpretation', interpretation_rules: [capture.points.rule_version] }, canonical.points.matrices[i]);
      for (const [ri, row] of m.rows.entries()) {
        const evidence = Object.values(row.raw.cells).flatMap(c => fromCell(m.page_id, c)); pointRows.set(row.row_id, evidence);
        const qs = row.observations.map((o, oi) => ({ ...retained(`observation:${oi}`, `${o.kind}:${o.channel}`, m.quantity_basis, o.value, `observations.${oi}.value`),
          ...(o.kind === 'attribute' ? { status: 'not_a_quantity' as const } : {}) }));
        add('point_row', row.row_id, row.name || row.local_key, row, evidence, [link('matrix', 'point_matrix', m.matrix_id)], qs,
          { origin: 'retained_point_interpretation', interpretation_rules: [capture.points.rule_version] }, canonical.points.matrices[i].rows[ri]);
      }
    }
    const regions = capture.narrative_sources ? interpretBasSequences(capture.narrative_sources) : null;
    const sequenceMeta = { origin: 'source_rule' as const, interpretation_rules: regions ? [regions.rule_version] : [] };
    const regionRefs = new Map<string, Source[]>();
    for (const ref of basDrawingCapturePages(capture)) {
      const p = pages.get(ref.page_id);
      const rawPage = p ?? { page_id: ref.page_id, text_status: 'unavailable_legacy_capture' };
      const { sheet_keys: _aliases, ...canonicalPage } = p ?? { sheet_keys: [], ...rawPage };
      add('drawing_page', ref.page_id, `Original PDF page ${ref.page_id.split(':p').at(-1)}`, rawPage,
        [{ page_id: ref.page_id, span_id: null, bbox_px: null, text: p?.text_status ?? 'unavailable_legacy_capture' }], [], [], {}, canonicalPage);
    }
    for (const region of regions?.regions ?? []) {
      const refs = fromSpans(region.raw.heading.span_ids); regionRefs.set(region.region_id, refs);
      add('sequence_region', region.region_id, region.title, region.raw, refs, [], [], sequenceMeta);
      for (const clause of region.clauses) {
        const evidence = fromSpans(clause.source_spans.map(s => s.span_id));
        add('sequence_clause', clause.clause_id, clause.reading_text || 'Structured narrative block', clause, evidence,
          [link('region', 'sequence_region', region.region_id)], [], sequenceMeta);
        for (const requirement of clause.requirements) add('sequence_requirement', requirement.requirement_id, requirement.variable,
          requirement, evidence, [link('clause', 'sequence_clause', clause.clause_id)], [], sequenceMeta);
      }
    }
    const sourceRule = state.assembly?.register.source_rule_version ?? BAS_COMPONENT_SOURCE_RULE;
    const declared = capture.narrative_sources ? interpretBasComponentRequirements(capture.narrative_sources, sourceRule) : null;
    for (const clause of declared?.clauses ?? []) for (const component of clause.components) {
      const refs = fromSpans(clause.source_spans.map(s => s.span_id));
      add('component_requirement', component.requirement_id, `${component.subject_label} · ${component.component_kind}`, component, refs,
        [link('clause', 'sequence_clause', clause.clause_id)],
        [retained('declared_quantity', `declared_component:${component.component_kind}`, component.quantity_basis, component.declared_quantity, 'declared_quantity')],
        { origin: 'source_rule', interpretation_rules: [sourceRule] });
    }
    const associations = basActiveAssociations({ ...workflow, review_events: state.sequenceHistory }, capture.capture_id);
    for (const a of associations) {
      const owner = state.sequenceHistory.filter(e => e.action.kind === 'upsert'
        && e.action.association.region_id === a.region_id && e.action.association.matrix_id === a.matrix_id).at(-1)!;
      add('sequence_link', canonicalBasJson([a.region_id, a.matrix_id]), 'Reviewed sequence / point-list link', a,
      [...(regionRefs.get(a.region_id) ?? []), ...(matrixRefs.get(a.matrix_id) ?? []), ...fromSpans(a.equipment_references.flatMap(e => e.span_ids))],
      [link('region', 'sequence_region', a.region_id), link('matrix', 'point_matrix', a.matrix_id)], [],
      { source_event_id: owner.event_id, origin: owner.origin, interpretation_rules: [owner.rule_version] });
    }
    const candidates = capture.equipment_sources && capture.narrative_sources
      ? await buildBasEquipmentCandidates(capture.narrative_sources, capture.equipment_sources) : null;
    const occurrenceRefs = new Map<string, Source[]>();
    for (const [ti, table] of (candidates?.tables ?? []).entries()) {
      const refs = fromCell(aliases.get(table.raw.sheet) ?? null, table.raw.title ?? { text: 'Equipment schedule', bbox: table.raw.region });
      add('equipment_table', table.table_id, table.raw.title?.text || 'Untitled equipment schedule', table.raw, refs, [], [], {}, canonical.equipment_sources!.tables[ti]);
      for (const row of table.rows) {
        const original = table.raw.rows[row.row_index], refs = Object.values(original.cells).flatMap(c => fromCell(row.page_id, c));
        occurrenceRefs.set(row.occurrence_id, refs);
        const quantities = [retained('printed_quantity', 'printed_schedule_count', 'printed_schedule_row', row.printed_quantity?.value ?? null, 'interpreted.printed_quantity.value'),
          retained('named_members', 'named_scheduled_members', 'literal_row_membership', row.named_member_count, 'interpreted.named_member_count')];
        add('equipment_row', row.occurrence_id, row.membership?.raw || original.key, { raw: original, interpreted: row }, refs,
          [link('table', 'equipment_table', table.table_id)], quantities, {}, { raw: canonical.equipment_sources!.tables[ti].rows[row.row_index], interpreted: row });
      }
    }
    // Resolve every dependency against the event it actually named. A newer
    // register may reuse an equipment UUID with different source bindings.
    const equipmentEvents = new Map(workflow.equipment_events?.filter(e => e.capture_id === capture.capture_id).map(e => [e.event_id, e]));
    const assemblyEvents = new Map(workflow.assembly_events?.filter(e => e.capture_id === capture.capture_id).map(e => [e.event_id, e]));
    const equipmentAt = (head: string | null) => head ? equipmentEvents.get(head) : undefined;
    const assemblyAt = (head: string | null) => head ? assemblyEvents.get(head) : undefined;
    const memberRefsAt = (head: string | null, ids: string[]) => ids.flatMap(id => {
      const member = equipmentAt(head)?.register.equipment.find(e => e.equipment_id === id);
      if (!member) throw new Error('Revision dependency member is not owned by its pinned equipment event');
      return member.bindings.flatMap(b => occurrenceRefs.get(b.occurrence_id) ?? []);
    });
    const componentEvidence = new Map<string, Source[]>();
    const declarationsByRule = new Map(declared ? [[sourceRule, declared]] : []);
    const componentRefsAt = (head: string | null, id: string): Source[] => {
      const key = canonicalBasJson([head, id]), cached = componentEvidence.get(key);
      if (cached) return cached;
      const event = assemblyAt(head), c = event?.register.components.find(c => c.component_id === id);
      if (!event || !c) throw new Error('Revision dependency component is not owned by its pinned assembly event');
      const rule = event.register.source_rule_version;
      const declarations = declarationsByRule.get(rule) ?? interpretBasComponentRequirements(capture.narrative_sources!, rule);
      declarationsByRule.set(rule, declarations);
      const wanted = new Set(c.source_requirement_ids);
      const refs = [...memberRefsAt(event.expected_equipment_head, c.equipment_ids),
        ...fromSpans([...c.source_span_ids, ...c.condition.source_span_ids]),
        ...declarations.clauses.filter(cl => cl.components.some(r => wanted.has(r.requirement_id)))
          .flatMap(cl => fromSpans(cl.source_spans.map(s => s.span_id)))];
      componentEvidence.set(key, refs); return refs;
    };
    const register = state.equipment?.register;
    const decisionMeta = { source_event_id: state.equipment?.event_id ?? null, origin: state.equipment?.origin ?? 'operator_input' as const,
      interpretation_rules: state.equipment ? [state.equipment.rule_version] : [] };
    for (const scope of register?.scopes ?? []) add('scope', scope.scope_id, [scope.building, scope.level, scope.system, scope.phase].filter(Boolean).join(' / ') || 'Partly unknown scope',
      scope, fromSpans(scope.source_span_ids), [], [], decisionMeta);
    for (const e of register?.equipment ?? []) {
      const refs = memberRefsAt(heads.equipment_head, [e.equipment_id]);
      add('equipment', e.equipment_id, e.tag, e, refs, [link('scope', 'scope', e.scope_id, heads.equipment_head), ...e.bindings.map(b => link('binding', 'equipment_row', b.occurrence_id))], [], decisionMeta);
    }
    const memberRefs = (ids: string[]) => memberRefsAt(heads.equipment_head, ids);
    for (const a of register?.assignments ?? []) add('assignment', a.assignment_id, `Point-list assignment · ${a.applicability}`, a,
      [...memberRefs(a.equipment_ids), ...(matrixRefs.get(a.matrix_id) ?? []), ...fromSpans(a.source_span_ids), ...a.sequence_region_ids.flatMap(id => regionRefs.get(id) ?? [])],
      [link('matrix', 'point_matrix', a.matrix_id), ...a.equipment_ids.map(id => link('equipment', 'equipment', id, heads.equipment_head)),
        ...a.sequence_region_ids.map(id => link('sequence', 'sequence_region', id))], [], decisionMeta);
    const assemblyView = state.assembly ? await validateBasAssemblyRegister(capture.narrative_sources!, capture.equipment_sources!, capture.points,
      equipmentAt(state.assembly.expected_equipment_head)!.register, state.assembly.register) : null;
    for (const c of state.assembly?.register.components ?? []) {
      const refs = componentRefsAt(heads.assembly_head, c.component_id), equipmentHead = state.assembly!.expected_equipment_head;
      const meta = { source_event_id: state.assembly!.event_id, origin: state.assembly!.origin,
        interpretation_rules: [state.assembly!.rule_version, state.assembly!.register.source_rule_version],
        dependency_status: state.dependency_status.assembly === 'pinned_dependencies_differ' ? 'pinned_dependencies_differ' as const : 'pinned_dependencies_match' as const };
      add('assembly_component', c.component_id, c.label, c, refs, [link('scope', 'scope', c.scope_id, equipmentHead),
        ...c.equipment_ids.map(id => link('equipment', 'equipment', id, equipmentHead)), ...c.source_requirement_ids.map(id => link('declaration', 'component_requirement', id))],
        [retained('declared_quantity', `declared_component:${c.component_kind}`, c.quantity.basis, c.quantity.value, 'quantity.value')], meta);
      // Use the existing source/decision adjudicator, not a second rule copy.
      // Claim IDs are component-local; one declaration can apply to disjoint groups.
      for (const claim of assemblyView!.components.find(v => v.record.component_id === c.component_id)!.responsibilities.flatMap(r => r.claims)) {
        add('responsibility_claim', canonicalBasJson([c.component_id, claim.claim_id]), `${c.label} · ${claim.activity}`, claim,
          [...refs, ...fromSpans(claim.source_span_ids)], [link('component', 'assembly_component', c.component_id, heads.assembly_head)], [],
          { ...meta, origin: claim.origin === 'source_declaration' ? 'source_rule' : meta.origin });
      }
      for (const resolution of c.responsibility_resolutions) add('responsibility_resolution', `${c.component_id}:${resolution.activity}`, `${c.label} · ${resolution.activity} resolution`,
        resolution, refs, [link('component', 'assembly_component', c.component_id, heads.assembly_head),
          link('selected_claim', 'responsibility_claim', canonicalBasJson([c.component_id, resolution.selected_claim_id]), heads.assembly_head)], [], meta);
    }
    const resourceRefs = new Map<string, Source[]>();
    const engineeringMeta = { source_event_id: state.engineering?.event_id ?? null, origin: state.engineering?.origin ?? 'operator_input' as const,
      interpretation_rules: state.engineering ? [state.engineering.rule_version] : [],
      dependency_status: state.dependency_status.engineering === 'pinned_dependencies_differ' ? 'pinned_dependencies_differ' as const : 'pinned_dependencies_match' as const };
    for (const r of state.engineering?.register.resources ?? []) {
      const e = state.engineering!;
      const refs = [...memberRefsAt(e.expected_equipment_head, [r.equipment_id]), ...fromSpans(r.source_span_ids),
        ...(r.component_id ? componentRefsAt(e.expected_assembly_head, r.component_id) : [])]; resourceRefs.set(r.resource_id, refs);
      add('engineering_resource', r.resource_id, r.label, r, refs, [link('equipment', 'equipment', r.equipment_id, e.expected_equipment_head), link('scope', 'scope', r.scope_id, e.expected_equipment_head),
        ...(r.component_id ? [link('component', 'assembly_component', r.component_id, e.expected_assembly_head)] : [])], [], engineeringMeta);
    }
    for (const check of state.engineering?.register.input.checks ?? []) {
      const target = state.engineering!.register.targets.find(t => t.check_id === check.check_id)!;
      const ratings = basEngineeringRatingBases(check).flatMap(r => fromSpans(r.basis.source_span_ids));
      add('engineering_check', check.check_id, check.kind, { check, target,
        saved_result: state.engineering!.result.checks.find(c => c.check_id === check.check_id) },
        [...memberRefsAt(state.engineering!.expected_equipment_head, check.equipment_ids), ...target.resource_ids.flatMap(id => resourceRefs.get(id) ?? []), ...fromSpans(target.source_span_ids), ...ratings],
        target.resource_ids.map(id => link('resource', 'engineering_resource', id, heads.engineering_head)), [], engineeringMeta);
    }
    for (const a of state.assigned?.result.assignments ?? []) for (const row of a.rows) for (const observation of row.observations) {
      const q = retained('assigned_value', `${observation.original.kind}:${observation.original.channel}`, a.subtotal_basis, observation.assigned_value, 'observation.assigned_value');
      q.status = observation.status === 'attribute_not_quantity' ? 'not_a_quantity' : observation.assigned_value === null ? 'unknown' : 'saved_result_requires_python_replay';
      add('assigned_observation', observation.observation_id, row.name, { observation, assignment: a.assignment,
        included_equipment_ids: a.included_equipment_ids, replication_factor: a.replication_factor, qualifiers: row.qualifiers },
        [...(pointRows.get(row.row_id) ?? []), ...memberRefsAt(state.assigned!.result.equipment_head, a.assignment.equipment_ids)],
        [link('assignment', 'assignment', a.assignment.assignment_id, state.assigned!.result.equipment_head), link('source_row', 'point_row', row.row_id)], [q],
        { origin: 'saved_python_result', calculation_id: state.assigned!.calculation_id,
          interpretation_rules: [state.assigned!.result.rule_version, state.assigned!.result.point_rule_version, state.assigned!.result.engine],
          dependency_status: state.dependency_status.assigned === 'pinned_dependencies_differ' ? 'pinned_dependencies_differ' : 'pinned_dependencies_match' });
    }
    for (const c of state.assembled?.result.components ?? []) {
      const q = retained('assigned_quantity', `declared_component:${c.original.component_kind}`, state.assembled!.result.quantity_basis, c.assigned_quantity, 'assigned_quantity');
      if (q.value !== null) q.status = 'saved_result_requires_python_replay';
      add('assembly_quantity', c.original.component_id, c.original.label, c,
        componentRefsAt(state.assembled!.result.assembly_head, c.original.component_id),
        [link('component', 'assembly_component', c.original.component_id, state.assembled!.result.assembly_head)], [q],
        { origin: 'saved_python_result', calculation_id: state.assembled!.calculation_id,
          interpretation_rules: [state.assembled!.result.rule_version, state.assembled!.result.source_rule_version, state.assembled!.result.engine],
          dependency_status: state.dependency_status.assembled === 'pinned_dependencies_differ' ? 'pinned_dependencies_differ' : 'pinned_dependencies_match' });
    }
    capabilities.push({ capture_id: capture.capture_id, heads, selection_status: state.selection_status, dependency_status: state.dependency_status,
      text: capture.narrative_sources ? 'retained' : 'unavailable_legacy_capture', points: 'retained_discovered_matrices_only',
      equipment: capture.equipment_sources ? 'retained_discovered_tables_only' : 'unavailable_legacy_capture', component_rule: declared?.rule_version ?? null,
      narrative_discovery_complete: false, narrative_interpretation_complete: false });
  }
  const items: BasRevisionItem[] = [], keys = new Set<string>();
  for (const { item, identity } of pending) {
    signal?.throwIfAborted();
    const item_id = await digest([item.capture_id, item.kind, item.subject_id]);
    if (keys.has(item_id)) throw new Error('Duplicate revision item identity'); keys.add(item_id);
    // Whole-register event heads are deliberately excluded: an unrelated edit
    // must not change the identity/content of an unaffected item.
    const content_fingerprint = await digest({ rule: item.rule_version, interpretation_rules: item.interpretation_rules, original: identity,
      source_refs: item.source_refs, references: item.references.map(({ source_event_id: _head, ...r }) => r), quantities: item.quantities });
    items.push(basRevisionItemSchema.parse({ ...item, item_id, content_fingerprint }));
  }
  const lookup = new Map(items.map(i => [canonicalBasJson([i.capture_id, i.kind, i.subject_id]), i]));
  const unresolved_references: BasRevisionInventory['unresolved_references'] = [];
  for (const i of items) for (const reference of i.references) {
    const target = lookup.get(canonicalBasJson([i.capture_id, reference.kind, reference.subject_id]));
    if (!target || reference.source_event_id !== target.source_event_id) unresolved_references.push({ item_id: i.item_id, reference,
      reason: !target ? 'not_in_selected_inventory' : 'different_selected_event' });
  }
  const result = { schema_version: 'bas_revision_inventory_v1' as const, rule_version: BAS_REVISION_INVENTORY_RULE,
    basis: selected.basis, capabilities, items, unresolved_references,
    source_bytes: 'not_verified' as const, calculation_verification: 'saved_results_not_python_replayed' as const,
    semantic_comparison: 'not_performed' as const, quantity_comparison: 'not_performed' as const, approved: false as const };
  signal?.throwIfAborted();
  assertBasRevisionInventorySize(items.length, new TextEncoder().encode(canonicalBasJson(result)).byteLength);
  return basRevisionInventorySchema.parse(result);
}
