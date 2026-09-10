/** SHOULD THIS BE ON THE SHARED PATH? Yes: source/resource ownership and saved
 * declarations are shared truth. No engineering arithmetic or installed counts. */
import { z } from 'zod';
import { basEngineeringInputSchema, basEngineeringResultSchema, basEngineeringBasisSchema,
  type BasEngineeringCheck, type BasEngineeringBasis } from './basEngineeringContract.ts';
import { validateBasEquipmentRegister, type BasEquipmentRegister } from './basEquipmentRegister.ts';
import { validateBasAssemblyRegister, type BasAssemblyRegister } from './basAssemblyRegister.ts';
import type { BasCapture } from './basWorkflow.ts';

const uuid = z.string().uuid(), id = z.string().min(1).max(512).regex(/\S/);
const reason = z.string().min(1).max(4000).regex(/\S/), sha = z.string().regex(/^[a-f0-9]{64}$/);
const spans = z.array(id).max(200);
export const BAS_ENGINEERING_RESOURCE_ROLES = ['endpoint', 'resistive_load', 'power_supply', 'pool', 'load',
  'mechanical_subject', 'channel', 'terminal', 'expansion_base', 'expansion_module', 'network_port',
  'serial_segment', 'ip_closet', 'ip_domain'] as const;
type Role = typeof BAS_ENGINEERING_RESOURCE_ROLES[number];
export const basEngineeringRegisterSchema = z.object({ schema_version: z.literal('bas_engineering_register_v1'),
  input: basEngineeringInputSchema,
  resources: z.array(z.object({ resource_id: id, equipment_id: uuid, scope_id: uuid, component_id: uuid.nullable(),
    roles: z.array(z.enum(BAS_ENGINEERING_RESOURCE_ROLES)).min(1).max(BAS_ENGINEERING_RESOURCE_ROLES.length),
    label: id, source_span_ids: spans, reason }).strict()).max(20000),
  targets: z.array(z.object({ check_id: id, resource_ids: z.array(id).min(1).max(20000), source_span_ids: spans,
    disposition: z.enum(['included', 'excluded']), exclusion_reason: reason.nullable(), reason }).strict()
    .refine(t => (t.disposition === 'excluded') === (t.exclusion_reason !== null), 'An excluded check requires its own reason')).max(2000),
}).strict();
export type BasEngineeringRegister = z.infer<typeof basEngineeringRegisterSchema>;
export const emptyBasEngineeringRegister = (): BasEngineeringRegister => ({ schema_version: 'bas_engineering_register_v1',
  input: basEngineeringInputSchema.parse({ checks: [] }), resources: [], targets: [] });

export const basEngineeringReviewRequestSchema = z.object({ operation_id: uuid, capture_id: sha, expected_head: sha.nullable(),
  expected_equipment_head: sha, expected_assembly_head: sha.nullable(), expected_sequence_head: sha.nullable(),
  reason, register: basEngineeringRegisterSchema }).strict();
export const basEngineeringReviewEventSchema = basEngineeringReviewRequestSchema.extend({ event_id: sha,
  rule_version: z.literal('engineering_review_1'), origin: z.enum(['operator_input', 'agent_proposal']),
  created_at: z.string().datetime(), result: basEngineeringResultSchema }).strict();
export type BasEngineeringReviewEvent = z.infer<typeof basEngineeringReviewEventSchema>;
export const basEngineeringInspectRequestSchema = z.object({ capture_id: sha }).strict();
export const basEngineeringCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('review'), request: basEngineeringReviewRequestSchema }).strict(),
  z.object({ action: z.literal('inspect'), request: basEngineeringInspectRequestSchema }).strict(),
]);

