/** Shared source interpretation, never a UI/MCP-specific component counter.
 * Explicit requirement candidates still need equipment applicability/identity.
 */
import { z } from 'zod';
import { basSourceContextSchema, type BasSourceContext } from './basSources.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { interpretBasSequences } from './basSequenceReconciliation.ts';

export const BAS_COMPONENT_SOURCE_RULE = 'explicit_component_declarations_1' as const;
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
export const basComponentRequirementsSchema = z.object({
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
export type BasComponentRequirements = z.infer<typeof basComponentRequirementsSchema>;

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
function interpretBasComponentRequirementsV1(rawSources: BasSourceContext): BasComponentRequirements {
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
  return basComponentRequirementsSchema.parse({ schema_version: 'bas_component_requirements_v1', rule_version: BAS_COMPONENT_SOURCE_RULE,
    scope: 'discovered_narrative_component_requirements_only', discovery_complete: false, interpretation_complete: false,
    project_complete: false, installed_quantity: null, clauses });
}

export function interpretBasComponentRequirements(sources: BasSourceContext,
  ruleVersion: string = BAS_COMPONENT_SOURCE_RULE): BasComponentRequirements {
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
