/** SHOULD THIS BE ON THE SHARED PATH? Yes: component identity, source/scope
 * ownership and responsibility truth. UI and MCP must consume this one service.
 * This validates declarations; Python owns later quantity expansion/math. */
import { z } from 'zod';
import { basSourceContextSchema, type BasSourceContext } from './basSources.ts';
import { validateBasEquipmentRegister, basEquipmentRegisterSchema, type BasEquipmentRegister } from './basEquipmentRegister.ts';
import type { BasEquipmentEvidence } from './basEquipmentEvidence.ts';
import type { BasPointLists } from './basPointLists.ts';
import { BAS_COMPONENT_SOURCE_RULE, BAS_COMPONENT_SOURCE_RULE_V2, basDeclaredComponentRole, interpretBasComponentRequirements } from './basComponentRequirements.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';

const uuid = z.string().uuid(), id = z.string().min(1).max(512);
const label = z.string().trim().min(1).max(512), reason = z.string().trim().min(1).max(4096);
const spanIds = z.array(id).max(10000);
export const BAS_ASSEMBLY_ACTIVITIES = ['furnish', 'install', 'wire', 'program', 'test'] as const;
const activity = z.enum(BAS_ASSEMBLY_ACTIVITIES);
const assignment = z.enum(['factory_furnished', 'field_installed', 'named_party', 'by_others', 'unknown']);
const decisionClaim = z.object({ claim_id: uuid, activity, assignment, party: label.nullable(), source_span_ids: spanIds, reason }).strict()
  .superRefine((claim, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if ((claim.assignment === 'named_party') !== (claim.party !== null)) fail('Only named-party assignments carry a party name');
    if (claim.assignment === 'factory_furnished' && claim.activity !== 'furnish') fail('Factory-furnished establishes furnishing only');
    if (claim.assignment === 'field_installed' && claim.activity !== 'install') fail('Field-installed establishes installation only');
  });
export const basAssemblyComponentSchema = z.object({
  component_id: uuid, scope_id: uuid, equipment_ids: z.array(uuid).min(1).max(100000),
  excluded_equipment_ids: z.array(uuid).max(100000), member_exclusion_reason: reason.nullable(),
  label, component_kind: z.enum(['variable_frequency_drive', 'onboard_controller', 'terminal_equipment_controller',
    'controller', 'sensor', 'valve', 'damper_actuator', 'damper', 'relay', 'power_supply', 'accessory', 'other_physical']),
  source_requirement_ids: z.array(id).max(1000), source_span_ids: spanIds,
  quantity: z.object({ value: z.number().int().nonnegative().safe().nullable(),
    basis: z.enum(['per_equipment', 'selected_group_once']), origin: z.enum(['source_declaration', 'explicit_decision']), reason }).strict(),
  lifecycle: z.enum(['new', 'existing', 'reuse', 'demolition', 'unknown']),
  disposition: z.enum(['included', 'excluded']), exclusion_reason: reason.nullable(),
  condition: z.object({ status: z.enum(['unconditional', 'satisfied', 'not_satisfied', 'unresolved']),
    statement: label.nullable(), source_span_ids: spanIds, reason }).strict(),
  responsibility_claims: z.array(decisionClaim).max(1000),
  responsibility_resolutions: z.array(z.object({ activity, selected_claim_id: id, reason }).strict()).max(5),
  reason,
}).strict().superRefine((component, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if ((component.disposition === 'excluded') !== (component.exclusion_reason !== null)) fail('An excluded component requires its own reason');
  if ((component.excluded_equipment_ids.length > 0) !== (component.member_exclusion_reason !== null)) fail('Member exceptions require their own reason');
  if ((component.condition.status === 'unconditional') !== (component.condition.statement === null)) fail('A conditional component requires its predicate statement');
  if (component.quantity.origin === 'source_declaration' && !component.source_requirement_ids.length) fail('Source-derived quantity requires an interpreted source declaration');
});
export const basAssemblyRegisterSchema = z.object({ schema_version: z.literal('bas_assembly_register_v1'),
  source_rule_version: z.enum([BAS_COMPONENT_SOURCE_RULE, BAS_COMPONENT_SOURCE_RULE_V2]), components: z.array(basAssemblyComponentSchema).max(100000),
}).strict();
export type BasAssemblyRegister = z.infer<typeof basAssemblyRegisterSchema>;
export type BasAssemblyComponent = z.infer<typeof basAssemblyComponentSchema>;
export const emptyBasAssemblyRegister = (): BasAssemblyRegister => ({ schema_version: 'bas_assembly_register_v1',
  source_rule_version: BAS_COMPONENT_SOURCE_RULE, components: [] });

