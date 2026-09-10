/** Shared source interpretation, never a UI/MCP-specific component counter.
 * Explicit requirement candidates still need equipment applicability/identity.
 */
import { z } from 'zod';
import { basSourceContextSchema, type BasSourceContext } from './basSources.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { interpretBasSequences } from './basSequenceReconciliation.ts';

export const BAS_COMPONENT_SOURCE_RULE = 'explicit_component_declarations_1' as const;
export const BAS_COMPONENT_SOURCE_RULE_V2 = 'explicit_component_declarations_2' as const;
type FanRole = 'SUPPLY' | 'RETURN' | 'EXHAUST' | 'RELIEF';
const id = z.string().min(1).max(512);
const text = z.string().max(1000000);
const unknownActivities = { install: z.null(), wire: z.null(), program: z.null(), test: z.null() };
const componentBase = {
  requirement_id: id, subject_label: z.string().min(1).max(64), declared_quantity: z.literal(1),
  quantity_basis: z.literal('per_declared_subject_after_applicability_review'),
  scope_status: z.literal('requires_equipment_applicability_review'),
  installed_quantity: z.null(), field_wiring_status: z.literal('not_established'),
};
const componentSchema = z.discriminatedUnion('component_kind', [
  z.object({ ...componentBase, component_kind: z.literal('variable_frequency_drive'),
    fan_role: z.enum(['SUPPLY', 'RETURN', 'EXHAUST', 'RELIEF']), protocol_requirement: z.null(),
    responsibilities: z.object({ furnish: z.null(), ...unknownActivities }).strict(),
  }).strict(),
  z.object({ ...componentBase, component_kind: z.literal('onboard_controller'),
    fan_role: z.null(), protocol_requirement: z.literal('BACnet'),
    responsibilities: z.object({ furnish: z.literal('factory_furnished'), ...unknownActivities }).strict(),
  }).strict(),
]);
type Component = z.infer<typeof componentSchema>;
const sourceSpan = basSourceContextSchema.innerType().shape.pages.element.shape.spans.element;
const componentRequirementsV1Schema = z.object({
  schema_version: z.literal('bas_component_requirements_v1'), rule_version: z.literal(BAS_COMPONENT_SOURCE_RULE),
  scope: z.literal('discovered_narrative_component_requirements_only'), discovery_complete: z.literal(false),
  interpretation_complete: z.literal(false), project_complete: z.literal(false), installed_quantity: z.null(),
  clauses: z.array(z.object({ region_id: id, page_id: id, clause_id: id, reading_text: text.nullable(),
    source_spans: z.array(sourceSpan).max(200000),
    status: z.enum(['explicit_component_requirements', 'partially_interpreted', 'uninterpreted']),
    issues: z.array(z.literal('DUPLICATE_FAN_ROLE_REQUIRES_REVIEW')).max(1),
    components: z.array(componentSchema).max(2), uninterpreted_text: text.nullable(),
  }).strict()).max(250000),
}).strict();
const listComponentBase = { ...componentBase, fan_role: z.null(),
  responsibilities: z.object({ furnish: z.null(), ...unknownActivities }).strict() };
const listComponentSchema = z.discriminatedUnion('component_kind', [
  z.object({ ...listComponentBase, component_kind: z.literal('terminal_equipment_controller'),
    component_role: z.literal('terminal_equipment_control'), protocol_requirement: z.literal('BACnet compatible') }).strict(),
  z.object({ ...listComponentBase, component_kind: z.literal('sensor'),
    component_role: z.enum(['dual_technology_occupancy', 'downstream_static_pressure']), protocol_requirement: z.null() }).strict(),
  z.object({ ...listComponentBase, component_kind: z.literal('damper'),
    component_role: z.literal('primary_modulating_supply_air'), protocol_requirement: z.null() }).strict(),
]);
type ListComponent = z.infer<typeof listComponentSchema>;
const componentRequirementsV2Schema = componentRequirementsV1Schema.extend({
  schema_version: z.literal('bas_component_requirements_v2'), rule_version: z.literal(BAS_COMPONENT_SOURCE_RULE_V2),
  clauses: z.array(componentRequirementsV1Schema.shape.clauses.element.extend({
    issues: z.array(z.enum(['DUPLICATE_FAN_ROLE_REQUIRES_REVIEW', 'DUPLICATE_COMPONENT_ROLE_REQUIRES_REVIEW'])).max(1),
    components: z.array(z.union([componentSchema, listComponentSchema])).max(32),
  }).strict()).max(250000),
}).strict();
export const basComponentRequirementsSchema = z.discriminatedUnion('rule_version', [componentRequirementsV1Schema, componentRequirementsV2Schema]);
export type BasComponentRequirements = z.infer<typeof basComponentRequirementsSchema>;