type Reference = { resource_id: string; role: Role; input_path: string; equipment_id?: string; scope_id?: string };
/** Explicit finite roles/paths, not a heuristic scan for strings ending in _id. */
export function basEngineeringReferences(check: BasEngineeringCheck): Reference[] {
  const refs: Reference[] = [];
  const add = (resource_id: string, role: Role, input_path: string, equipment_id?: string, scope_id?: string) =>
    refs.push({ resource_id, role, input_path, ...(equipment_id ? { equipment_id } : {}), ...(scope_id ? { scope_id } : {}) });
  if ('source' in check) {
    add(check.source.endpoint_id, 'endpoint', 'source.endpoint_id', check.source.equipment_id, check.source.scope_id);
    add(check.sink.endpoint_id, 'endpoint', 'sink.endpoint_id', check.sink.equipment_id, check.sink.scope_id);
  }
  switch (check.kind) {
    case 'signal': case 'analog_range': case 'contact': case 'pulse': case 'mechanical': break;
    case 'resistive_loading': check.parts.forEach((p, i) => add(p.part_id, 'resistive_load', `parts.${i}.part_id`)); break;
    case 'power':
      add(check.supply_id, 'power_supply', 'supply_id'); add(check.pool_id, 'pool', 'pool_id');
      check.loads.forEach((l, i) => add(l.load_id, 'load', `loads.${i}.load_id`, l.equipment_id)); break;
    case 'allocation':
      check.channels.forEach((c, i) => {
        add(c.channel_id, 'channel', `channels.${i}.channel_id`, c.owner_equipment_id);
        add(c.physical_terminal_id, 'terminal', `channels.${i}.physical_terminal_id`, c.owner_equipment_id);
        if (c.pool_id) add(c.pool_id.value, 'pool', `channels.${i}.pool_id.value`);
      });
      check.endpoints.forEach((e, i) => {
        add(e.endpoint.endpoint_id, 'endpoint', `endpoints.${i}.endpoint.endpoint_id`, e.endpoint.equipment_id, e.endpoint.scope_id);
        if (e.channel_id) add(e.channel_id.value, 'channel', `endpoints.${i}.channel_id.value`);
        if (e.required_pool_id) add(e.required_pool_id.value, 'pool', `endpoints.${i}.required_pool_id.value`);
      }); break;
    case 'expansion':
      add(check.base_id, 'expansion_base', 'base_id'); add(check.pool_id, 'pool', 'pool_id');
      check.modules.forEach((m, i) => add(m.module_id, 'expansion_module', `modules.${i}.module_id`, m.equipment_id)); break;
    case 'serial_network': case 'ip_network':
      if (check.kind === 'serial_network') add(check.segment_id, 'serial_segment', 'segment_id');
      else { add(check.closet_id, 'ip_closet', 'closet_id'); add(check.address_domain_id, 'ip_domain', 'address_domain_id'); }
      check.nodes.forEach((n, i) => add(n.endpoint.endpoint_id, 'network_port', `nodes.${i}.endpoint.endpoint_id`, n.endpoint.equipment_id, n.endpoint.scope_id)); break;
    default: { const exhaustive: never = check; throw new Error(`Unknown engineering check: ${exhaustive}`); }
  }
  return refs;
}

export function basEngineeringRatingBases(check: BasEngineeringCheck): Array<{ input_path: string; basis: BasEngineeringBasis }> {
  const result: Array<{ input_path: string; basis: BasEngineeringBasis }> = [];
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && 'basis' in value && 'value' in value) {
      result.push({ input_path: path, basis: basEngineeringBasisSchema.parse(value.basis) }); return;
    }
    Object.entries(value).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
  };
  visit(check, ''); return result;
}

/** Call against a verified capture and its pinned decision heads. This verifies
 * quote/identity ownership, not whether a user interpreted a rating correctly. */