const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const basAssemblyReviewRequestSchema = z.object({ operation_id: uuid, capture_id: sha,
  expected_head: sha.nullable(), expected_equipment_head: sha, reason, register: basAssemblyRegisterSchema }).strict();
export const basAssemblyReviewEventSchema = basAssemblyReviewRequestSchema.extend({ event_id: sha,
  rule_version: z.literal('assembly_review_1'), source_interpretation_fingerprint: sha,
  created_at: z.string().datetime(), origin: z.enum(['operator_input', 'agent_proposal']),
}).strict();
export type BasAssemblyReviewEvent = z.infer<typeof basAssemblyReviewEventSchema>;
export const basAssemblyInterpretationFingerprint = (sources: BasSourceContext, ruleVersion: string) =>
  sha256Hex(new TextEncoder().encode(canonicalBasJson(interpretBasComponentRequirements(sources, ruleVersion))));

type Claim = { claim_id: string; activity: typeof BAS_ASSEMBLY_ACTIVITIES[number];
  assignment: z.infer<typeof assignment>; party: string | null; source_span_ids: string[];
  origin: 'source_declaration' | 'explicit_decision'; reason: string };
type Issue = { code: string; component_id: string; activity?: Claim['activity']; related_component_id?: string };
const unique = (ids: string[], what: string) => {
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate assembly ${what}`);
};

/** Validate against actual retained source/member evidence, not a caller's
 * invented equipment index. Original sources and declarations stay untouched. */
export async function validateBasAssemblyRegister(sources: BasSourceContext, equipment: BasEquipmentEvidence,
  points: BasPointLists, equipmentRegister: BasEquipmentRegister, raw: unknown) {
  const register = basAssemblyRegisterSchema.parse(raw);
  return (await prepareBasAssemblyRegisterValidator(sources, equipment, points, equipmentRegister))(register);
}

/** Per-operation, owned source/equipment context. Only the last interpretation
 * rule is retained, so mixed-version histories cannot grow an unbounded cache.
 * Each record is fully validated; no event or prior result is trusted by ID. */
export async function prepareBasAssemblyRegisterValidator(sources: BasSourceContext, equipment: BasEquipmentEvidence,
  points: BasPointLists, equipmentRegister: BasEquipmentRegister) {
  const context = basSourceContextSchema.parse(sources);
  const ownedEquipment = basEquipmentRegisterSchema.parse(equipmentRegister);
  const registered = await validateBasEquipmentRegister(context, equipment, points, ownedEquipment);
  let interpretation: ReturnType<typeof interpretBasComponentRequirements> | undefined;
  let interpretedRule: string | undefined;
  const allSpans = new Map(context.pages.flatMap(page => page.spans.map(span => [span.span_id, { ...span, page_id: page.page_id }] as const)));
  const members = new Map(registered.register.equipment.map(item => [item.equipment_id, item]));
  const scopes = new Map(registered.register.scopes.map(scope => [scope.scope_id, scope]));
  const ownsSpans = (ids: string[]) => {
    unique(ids, 'source span');
    if (ids.some(id => !allSpans.has(id))) throw new Error('Assembly decision refers to a foreign source span');
  };
  return (raw: unknown) => {
    const register = basAssemblyRegisterSchema.parse(raw);
    if (!interpretation || interpretedRule !== register.source_rule_version) {
      interpretation = interpretBasComponentRequirements(context, register.source_rule_version);
      interpretedRule = register.source_rule_version;
    }
    const requirements = new Map(interpretation.clauses.flatMap(clause => clause.components.map(component => [component.requirement_id, { clause, component }] as const)));
    unique(register.components.map(c => c.component_id), 'component identity');
    const consumed = new Set<string>(), issues: Issue[] = [];
    const components = register.components.map(record => {
      const issue = (code: string, activity?: Claim['activity']) => issues.push({ code, component_id: record.component_id, ...(activity ? { activity } : {}) });
      const scope = scopes.get(record.scope_id);
      if (!scope || record.equipment_ids.some(id => members.get(id)?.scope_id !== scope.scope_id)) throw new Error('Assembly selection must use registered equipment in one existing scope');
      unique(record.equipment_ids, 'selected member'); unique(record.excluded_equipment_ids, 'excluded member');
      if (record.excluded_equipment_ids.some(id => !record.equipment_ids.includes(id))) throw new Error('Assembly exceptions are outside its equipment selection');
      unique(record.source_requirement_ids, 'source requirement'); ownsSpans(record.source_span_ids); ownsSpans(record.condition.source_span_ids);
      const declarations = record.source_requirement_ids.map(id => {
        const found = requirements.get(id);
        if (!found) throw new Error('Assembly source requirement is unavailable or belongs to another rule/source');
        return found;
      });
      if (record.quantity.origin === 'source_declaration') {
        if (declarations.some(d => d.component.component_kind !== record.component_kind || d.component.declared_quantity !== record.quantity.value)) {
          throw new Error('Source-derived component kind or quantity disagrees with its declaration');
        }
        const roles = new Set(declarations.map(d => basDeclaredComponentRole(d.component)));
        if (roles.size > 1) throw new Error('Distinct declared component roles cannot become one source-derived component');
      } else if (declarations.some(d => d.component.component_kind !== record.component_kind || d.component.declared_quantity !== record.quantity.value)
          || new Set(declarations.map(d => basDeclaredComponentRole(d.component))).size > 1) issue('source_declaration_corrected_by_explicit_decision');
      const excluded = new Set(record.excluded_equipment_ids);
      const included_equipment_ids = record.equipment_ids.filter(id => !excluded.has(id));
      if (record.disposition === 'included' && record.condition.status !== 'not_satisfied') {
        for (const sourceId of record.source_requirement_ids) for (const equipmentId of included_equipment_ids) {
          const key = JSON.stringify([sourceId, equipmentId]);
          if (consumed.has(key)) throw new Error('A source requirement is consumed by overlapping assembly components');
          consumed.add(key);
        }
      }
      if (!included_equipment_ids.length) issue('all_assembly_members_excluded');
      if (record.quantity.value === null) issue('component_quantity_unknown');
      if (record.condition.status === 'unresolved') issue('component_condition_unresolved');
      if (record.lifecycle === 'unknown') issue('component_lifecycle_unknown');
      if ([scope.building, scope.level, scope.system, scope.phase].some(v => v === null)) issue('assembly_scope_partly_unknown');
      const claims: Claim[] = declarations.flatMap(({ clause, component }) => component.responsibilities.furnish === 'factory_furnished' ? [{
        claim_id: `${component.requirement_id}:furnish`, activity: 'furnish', assignment: 'factory_furnished', party: null,
        source_span_ids: clause.source_spans.map(s => s.span_id), origin: 'source_declaration', reason: 'Explicit factory-furnished source declaration; no other activity or named party established.',
      }] : []);
      unique(record.responsibility_claims.map(c => c.claim_id), 'responsibility claim');
      for (const claim of record.responsibility_claims) { ownsSpans(claim.source_span_ids); claims.push({ ...claim, origin: 'explicit_decision' }); }
      unique(record.responsibility_resolutions.map(r => r.activity), 'responsibility resolution');
      for (const resolution of record.responsibility_resolutions) {
        if (!claims.some(c => c.claim_id === resolution.selected_claim_id && c.activity === resolution.activity)) throw new Error('Assembly responsibility resolution selects an unowned or wrong-activity claim');
      }
      const responsibilities = BAS_ASSEMBLY_ACTIVITIES.map(activity => {
        const applicable = claims.filter(c => c.activity === activity), known = applicable.filter(c => c.assignment !== 'unknown');
        const resolution = record.responsibility_resolutions.find(r => r.activity === activity) ?? null;
        const alternatives = new Set(known.map(c => JSON.stringify([c.assignment, c.party])));
        const selected = resolution ? applicable.find(c => c.claim_id === resolution.selected_claim_id)! : alternatives.size === 1 ? known[0] : null;
        const status = resolution ? 'explicit_resolution' as const : alternatives.size > 1 ? 'conflict' as const
          : selected ? 'consistent_declarations' as const : 'unknown' as const;
        if (status === 'conflict') issue('responsibility_conflict', activity);
        if (!selected || selected.assignment === 'unknown') issue('responsibility_unknown', activity);
        return { activity, status, claims: applicable, resolution,
          assignment: selected?.assignment ?? 'unknown', party: selected?.party ?? null };
      });
      return { record, included_equipment_ids, declarations, responsibilities,
        source_spans: record.source_span_ids.map(id => allSpans.get(id)!), installed_quantity: null,
        quantity_status: 'requires_shared_python_derivation' as const };
    });
    // Labels are a review signal only. Never deduplicate or add quantities here.
    const reviewed = new Map<string, string>();
    for (const component of components) {
      const record = component.record;
      if (record.disposition === 'excluded' || record.condition.status === 'not_satisfied') continue;
      for (const member of component.included_equipment_ids) {
        const key = JSON.stringify([member, record.component_kind, record.label.toUpperCase().replace(/\s+/g, ' ')]);
        const previous = reviewed.get(key);
        if (previous) issues.push({ code: 'possible_duplicate_component_requires_review', component_id: record.component_id, related_component_id: previous });
        else reviewed.set(key, record.component_id);
      }
    }
    return structuredClone({ schema_version: 'bas_assembly_review_view_v1' as const, register, components, issues, equipment_issues: registered.issues,
      project_complete: false as const, installed_quantity: null,
      interpretation_scope: 'declared_components_and_explicit_decisions_only' as const });
  };
}