/** Same physical kind does not establish same device function. Retain v1 fan
 * identity exactly while distinguishing the source-declared v2 sensor roles. */
export function basDeclaredComponentRole(component: BasComponentRequirements['clauses'][number]['components'][number]) {
  return JSON.stringify([component.component_kind, 'component_role' in component ? component.component_role : component.fan_role]);
}

const unsafeSubject = /\b(?:NOT|NO|UNLESS|EXCEPT|ONLY|IF|WHEN|UNTIL|AND|OR|EACH)\b/i;
function paragraphBody(text: string | null, marker: string | null) {
  if (text === null || text.length > 4096) return null;
  let input = text.replace(/\s+/g, ' ').trim();
  if (marker && input.startsWith(`${marker} `)) input = input.slice(marker.length).trimStart();
  return input;
}

function fanDrivePair(text: string | null, marker: string | null) {
  const input = paragraphBody(text, marker);
  if (input === null) return null;
  const match = /^THE ([A-Z][A-Z0-9 -]{0,63}) SHALL BE PROVIDED WITH (?:A|ONE|1) VFD FOR THE (SUPPLY|RETURN|EXHAUST|RELIEF) FAN,? AND (?:A|ONE|1) VFD FOR THE (SUPPLY|RETURN|EXHAUST|RELIEF) FAN\.$/i.exec(input);
  if (!match || unsafeSubject.test(match[1])) return null;
  const roles = [match[2].toUpperCase(), match[3].toUpperCase()] as [FanRole, FanRole];
  return { subject: match[1], roles, duplicate: roles[0] === roles[1] };
}

function factoryController(text: string | null, marker: string | null) {
  const input = paragraphBody(text, marker);
  if (input === null) return null;
  // The only accepted compound tail is an instruction to use a manufacturer
  // sequence. It remains uninterpreted; it does not assign programming/testing.
  const match = /^(?:([A-Z][A-Z0-9 -]{0,63} CONTROL:)\s+)?THE ([A-Z][A-Z0-9 -]{0,63}) SHALL BE PROVIDED WITH (?:A|ONE|1) FACTORY[ -]FURNISHED ON[ -]?BOARD BACNET CONTROLLER(?:\.|\.?\s+(THE MANUFACTURER SHALL USE ITS PREFERRED SEQUENCE TO MEET THE FOLLOWING REQUIREMENTS:))$/i.exec(input);
  if (!match || unsafeSubject.test(match[2]) || (match[1] && unsafeSubject.test(match[1]))) return null;
  return { subject: match[2], uninterpreted: [match[1], match[3]].filter(Boolean).join(' ') };
}

function requirementBase(clauseId: string, role: string, subject: string) {
  return { requirement_id: `${clauseId}:${role}`, subject_label: subject, declared_quantity: 1 as const,
    quantity_basis: 'per_declared_subject_after_applicability_review' as const,
    scope_status: 'requires_equipment_applicability_review' as const,
    installed_quantity: null, field_wiring_status: 'not_established' as const };
}

/** Rebuild paragraphs from verified source, not caller-supplied interpretations.
 * No channel, hardware rating, contractor or equipment multiplier is inferred. */