export async function validateBasEngineeringRegister(capture: BasCapture, equipment: BasEquipmentRegister,
  assembly: BasAssemblyRegister | null, raw: unknown) {
  if (!capture.narrative_sources || !capture.equipment_sources) throw new Error('Engineering review requires retained equipment and text sources');
  const equipmentView = await validateBasEquipmentRegister(capture.narrative_sources, capture.equipment_sources, capture.points, equipment);
  const assemblyView = assembly ? await validateBasAssemblyRegister(capture.narrative_sources, capture.equipment_sources, capture.points, equipment, assembly) : null;
  const register = basEngineeringRegisterSchema.parse(raw);
  const members = new Map(equipmentView.register.equipment.map(e => [e.equipment_id, e]));
  const scopes = new Set(equipmentView.register.scopes.map(s => s.scope_id));
  const components = new Map(assemblyView?.components.map(c => [c.record.component_id, c]) ?? []);
  const sourceSpans = new Map(capture.narrative_sources.pages.flatMap(page => page.spans.map(span => [span.span_id, { ...span, page_id: page.page_id }] as const)));
  const unique = (ids: string[], what: string) => { if (new Set(ids).size !== ids.length) throw new Error(`Duplicate engineering ${what}`); };
  const ownsSpans = (ids: string[]) => {
    unique(ids, 'source span');
    return ids.map(id => { const span = sourceSpans.get(id); if (!span) throw new Error('Engineering declaration refers to a foreign source span'); return span; });
  };
  unique(register.resources.map(r => r.resource_id), 'resource identity');
  unique(register.targets.map(t => t.check_id), 'target');
  unique(register.input.checks.map(c => c.check_id), 'check');
  const issues: Array<{ code: string; resource_id?: string; check_id?: string }> = [];
  const resources = new Map(register.resources.map(r => [r.resource_id, r]));
  const targets = new Map(register.targets.map(t => [t.check_id, t]));
  const checks = new Map(register.input.checks.map(c => [c.check_id, c]));
  for (const resource of register.resources) {
    if (members.get(resource.equipment_id)?.scope_id !== resource.scope_id) throw new Error('Engineering resource must belong to registered equipment in its actual scope');
    unique(resource.roles, 'resource role'); ownsSpans(resource.source_span_ids);
    if (resource.component_id !== null) {
      const component = components.get(resource.component_id);
      if (!component || component.record.scope_id !== resource.scope_id || !component.record.equipment_ids.includes(resource.equipment_id))
        throw new Error('Engineering resource refers to an unowned assembly component');
      if (!component.included_equipment_ids.includes(resource.equipment_id) || component.record.disposition === 'excluded')
        issues.push({ code: 'engineering_component_excluded', resource_id: resource.resource_id });
      if (component.record.condition.status === 'unresolved' || component.record.condition.status === 'not_satisfied')
        issues.push({ code: 'engineering_component_condition_not_established', resource_id: resource.resource_id });
      if (component.record.lifecycle === 'unknown') issues.push({ code: 'engineering_component_lifecycle_unknown', resource_id: resource.resource_id });
    }
  }
  if (targets.size !== checks.size || [...targets.keys()].some(id => !checks.has(id))) throw new Error('Every engineering check requires exactly one owned target');
  const rating_sources = [];
  for (const check of register.input.checks) {
    unique(check.equipment_ids, 'check equipment');
    if (check.equipment_ids.some(id => !members.has(id))) throw new Error('Engineering check refers to unregistered equipment');
    const target = targets.get(check.check_id)!;
    unique(target.resource_ids, 'selected resource'); ownsSpans(target.source_span_ids);
    const selectedOwners = new Set<string>();
    for (const id of target.resource_ids) {
      const resource = resources.get(id);
      if (!resource || !check.equipment_ids.includes(resource.equipment_id)) throw new Error('Engineering target includes an unowned resource');
      selectedOwners.add(resource.equipment_id);
    }
    if (check.equipment_ids.some(id => !selectedOwners.has(id))) throw new Error('Engineering equipment selection has no declared target resource');
    if (check.kind === 'mechanical' && !target.resource_ids.some(id => resources.get(id)!.roles.includes('mechanical_subject')))
      throw new Error('Mechanical comparison requires an explicitly owned subject');
    for (const ref of basEngineeringReferences(check)) {
      const resource = resources.get(ref.resource_id);
      if (!resource || !target.resource_ids.includes(ref.resource_id) || !resource.roles.includes(ref.role)
        || (ref.equipment_id !== undefined && resource.equipment_id !== ref.equipment_id)
        || (ref.scope_id !== undefined && resource.scope_id !== ref.scope_id)) throw new Error(`Engineering resource ownership mismatch at ${ref.input_path}`);
    }
    const allowedScopes = check.kind === 'allocation' ? check.channels.map(c => c.allowed_scope_ids)
      : check.kind === 'serial_network' || check.kind === 'ip_network' ? [check.allowed_scope_ids] : [];
    if (allowedScopes.some(s => s?.value.some(id => !scopes.has(id)))) throw new Error('Engineering allocation names an unregistered scope');
    for (const rating of basEngineeringRatingBases(check)) {
      const owned = ownsSpans(rating.basis.source_span_ids);
      if (owned.length && rating.basis.original_text !== null && rating.basis.original_text !== owned.map(s => s.text).join('\n'))
        throw new Error('Engineering original wording differs from its retained source spans');
      rating_sources.push({ check_id: check.check_id, ...rating, source_spans: owned });
    }
    if (target.disposition === 'excluded') issues.push({ code: 'engineering_check_explicitly_excluded', check_id: check.check_id });
  }
  const selected = new Set(register.targets.flatMap(t => t.resource_ids));
  for (const resource of register.resources) if (!selected.has(resource.resource_id)) issues.push({ code: 'engineering_resource_not_used', resource_id: resource.resource_id });
  return { register, rating_sources, issues, equipment_issues: equipmentView.issues,
    project_complete: false as const, installed_quantity: null, validation_scope: 'source_and_resource_ownership_not_engineering_math' as const };
}