// Persisted v1 implementation: future grammars get a new version/dispatch,
// never a silent reinterpretation of accepted assembly evidence.
function interpretBasComponentRequirementsV1(rawSources: BasSourceContext): z.infer<typeof componentRequirementsV1Schema> {
  const sources = basSourceContextSchema.parse(rawSources);
  const sequences = interpretBasSequences(sources);
  if (sequences.rule_version !== 'explicit_monitor_modulate_1' || sequences.discovery.rule_version !== 'horizontal_headed_regions_v1') {
    throw new Error('Component rule v1 requires its original narrative dependencies');
  }
  const clauses = sequences.regions.flatMap(region => region.clauses.map(clause => {
    const block = region.raw.blocks.find(b => b.block_id === clause.clause_id)!;
    const interpretable = region.raw.status === 'body_detected' && block.kind === 'paragraph';
    const pair = interpretable ? fanDrivePair(clause.reading_text, block.marker) : null;
    const controller = interpretable ? factoryController(clause.reading_text, block.marker) : null;
    const components: Component[] = pair && !pair.duplicate ? pair.roles.map(role => ({
      ...requirementBase(clause.clause_id, `vfd:${role.toLowerCase()}`, pair.subject),
      component_kind: 'variable_frequency_drive', fan_role: role, protocol_requirement: null,
      responsibilities: { furnish: null, install: null, wire: null, program: null, test: null },
    })) : controller ? [{
      ...requirementBase(clause.clause_id, 'onboard-controller', controller.subject),
      component_kind: 'onboard_controller', fan_role: null, protocol_requirement: 'BACnet',
      responsibilities: { furnish: 'factory_furnished', install: null, wire: null, program: null, test: null },
    }] : [];
    const remaining = components.length ? controller?.uninterpreted ?? '' : clause.reading_text;
    return { region_id: region.region_id, page_id: region.page_id, clause_id: clause.clause_id,
      reading_text: clause.reading_text, source_spans: structuredClone(clause.source_spans),
      status: !components.length ? 'uninterpreted' : remaining ? 'partially_interpreted' : 'explicit_component_requirements',
      issues: pair?.duplicate ? ['DUPLICATE_FAN_ROLE_REQUIRES_REVIEW'] : [],
      components, uninterpreted_text: remaining,
    };
  }));
  return componentRequirementsV1Schema.parse({ schema_version: 'bas_component_requirements_v1', rule_version: BAS_COMPONENT_SOURCE_RULE,
    scope: 'discovered_narrative_component_requirements_only', discovery_complete: false, interpretation_complete: false,
    project_complete: false, installed_quantity: null, clauses });
}

/** Complete quantified noun lists, never an implicit/default controls kit.
 * The paragraph boundary and source ownership come from shared discovery.
 * An unrecognized item or qualifier rejects the entire list, not just its tail. */
function explicitComponentList(text: string | null, marker: string | null, clauseId: string) {
  const input = paragraphBody(text, marker);
  if (input === null) return null;
  const match = /^EACH ([A-Z][A-Z0-9 -]{0,63}) (?:WILL|SHALL) BE PROVIDED WITH (.+)\.$/i.exec(input);
  if (!match || unsafeSubject.test(match[1])) return null;
  const items = match[2].split(/,\s*(?:AND\s+)?|\s+AND\s+/i);
  if (!items.length || items.length > 32) return null;
  const components: ListComponent[] = [];
  for (const item of items) {
    const quantified = /^(?:A|AN|ONE|1) (.+)$/i.exec(item.trim());
    if (!quantified) return null;
    const noun = quantified[1];
    const common = { subject_label: match[1], declared_quantity: 1 as const,
      quantity_basis: 'per_declared_subject_after_applicability_review' as const,
      scope_status: 'requires_equipment_applicability_review' as const,
      installed_quantity: null, field_wiring_status: 'not_established' as const, fan_role: null,
      responsibilities: { furnish: null, install: null, wire: null, program: null, test: null } };
    if (/^BACNET[ -]COMPATIBLE TERMINAL EQUIPMENT CONTROLLER(?: \(TEC\))?$/i.test(noun)) {
      components.push({ ...common, requirement_id: `${clauseId}:terminal-equipment-controller`,
        component_kind: 'terminal_equipment_controller', component_role: 'terminal_equipment_control', protocol_requirement: 'BACnet compatible' });
    } else if (/^DUAL[ -]TECHNOLOGY OCCUPANCY SENSOR$/i.test(noun)) {
      components.push({ ...common, requirement_id: `${clauseId}:dual-technology-occupancy-sensor`,
        component_kind: 'sensor', component_role: 'dual_technology_occupancy', protocol_requirement: null });
    } else if (/^DOWNSTREAM STATIC[ -]PRESSURE SENSOR$/i.test(noun)) {
      components.push({ ...common, requirement_id: `${clauseId}:downstream-static-pressure-sensor`,
        component_kind: 'sensor', component_role: 'downstream_static_pressure', protocol_requirement: null });
    } else if (/^PRIMARY MODULATING SUPPLY[ -]AIR DAMPER$/i.test(noun)) {
      components.push({ ...common, requirement_id: `${clauseId}:primary-modulating-supply-air-damper`,
        component_kind: 'damper', component_role: 'primary_modulating_supply_air', protocol_requirement: null });
    } else return null;
  }
  return { components, duplicate: new Set(components.map(c => c.component_role)).size !== components.length };
}

function interpretBasComponentRequirementsV2(sources: BasSourceContext): z.infer<typeof componentRequirementsV2Schema> {
  const original = interpretBasComponentRequirementsV1(sources);
  const sequences = interpretBasSequences(sources);
  const blocks = new Map(sequences.regions.flatMap(region => region.raw.blocks.map(block => [block.block_id, { region, block }] as const)));
  const clauses = original.clauses.map(clause => {
    if (clause.components.length) return clause;
    const found = blocks.get(clause.clause_id);
    if (found?.region.raw.status !== 'body_detected' || found.block.kind !== 'paragraph') return clause;
    const list = explicitComponentList(clause.reading_text, found.block.marker, clause.clause_id);
    if (!list) return clause;
    if (list.duplicate) return { ...clause, issues: ['DUPLICATE_COMPONENT_ROLE_REQUIRES_REVIEW'] };
    return { ...clause, status: 'explicit_component_requirements', components: list.components, uninterpreted_text: '' };
  });
  return componentRequirementsV2Schema.parse({ ...original, schema_version: 'bas_component_requirements_v2', rule_version: BAS_COMPONENT_SOURCE_RULE_V2, clauses });
}

export function interpretBasComponentRequirements(sources: BasSourceContext,
  ruleVersion?: typeof BAS_COMPONENT_SOURCE_RULE): z.infer<typeof componentRequirementsV1Schema>;
export function interpretBasComponentRequirements(sources: BasSourceContext,
  ruleVersion: typeof BAS_COMPONENT_SOURCE_RULE_V2): z.infer<typeof componentRequirementsV2Schema>;
export function interpretBasComponentRequirements(sources: BasSourceContext, ruleVersion: string): BasComponentRequirements;
export function interpretBasComponentRequirements(sources: BasSourceContext,
  ruleVersion: string = BAS_COMPONENT_SOURCE_RULE): BasComponentRequirements {
  if (ruleVersion === BAS_COMPONENT_SOURCE_RULE_V2) return interpretBasComponentRequirementsV2(sources);
  if (ruleVersion !== 'explicit_component_declarations_1') throw new Error('Unsupported component interpretation rule');
  return interpretBasComponentRequirementsV1(sources);
}

/** A valid output shape is not proof of source truth. Imported/persisted results
 * must still agree with shared deterministic interpretation of retained spans. */
export function verifyBasComponentRequirements(sources: BasSourceContext, rawResult: unknown): BasComponentRequirements {
  const result = basComponentRequirementsSchema.parse(rawResult);
  if (canonicalBasJson(result) !== canonicalBasJson(interpretBasComponentRequirements(sources, result.rule_version))) {
    throw new Error('Component requirements disagree with the retained source evidence');
  }
  return result;
}
