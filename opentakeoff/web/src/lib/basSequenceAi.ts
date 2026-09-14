/** SHOULD THIS BE ON THE SHARED PATH? Yes.
 *
 * Model-assisted SOO interpretation is takeoff truth-adjacent: the browser and
 * MCP must validate the same claims against the same retained source clauses.
 * This module owns the model wire schema, prompt batches, exact-evidence gate,
 * and Brick/Haystack projection. It does not call a vendor API, approve work,
 * assign installed quantity, or mutate the deterministic sequence extractor.
 */
import { z } from 'zod';
import { canonicalBasJson } from './basCanonical.ts';
import type { BasSourceContext, BasSourceSpan } from './basSources.ts';
import { sha256Hex } from './graphKeys.js';
import { BAS_SEQUENCE_RULE, interpretBasSequences } from './basSequenceReconciliation.ts';

export const BAS_SEQUENCE_AI_PROMPT_VERSION = 'bas_soo_cerebras_brick_haystack_2' as const;

export const BAS_SEQUENCE_BEHAVIOR_KINDS = [
  'enable_condition', 'disable_condition', 'command', 'monitor', 'alarm',
  'safety', 'interlock', 'setpoint', 'lead_lag', 'override', 'communication', 'other',
] as const;
export const BAS_SEQUENCE_ENTITY_KINDS = [
  'equipment', 'air_handling_unit', 'variable_air_volume_box', 'fan_coil_unit',
  'boiler', 'chiller', 'pump', 'fan', 'valve', 'damper', 'heating_coil',
  'cooling_coil', 'temperature_sensor', 'pressure_sensor', 'flow_sensor',
  'occupancy_sensor', 'freeze_stat', 'smoke_detector', 'controller', 'hmi',
  'point', 'space', 'system', 'unknown',
] as const;
export const BAS_SEQUENCE_RELATION_KINDS = [
  'controls', 'is_controlled_by', 'has_point', 'has_part', 'feeds', 'hosts',
  'located_in', 'none',
] as const;
export const BAS_SEQUENCE_POINT_FUNCTIONS = [
  'sensor', 'status', 'command', 'setpoint', 'alarm', 'parameter', 'unknown',
] as const;

const evidenceSchema = z.object({
  clause_id: z.string().min(1).max(512),
  text: z.string().trim().min(1).max(4096),
}).strict();
const nullableValueSchema = z.object({
  operator: z.enum(['lt', 'lte', 'eq', 'gte', 'gt', 'range']),
  value: z.number().finite().nullable(),
  value_high: z.number().finite().nullable(),
  unit: z.string().trim().min(1).max(64).nullable(),
  adjustable: z.boolean(),
}).strict().nullable();
const modelBehaviorSchema = z.object({
  kind: z.enum(BAS_SEQUENCE_BEHAVIOR_KINDS),
  subject: z.string().trim().min(1).max(512),
  subject_kind: z.enum(BAS_SEQUENCE_ENTITY_KINDS),
  action: z.string().trim().min(1).max(512),
  object: z.string().trim().min(1).max(512).nullable(),
  object_kind: z.enum(BAS_SEQUENCE_ENTITY_KINDS).nullable(),
  relation: z.enum(BAS_SEQUENCE_RELATION_KINDS),
  condition: z.string().trim().min(1).max(2048).nullable(),
  threshold: nullableValueSchema,
  delay: nullableValueSchema,
  evidence: z.array(evidenceSchema).min(1).max(16),
}).strict();
const modelPointSchema = z.object({
  name: z.string().trim().min(1).max(512),
  function: z.enum(BAS_SEQUENCE_POINT_FUNCTIONS),
  io_type: z.enum(['AI', 'AO', 'BI', 'BO']).nullable(),
  basis: z.enum(['explicit_requirement', 'inferred_requirement']),
  evidence: z.array(evidenceSchema).min(1).max(16),
}).strict();
const modelClauseSchema = z.object({
  clause_id: z.string().min(1).max(512),
  summary: z.string().trim().min(1).max(2048),
  behaviors: z.array(modelBehaviorSchema).max(64),
  candidate_points: z.array(modelPointSchema).max(64),
}).strict();
export const basSequenceAiModelResponseSchema = z.object({
  clauses: z.array(modelClauseSchema).max(64),
}).strict();

const entityProjection = {
  equipment: { brick_class: 'Equipment', haystack_tags: ['equip'] },
  air_handling_unit: { brick_class: 'Air_Handling_Unit', haystack_tags: ['ahu', 'equip'] },
  variable_air_volume_box: { brick_class: 'Variable_Air_Volume_Box', haystack_tags: ['vav', 'equip'] },
  fan_coil_unit: { brick_class: 'Fan_Coil_Unit', haystack_tags: ['fcu', 'equip'] },
  boiler: { brick_class: 'Boiler', haystack_tags: ['boiler', 'equip'] },
  chiller: { brick_class: 'Chiller', haystack_tags: ['chiller', 'equip'] },
  pump: { brick_class: 'Pump', haystack_tags: ['pump', 'equip'] },
  fan: { brick_class: 'Fan', haystack_tags: ['fan', 'equip'] },
  valve: { brick_class: 'Valve', haystack_tags: ['valve', 'equip'] },
  damper: { brick_class: 'Damper', haystack_tags: ['damper', 'equip'] },
  heating_coil: { brick_class: 'Heating_Coil', haystack_tags: ['heating', 'coil', 'equip'] },
  cooling_coil: { brick_class: 'Cooling_Coil', haystack_tags: ['cooling', 'coil', 'equip'] },
  temperature_sensor: { brick_class: 'Temperature_Sensor', haystack_tags: ['temp', 'sensor', 'point'] },
  pressure_sensor: { brick_class: 'Pressure_Sensor', haystack_tags: ['pressure', 'sensor', 'point'] },
  flow_sensor: { brick_class: 'Flow_Sensor', haystack_tags: ['flow', 'sensor', 'point'] },
  occupancy_sensor: { brick_class: 'Occupancy_Sensor', haystack_tags: ['occupancy', 'sensor', 'point'] },
  freeze_stat: { brick_class: 'Low_Temperature_Alarm', haystack_tags: ['freezeStat', 'sensor', 'point'] },
  smoke_detector: { brick_class: 'Smoke_Detector', haystack_tags: ['smoke', 'sensor', 'point'] },
  controller: { brick_class: 'Controller', haystack_tags: ['device'] },
  hmi: { brick_class: 'User_Interface', haystack_tags: ['device'] },
  point: { brick_class: 'Point', haystack_tags: ['point'] },
  space: { brick_class: 'Space', haystack_tags: ['space'] },
  system: { brick_class: 'System', haystack_tags: ['equip'] },
  unknown: { brick_class: null, haystack_tags: [] },
} as const;

const relationProjection = {
  controls: 'controls', is_controlled_by: 'isControlledBy', has_point: 'hasPoint',
  has_part: 'hasPart', feeds: 'feeds', hosts: 'hosts', located_in: 'hasLocation', none: null,
} as const;

const pointProjection = {
  sensor: { brick_class: 'Sensor', haystack_tags: ['sensor', 'point'] },
  status: { brick_class: 'Status', haystack_tags: ['status', 'point'] },
  command: { brick_class: 'Command', haystack_tags: ['cmd', 'point'] },
  setpoint: { brick_class: 'Setpoint', haystack_tags: ['sp', 'point'] },
  alarm: { brick_class: 'Alarm', haystack_tags: ['alarm', 'point'] },
  parameter: { brick_class: 'Parameter', haystack_tags: ['point'] },
  unknown: { brick_class: 'Point', haystack_tags: ['point'] },
} as const;

/** Cerebras strict-output schema. Every object is closed for v2 compatibility;
 * model-chosen ontology fields are enums and are projected to canonical names
 * by code rather than allowing plausible-but-nonexistent ontology terms. */
export const BAS_SEQUENCE_AI_RESPONSE_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    clauses: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        clause_id: { type: 'string' }, summary: { type: 'string' },
        behaviors: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: [...BAS_SEQUENCE_BEHAVIOR_KINDS] },
            subject: { type: 'string' }, subject_kind: { type: 'string', enum: [...BAS_SEQUENCE_ENTITY_KINDS] },
            action: { type: 'string' }, object: { type: ['string', 'null'] },
            object_kind: { anyOf: [{ type: 'string', enum: [...BAS_SEQUENCE_ENTITY_KINDS] }, { type: 'null' }] },
            relation: { type: 'string', enum: [...BAS_SEQUENCE_RELATION_KINDS] },
            condition: { type: ['string', 'null'] },
            threshold: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false,
              properties: { operator: { type: 'string', enum: ['lt', 'lte', 'eq', 'gte', 'gt', 'range'] },
                value: { type: ['number', 'null'] }, value_high: { type: ['number', 'null'] },
                unit: { type: ['string', 'null'] }, adjustable: { type: 'boolean' } },
              required: ['operator', 'value', 'value_high', 'unit', 'adjustable'] }] },
            delay: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false,
              properties: { operator: { type: 'string', enum: ['lt', 'lte', 'eq', 'gte', 'gt', 'range'] },
                value: { type: ['number', 'null'] }, value_high: { type: ['number', 'null'] },
                unit: { type: ['string', 'null'] }, adjustable: { type: 'boolean' } },
              required: ['operator', 'value', 'value_high', 'unit', 'adjustable'] }] },
            evidence: { type: 'array', items: { type: 'object', additionalProperties: false,
              properties: { clause_id: { type: 'string' }, text: { type: 'string' } }, required: ['clause_id', 'text'] } },
          },
          required: ['kind', 'subject', 'subject_kind', 'action', 'object', 'object_kind', 'relation', 'condition', 'threshold', 'delay', 'evidence'],
        } },
        candidate_points: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          properties: {
            name: { type: 'string' }, function: { type: 'string', enum: [...BAS_SEQUENCE_POINT_FUNCTIONS] },
            io_type: { anyOf: [{ type: 'string', enum: ['AI', 'AO', 'BI', 'BO'] }, { type: 'null' }] },
            basis: { type: 'string', enum: ['explicit_requirement', 'inferred_requirement'] },
            evidence: { type: 'array', items: { type: 'object', additionalProperties: false,
              properties: { clause_id: { type: 'string' }, text: { type: 'string' } }, required: ['clause_id', 'text'] } },
          }, required: ['name', 'function', 'io_type', 'basis', 'evidence'],
        } },
      }, required: ['clause_id', 'summary', 'behaviors', 'candidate_points'],
    } },
  }, required: ['clauses'],
} as const;

export const BAS_SEQUENCE_AI_SYSTEM_PROMPT = [
  'You are a senior BAS controls engineer extracting review candidates from source-bounded drawing clauses.',
  'Interpret every supplied clause exactly once. Use only literal facts from that clause and its listed ancestor clauses.',
  'Evidence may cite the current clause or an ancestor_clauses entry; never cite a child, sibling, or another region.',
  'Every evidence.text must be an exact contiguous substring of the cited clause text. Do not paraphrase evidence.',
  'The subject, object, action, and condition words must all appear in their cited evidence. Never assign a specific tag or device identity that the evidence does not name.',
  'Use threshold or delay only for a literal numeric requirement. Its number, unit, comparison direction, and adjustable flag must be printed in the cited evidence; otherwise return null.',
  'Capture operating conditions, thresholds, adjustable values, delays, modes, commands, alarms, safeties, interlocks, lead/lag, overrides, setpoints, and communication requirements.',
  'Use only the supplied entity and relationship enums. They correspond to a constrained Brick/Haystack projection; do not invent ontology terms.',
  'A candidate point is a scope-review proposal, never an installed quantity or controller-channel allocation.',
  'For explicit_requirement candidate points, every meaningful word in name must appear in the cited evidence. Otherwise use inferred_requirement.',
  'Set io_type only when the cited evidence literally prints AI, AO, BI, BO, analog input/output, or binary/digital input/output. Otherwise io_type must be null.',
  'Use basis explicit_requirement only when the source explicitly requires that point/function; use inferred_requirement for an engineering implication.',
  'Do not use model confidence as approval. All returned items require estimator review.',
].join(' ');

type DeterministicClause = {
  clause_id: string; region_id: string; region_title: string; page_id: string;
  marker: string | null; indent_px: number; text: string; parent_clause_id: string | null;
  ancestor_clause_ids: string[]; source_spans: BasSourceSpan[];
};

function sequenceClauses(sources: BasSourceContext): DeterministicClause[] {
  const view = interpretBasSequences(sources, BAS_SEQUENCE_RULE);
  const out: DeterministicClause[] = [];
  for (const region of view.regions) {
    if (region.raw.status !== 'body_detected') continue;
    const stack: Array<{ clause_id: string; indent_px: number }> = [];
    for (let index = 0; index < region.clauses.length; index++) {
      const clause = region.clauses[index];
      const block = region.raw.blocks[index];
      if (clause.reading_text === null || block?.kind !== 'paragraph') continue;
      while (stack.length && stack.at(-1)!.indent_px >= block.indent_px) stack.pop();
      const ancestors = stack.map(entry => entry.clause_id);
      out.push({
        clause_id: clause.clause_id, region_id: region.region_id, region_title: region.title,
        page_id: region.page_id, marker: block.marker, indent_px: block.indent_px,
        text: clause.reading_text, parent_clause_id: stack.at(-1)?.clause_id ?? null,
        ancestor_clause_ids: ancestors, source_spans: clause.source_spans,
      });
      stack.push({ clause_id: clause.clause_id, indent_px: block.indent_px });
    }
  }
  return out;
}

export type BasSequenceAiBatch = {
  prompt_version: typeof BAS_SEQUENCE_AI_PROMPT_VERSION;
  region_id: string; region_title: string; page_id: string;
  clauses: Array<{ clause_id: string; marker: string | null; indent_px: number; text: string;
    parent_clause_id: string | null; ancestor_clauses: Array<{ clause_id: string; text: string }> }>;
};

/** Keep related hierarchy together while bounding one model call. A region may
 * exceed the batch cap; every child carries its literal ancestor text so it
 * remains interpretable without permitting evidence from siblings/children. */
export function prepareBasSequenceAiBatches(sources: BasSourceContext, batchSize = 8): BasSequenceAiBatch[] {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 32) throw new Error('SOO AI batch size must be 1..32');
  const clauses = sequenceClauses(sources);
  const byId = new Map(clauses.map(clause => [clause.clause_id, clause]));
  const regions = new Map<string, DeterministicClause[]>();
  for (const clause of clauses) regions.set(clause.region_id, [...(regions.get(clause.region_id) ?? []), clause]);
  const batches: BasSequenceAiBatch[] = [];
  for (const regionClauses of regions.values()) {
    for (let offset = 0; offset < regionClauses.length; offset += batchSize) {
      const group = regionClauses.slice(offset, offset + batchSize);
      const first = group[0];
      batches.push({
        prompt_version: BAS_SEQUENCE_AI_PROMPT_VERSION,
        region_id: first.region_id, region_title: first.region_title, page_id: first.page_id,
        clauses: group.map(clause => ({
          clause_id: clause.clause_id, marker: clause.marker, indent_px: clause.indent_px, text: clause.text,
          parent_clause_id: clause.parent_clause_id,
          ancestor_clauses: clause.ancestor_clause_ids.map(id => ({ clause_id: id, text: byId.get(id)!.text })),
        })),
      });
    }
  }
  return batches;
}

const normalized = (value: string) => value.normalize('NFKC').replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim().toUpperCase();

function minimalEvidenceSpans(spans: BasSourceSpan[], quote: string): string[] | null {
  const needle = normalized(quote);
  if (!needle) return null;
  const ordered = [...spans].sort((a, b) => a.source_index - b.source_index);
  for (let size = 1; size <= ordered.length; size++) {
    for (let start = 0; start + size <= ordered.length; start++) {
      const slice = ordered.slice(start, start + size);
      if (normalized(slice.map(span => span.text).join(' ')).includes(needle)) return slice.map(span => span.span_id);
    }
  }
  return null;
}

function explicitIoInEvidence(type: 'AI' | 'AO' | 'BI' | 'BO', evidence: string) {
  const source = normalized(evidence);
  const terms = {
    AI: /(?:\bAI\b|\bANALOG INPUT\b)/,
    AO: /(?:\bAO\b|\bANALOG OUTPUT\b)/,
    BI: /(?:\bBI\b|\bBINARY INPUT\b|\bDIGITAL INPUT\b|\bDI\b)/,
    BO: /(?:\bBO\b|\bBINARY OUTPUT\b|\bDIGITAL OUTPUT\b|\bDO\b)/,
  } as const;
  return terms[type].test(source);
}

const claimStopWords = new Set(['A', 'AN', 'AND', 'AS', 'AT', 'BE', 'BY', 'FOR', 'FROM', 'IN', 'IS', 'OF', 'ON', 'OR', 'THE', 'TO', 'WITH']);
function claimTokens(value: string) {
  return normalized(value).split(/[^A-Z0-9]+/).filter(token => token && !claimStopWords.has(token));
}

/** Free-text model fields stay source-bounded without requiring the drafting
 * phrase to have the model's word order. Every meaningful claim token must be
 * present in the literal quotes selected by the model. */
function claimIsEvidenced(value: string | null, evidence: z.infer<typeof evidenceSchema>[]) {
  if (value === null) return true;
  const tokens = new Set(claimTokens(evidence.map(item => item.text).join(' ')));
  const required = claimTokens(value);
  return required.length > 0 && required.every(token => tokens.has(token));
}

const numberWords: Record<number, string[]> = {
  0: ['ZERO'], 1: ['ONE'], 2: ['TWO'], 3: ['THREE'], 4: ['FOUR'], 5: ['FIVE'], 6: ['SIX'],
  7: ['SEVEN'], 8: ['EIGHT'], 9: ['NINE'], 10: ['TEN'], 11: ['ELEVEN'], 12: ['TWELVE'],
};
function numberIsEvidenced(value: number, source: string) {
  const escaped = String(value).replace('.', '\\.');
  if (new RegExp(`(^|[^0-9])${escaped}([^0-9]|$)`).test(source)) return true;
  return Number.isInteger(value) && (numberWords[value] ?? []).some(word => new RegExp(`\\b${word}\\b`).test(source));
}

function operatorIsEvidenced(operator: z.infer<typeof nullableValueSchema> extends infer _ ? 'lt' | 'lte' | 'eq' | 'gte' | 'gt' | 'range' : never,
  source: string) {
  const patterns = {
    lt: /(?:LESS THAN|BELOW|UNDER|DROP(?:S|PED)? BELOW)/,
    lte: /(?:LESS THAN OR EQUAL|AT MOST|NOT (?:TO )?EXCEED|NO (?:GREATER|MORE) THAN)/,
    eq: /(?:EQUAL(?:S| TO)?|AT|AFTER|FOR|OF|IS|TO|WHEN)/,
    gte: /(?:GREATER THAN OR EQUAL|AT LEAST|NOT (?:TO )?(?:DROP|FALL) BELOW|NO LESS THAN)/,
    gt: /(?:GREATER THAN|MORE THAN|ABOVE|EXCEED(?:S|ED)?)/,
    range: /(?:BETWEEN|RANGE|FROM).+(?:AND|TO)/,
  } as const;
  return patterns[operator].test(source);
}

function valueClaimIsEvidenced(value: z.infer<typeof nullableValueSchema>, evidence: z.infer<typeof evidenceSchema>[]) {
  if (value === null) return true;
  const source = normalized(evidence.map(item => item.text).join(' '));
  if (value.value === null || !numberIsEvidenced(value.value, source)) return false;
  if (value.value_high !== null && !numberIsEvidenced(value.value_high, source)) return false;
  if (value.operator === 'range' && value.value_high === null) return false;
  if (value.operator !== 'range' && value.value_high !== null) return false;
  if (!operatorIsEvidenced(value.operator, source)) return false;
  if (value.unit !== null && !normalized(value.unit).split(/\s+/).every(token => source.includes(token))) return false;
  const sourceSaysAdjustable = /(?:\bADJ\b|\bADJUSTABLE\b)/.test(source);
  return value.adjustable === sourceSaysAdjustable;
}

const reviewedEvidenceSchema = evidenceSchema.extend({ source_span_ids: z.array(z.string().min(1).max(512)).min(1).max(200) }).strict();
const ontologyEntitySchema = z.object({ entity_kind: z.enum(BAS_SEQUENCE_ENTITY_KINDS),
  brick_class: z.string().nullable(), haystack_tags: z.array(z.string()) }).strict();
const reviewedBehaviorSchema = modelBehaviorSchema.omit({ subject_kind: true, object_kind: true, relation: true, evidence: true }).extend({
  behavior_id: z.string().regex(/^[a-f0-9]{64}$/), review_status: z.literal('proposed'),
  subject_ontology: ontologyEntitySchema, object_ontology: ontologyEntitySchema.nullable(),
  relation_ontology: z.object({ relation_kind: z.enum(BAS_SEQUENCE_RELATION_KINDS), brick_relationship: z.string().nullable() }).strict(),
  evidence: z.array(reviewedEvidenceSchema).min(1).max(16), installed_quantity: z.null(),
}).strict();
const reviewedPointSchema = modelPointSchema.omit({ function: true, evidence: true }).extend({
  point_id: z.string().regex(/^[a-f0-9]{64}$/), review_status: z.literal('proposed'),
  function: z.enum(BAS_SEQUENCE_POINT_FUNCTIONS), ontology: z.object({ point_function: z.enum(BAS_SEQUENCE_POINT_FUNCTIONS),
    brick_class: z.string(), haystack_tags: z.array(z.string()) }).strict(),
  evidence: z.array(reviewedEvidenceSchema).min(1).max(16), installed_quantity: z.null(),
}).strict();
const reviewedClauseSchema = z.object({
  interpretation_id: z.string().regex(/^[a-f0-9]{64}$/), clause_id: z.string().min(1).max(512),
  region_id: z.string().min(1).max(512), page_id: z.string().min(1).max(512),
  // This is the deterministic source clause, not model-authored summary
  // prose. Real authored SOO paragraphs can exceed the model wire field's
  // 2,048-character ceiling (the NAVFAC CHW/HHW clauses are >4,100 chars),
  // so the retained evidence contract must accept the complete source text.
  summary: z.string().trim().min(1).max(65536), review_status: z.literal('proposed'),
  behaviors: z.array(reviewedBehaviorSchema).max(64), candidate_points: z.array(reviewedPointSchema).max(64),
}).strict();
export const basSequenceAiRunSchema = z.object({
  schema_version: z.literal('bas_sequence_ai_run_v1'), prompt_version: z.literal(BAS_SEQUENCE_AI_PROMPT_VERSION),
  run_id: z.string().regex(/^[a-f0-9]{64}$/), model: z.string().min(1).max(256),
  generated_at: z.string().datetime(), source_rule_version: z.literal(BAS_SEQUENCE_RULE),
  review_required: z.literal(true), interpretations: z.array(reviewedClauseSchema).max(250000),
  rejections: z.array(z.object({ clause_id: z.string().max(512), codes: z.array(z.enum([
    'UNKNOWN_CLAUSE', 'DUPLICATE_CLAUSE', 'FORBIDDEN_EVIDENCE_SCOPE', 'EVIDENCE_NOT_LITERAL',
    'IO_TYPE_NOT_EXPLICIT', 'CLAIM_NOT_EVIDENCED', 'THRESHOLD_NOT_EVIDENCED',
    'DELAY_NOT_EVIDENCED', 'EXPLICIT_POINT_NOT_EVIDENCED', 'INVALID_MODEL_OUTPUT', 'NO_ACCEPTED_ITEMS',
  ])).min(1).max(16) }).strict()).max(250000),
  item_rejections: z.array(z.object({
    clause_id: z.string().min(1).max(512), item_type: z.enum(['behavior', 'candidate_point']),
    item_index: z.number().int().nonnegative().safe(), codes: z.array(z.enum([
      'FORBIDDEN_EVIDENCE_SCOPE', 'EVIDENCE_NOT_LITERAL', 'IO_TYPE_NOT_EXPLICIT',
      'CLAIM_NOT_EVIDENCED', 'THRESHOLD_NOT_EVIDENCED', 'DELAY_NOT_EVIDENCED',
      'EXPLICIT_POINT_NOT_EVIDENCED',
    ])).min(1).max(16),
  }).strict()).max(1000000),
  missing_clause_ids: z.array(z.string().max(512)).max(250000),
  coverage: z.object({ eligible_clauses: z.number().int().nonnegative(), returned_clauses: z.number().int().nonnegative(),
    accepted_clauses: z.number().int().nonnegative(), rejected_clauses: z.number().int().nonnegative(),
    rejected_items: z.number().int().nonnegative(), missing_clauses: z.number().int().nonnegative() }).strict(),
}).strict();
export type BasSequenceAiRun = z.infer<typeof basSequenceAiRunSchema>;

async function digest(value: unknown) {
  return sha256Hex(new TextEncoder().encode(canonicalBasJson(value)));
}

/** Validate one or more model batch replies as one immutable, review-required
 * run. Any invalid clause is rejected as a unit; valid siblings survive. */
export async function validateBasSequenceAiResponses(sources: BasSourceContext, rawResponses: unknown[],
  metadata: { model: string; generated_at?: string }): Promise<BasSequenceAiRun> {
  const deterministic = sequenceClauses(sources);
  const byId = new Map(deterministic.map(clause => [clause.clause_id, clause]));
  const returned: z.infer<typeof modelClauseSchema>[] = [];
  const rejections: BasSequenceAiRun['rejections'] = [];
  const item_rejections: BasSequenceAiRun['item_rejections'] = [];
  for (const raw of rawResponses) {
    const parsed = basSequenceAiModelResponseSchema.safeParse(raw);
    if (!parsed.success) {
      rejections.push({ clause_id: '', codes: ['INVALID_MODEL_OUTPUT'] });
      continue;
    }
    returned.push(...parsed.data.clauses);
  }
  const seen = new Set<string>();
  const interpretations: BasSequenceAiRun['interpretations'] = [];
  for (const candidate of returned) {
    const source = byId.get(candidate.clause_id);
    const clauseCodes = new Set<BasSequenceAiRun['rejections'][number]['codes'][number]>();
    if (!source) clauseCodes.add('UNKNOWN_CLAUSE');
    if (seen.has(candidate.clause_id)) clauseCodes.add('DUPLICATE_CLAUSE');
    seen.add(candidate.clause_id);
    if (!source) {
      rejections.push({ clause_id: candidate.clause_id, codes: [...clauseCodes] });
      continue;
    }
    if (clauseCodes.size) {
      rejections.push({ clause_id: candidate.clause_id, codes: [...clauseCodes].sort() });
      continue;
    }
    const allowed = new Set([source.clause_id, ...source.ancestor_clause_ids]);
    type ItemCode = BasSequenceAiRun['item_rejections'][number]['codes'][number];
    const evidenceFor = (items: z.infer<typeof evidenceSchema>[], codes: Set<ItemCode>) => items.map(item => {
      const cited = byId.get(item.clause_id);
      if (!allowed.has(item.clause_id) || !cited) {
        codes.add('FORBIDDEN_EVIDENCE_SCOPE');
        return null;
      }
      const source_span_ids = minimalEvidenceSpans(cited.source_spans, item.text);
      if (!source_span_ids) {
        codes.add('EVIDENCE_NOT_LITERAL');
        return null;
      }
      return { ...item, source_span_ids };
    });
    const behaviors: z.infer<typeof reviewedBehaviorSchema>[] = [];
    for (let index = 0; index < candidate.behaviors.length; index++) {
      const behavior = candidate.behaviors[index];
      const codes = new Set<ItemCode>();
      const evidence = evidenceFor(behavior.evidence, codes);
      if (![behavior.subject, behavior.object, behavior.action, behavior.condition]
        .every(value => claimIsEvidenced(value, behavior.evidence))) codes.add('CLAIM_NOT_EVIDENCED');
      if (!valueClaimIsEvidenced(behavior.threshold, behavior.evidence)) codes.add('THRESHOLD_NOT_EVIDENCED');
      if (!valueClaimIsEvidenced(behavior.delay, behavior.evidence)) codes.add('DELAY_NOT_EVIDENCED');
      if (codes.size) {
        item_rejections.push({ clause_id: candidate.clause_id, item_type: 'behavior', item_index: index, codes: [...codes].sort() });
        continue;
      }
      const { subject_kind, object_kind, relation, ...literalBehavior } = behavior;
      const subject = entityProjection[subject_kind];
      const object = object_kind ? entityProjection[object_kind] : null;
      const payload = { ...literalBehavior,
        subject_ontology: { entity_kind: subject_kind, ...subject },
        object_ontology: object_kind ? { entity_kind: object_kind, ...object! } : null,
        relation_ontology: { relation_kind: relation, brick_relationship: relationProjection[relation] },
        evidence: evidence as Array<z.infer<typeof reviewedEvidenceSchema>>,
        review_status: 'proposed' as const, installed_quantity: null };
      const behavior_id = await digest({ clause_id: candidate.clause_id, kind: 'behavior', payload });
      behaviors.push(reviewedBehaviorSchema.parse({ ...payload, behavior_id }));
    }
    const candidate_points: z.infer<typeof reviewedPointSchema>[] = [];
    for (let index = 0; index < candidate.candidate_points.length; index++) {
      const point = candidate.candidate_points[index];
      const codes = new Set<ItemCode>();
      const evidence = evidenceFor(point.evidence, codes);
      if (point.io_type && !point.evidence.some(item => explicitIoInEvidence(point.io_type!, item.text))) {
        codes.add('IO_TYPE_NOT_EXPLICIT');
      }
      if (point.basis === 'explicit_requirement' && !claimIsEvidenced(point.name, point.evidence)) {
        codes.add('EXPLICIT_POINT_NOT_EVIDENCED');
      }
      if (codes.size) {
        item_rejections.push({ clause_id: candidate.clause_id, item_type: 'candidate_point', item_index: index, codes: [...codes].sort() });
        continue;
      }
      const projection = pointProjection[point.function];
      const payload = { ...point, ontology: { point_function: point.function, ...projection },
        evidence: evidence as Array<z.infer<typeof reviewedEvidenceSchema>>,
        review_status: 'proposed' as const, installed_quantity: null };
      const point_id = await digest({ clause_id: candidate.clause_id, kind: 'point', payload });
      candidate_points.push(reviewedPointSchema.parse({ ...payload, point_id }));
    }
    if (!behaviors.length && !candidate_points.length) {
      rejections.push({ clause_id: candidate.clause_id, codes: ['NO_ACCEPTED_ITEMS'] });
      continue;
    }
    const clausePayload = { clause_id: candidate.clause_id, region_id: source.region_id, page_id: source.page_id,
      // The retained schema trims strings. Canonicalize the deterministic
      // source symmetrically so harmless PDF trailing whitespace cannot create
      // a save-now/fail-on-reverify record.
      summary: source.text.trim(), review_status: 'proposed' as const, behaviors, candidate_points };
    const interpretation_id = await digest(clausePayload);
    interpretations.push(reviewedClauseSchema.parse({ ...clausePayload, interpretation_id }));
  }
  const missing_clause_ids = deterministic.map(clause => clause.clause_id).filter(id => !seen.has(id));
  const generated_at = metadata.generated_at ?? new Date().toISOString();
  const runPayload = { schema_version: 'bas_sequence_ai_run_v1' as const,
    prompt_version: BAS_SEQUENCE_AI_PROMPT_VERSION, model: metadata.model, generated_at,
    source_rule_version: BAS_SEQUENCE_RULE, review_required: true as const, interpretations,
    rejections, item_rejections, missing_clause_ids,
    coverage: { eligible_clauses: deterministic.length, returned_clauses: returned.length,
      accepted_clauses: interpretations.length, rejected_clauses: rejections.length,
      rejected_items: item_rejections.length, missing_clauses: missing_clause_ids.length } };
  const run_id = await digest(runPayload);
  return basSequenceAiRunSchema.parse({ ...runPayload, run_id });
}

/** Re-verify a retained run without trusting its hashes or projections. Saved
 * model output is never authoritative merely because it once passed. */
export async function verifyBasSequenceAiRun(sources: BasSourceContext, raw: unknown): Promise<BasSequenceAiRun> {
  const run = basSequenceAiRunSchema.parse(raw);
  const deterministic = sequenceClauses(sources);
  const byId = new Map(deterministic.map(clause => [clause.clause_id, clause]));
  const owned = new Set(byId.keys()), partition = new Set<string>();
  const ids = new Set<string>();
  const unique = (id: string, label: string) => {
    if (ids.has(id)) throw new Error(`Duplicate retained SOO AI ${label} identity`);
    ids.add(id);
  };
  const verifyEvidence = (clause: DeterministicClause, evidence: z.infer<typeof reviewedEvidenceSchema>[]) => {
    const allowed = new Set([clause.clause_id, ...clause.ancestor_clause_ids]);
    for (const item of evidence) {
      const cited = byId.get(item.clause_id);
      if (!allowed.has(item.clause_id) || !cited) throw new Error('Retained SOO AI evidence escapes its clause hierarchy');
      const expected = minimalEvidenceSpans(cited.source_spans, item.text);
      if (!expected || canonicalBasJson(expected) !== canonicalBasJson(item.source_span_ids)) {
        throw new Error('Retained SOO AI quote or source spans changed');
      }
    }
  };
  for (const interpretation of run.interpretations) {
    const clause = byId.get(interpretation.clause_id);
    if (!clause || partition.has(interpretation.clause_id)) throw new Error('Retained SOO AI clause is unowned or duplicated');
    partition.add(interpretation.clause_id); unique(interpretation.interpretation_id, 'interpretation');
    if (interpretation.region_id !== clause.region_id || interpretation.page_id !== clause.page_id
      || interpretation.summary !== clause.text.trim()) throw new Error('Retained SOO AI clause source changed');
    for (const behavior of interpretation.behaviors) {
      unique(behavior.behavior_id, 'behavior'); verifyEvidence(clause, behavior.evidence);
      const evidence = behavior.evidence.map(({ clause_id, text }) => ({ clause_id, text }));
      if (![behavior.subject, behavior.object, behavior.action, behavior.condition].every(value => claimIsEvidenced(value, evidence))) {
        throw new Error('Retained SOO AI behavior claim is not evidenced');
      }
      if (!valueClaimIsEvidenced(behavior.threshold, evidence) || !valueClaimIsEvidenced(behavior.delay, evidence)) {
        throw new Error('Retained SOO AI value claim is not evidenced');
      }
      const subject = entityProjection[behavior.subject_ontology.entity_kind];
      const object = behavior.object_ontology ? entityProjection[behavior.object_ontology.entity_kind] : null;
      if (canonicalBasJson(behavior.subject_ontology) !== canonicalBasJson({ entity_kind: behavior.subject_ontology.entity_kind, ...subject })
        || canonicalBasJson(behavior.object_ontology) !== canonicalBasJson(object ? { entity_kind: behavior.object_ontology!.entity_kind, ...object } : null)
        || behavior.relation_ontology.brick_relationship !== relationProjection[behavior.relation_ontology.relation_kind]) {
        throw new Error('Retained SOO AI ontology projection changed');
      }
      const { behavior_id, ...payload } = behavior;
      if (await digest({ clause_id: interpretation.clause_id, kind: 'behavior', payload }) !== behavior_id) {
        throw new Error('Retained SOO AI behavior fingerprint mismatch');
      }
    }
    for (const point of interpretation.candidate_points) {
      unique(point.point_id, 'point'); verifyEvidence(clause, point.evidence);
      const evidence = point.evidence.map(({ clause_id, text }) => ({ clause_id, text }));
      if (point.io_type && !point.evidence.some(item => explicitIoInEvidence(point.io_type!, item.text))) {
        throw new Error('Retained SOO AI I/O type is not explicit');
      }
      if (point.basis === 'explicit_requirement' && !claimIsEvidenced(point.name, evidence)) {
        throw new Error('Retained SOO AI explicit point is not evidenced');
      }
      if (canonicalBasJson(point.ontology) !== canonicalBasJson({ point_function: point.function, ...pointProjection[point.function] })) {
        throw new Error('Retained SOO AI point projection changed');
      }
      const { point_id, ...payload } = point;
      if (await digest({ clause_id: interpretation.clause_id, kind: 'point', payload }) !== point_id) {
        throw new Error('Retained SOO AI point fingerprint mismatch');
      }
    }
    const { interpretation_id, ...payload } = interpretation;
    if (await digest(payload) !== interpretation_id) throw new Error('Retained SOO AI interpretation fingerprint mismatch');
  }
  for (const rejection of run.rejections) {
    if (!owned.has(rejection.clause_id) || partition.has(rejection.clause_id)) throw new Error('Retained SOO AI rejection is unowned or duplicated');
    partition.add(rejection.clause_id);
  }
  for (const clauseId of run.missing_clause_ids) {
    if (!owned.has(clauseId) || partition.has(clauseId)) throw new Error('Retained SOO AI missing clause is unowned or duplicated');
    partition.add(clauseId);
  }
  if (partition.size !== deterministic.length) throw new Error('Retained SOO AI coverage does not partition the source clauses');
  for (const rejection of run.item_rejections) if (!owned.has(rejection.clause_id)) {
    throw new Error('Retained SOO AI item rejection has no source clause');
  }
  const returned = run.interpretations.length + run.rejections.length;
  const expectedCoverage = { eligible_clauses: deterministic.length, returned_clauses: returned,
    accepted_clauses: run.interpretations.length, rejected_clauses: run.rejections.length,
    rejected_items: run.item_rejections.length, missing_clauses: run.missing_clause_ids.length };
  if (canonicalBasJson(run.coverage) !== canonicalBasJson(expectedCoverage)) throw new Error('Retained SOO AI coverage changed');
  const { run_id, ...payload } = run;
  if (await digest(payload) !== run_id) throw new Error('Retained SOO AI run fingerprint mismatch');
  return run;
}

export type BasSequenceAiModelRequest = {
  system_prompt: string;
  response_json_schema: typeof BAS_SEQUENCE_AI_RESPONSE_JSON_SCHEMA;
  batch: BasSequenceAiBatch;
  attempt: number;
  validator_feedback: Array<{ clause_id: string; codes: string[] }>;
};

export type BasSequenceAiTransport = (request: BasSequenceAiModelRequest) => Promise<unknown>;

export type BasSequenceAiExecution = {
  run: BasSequenceAiRun;
  attempts: Array<{ attempt: number; batch_count: number; requested_clauses: number; returned_clauses: number }>;
};

async function concurrentMap<T, U>(values: T[], limit: number, work: (value: T) => Promise<U>) {
  const results = new Array<U>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await work(values[index]);
    }
  }));
  return results;
}

function returnedClauses(rawResponses: unknown[]) {
  return rawResponses.flatMap(raw => {
    const parsed = basSequenceAiModelResponseSchema.safeParse(raw);
    return parsed.success ? parsed.data.clauses : [];
  });
}

export function basSequenceAiResponseEnvelopes(clauses: z.infer<typeof modelClauseSchema>[]) {
  return Array.from({ length: Math.ceil(clauses.length / 64) }, (_, index) => ({
    clauses: clauses.slice(index * 64, index * 64 + 64),
  }));
}

/** Run every discovered clause automatically, retry only unsafe/missing
 * clauses with validator feedback, and choose the attempt that preserves the
 * most independently accepted items. The transport owns HTTP/auth only; all
 * prompting, validation, selection and final truth shape stay shared. */
export async function executeBasSequenceAiInterpretation(sources: BasSourceContext, transport: BasSequenceAiTransport,
  options: { model: string; batch_size?: number; concurrency?: number; max_attempts?: number; generated_at?: string }): Promise<BasSequenceAiExecution> {
  const batchSize = options.batch_size ?? 8;
  const concurrency = options.concurrency ?? 4;
  const maxAttempts = options.max_attempts ?? 2;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('SOO AI concurrency must be 1..16');
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('SOO AI attempts must be 1..3');
  const originalBatches = prepareBasSequenceAiBatches(sources, batchSize);
  const requestedIds = new Set(originalBatches.flatMap(batch => batch.clauses.map(clause => clause.clause_id)));
  const candidates = new Map<string, z.infer<typeof modelClauseSchema>[]>();
  const attempts: BasSequenceAiExecution['attempts'] = [];
  let pending = originalBatches;
  let feedback = new Map<string, string[]>();
  for (let attempt = 1; attempt <= maxAttempts && pending.length; attempt++) {
    const correction = attempt === 1 ? '' : [
      ' This is a correction pass. The validator rejected one or more prior items.',
      ' Correct every supplied validator code; do not repeat an unsupported claim merely to fill the schema.',
      ' Return each supplied clause exactly once. Most SOO candidate points have io_type null.',
      ' Evidence for each item must collectively contain every meaningful word used by its subject, object, action and condition.',
    ].join('');
    const responses = await concurrentMap(pending, concurrency, batch => transport({
      system_prompt: BAS_SEQUENCE_AI_SYSTEM_PROMPT + correction,
      response_json_schema: BAS_SEQUENCE_AI_RESPONSE_JSON_SCHEMA,
      batch, attempt,
      validator_feedback: batch.clauses.map(clause => ({ clause_id: clause.clause_id, codes: feedback.get(clause.clause_id) ?? [] })),
    }));
    const returned = returnedClauses(responses);
    attempts.push({ attempt, batch_count: pending.length,
      requested_clauses: pending.reduce((sum, batch) => sum + batch.clauses.length, 0), returned_clauses: returned.length });
    for (const candidate of returned) {
      if (!requestedIds.has(candidate.clause_id)) continue;
      candidates.set(candidate.clause_id, [...(candidates.get(candidate.clause_id) ?? []), candidate]);
    }
    if (attempt === maxAttempts) break;
    feedback = new Map();
    const retryIds = new Set<string>();
    for (const id of requestedIds) {
      const versions = candidates.get(id) ?? [];
      if (!versions.length) {
        retryIds.add(id);
        feedback.set(id, ['MISSING_CLAUSE']);
        continue;
      }
      const latest = await validateBasSequenceAiResponses(sources, [{ clauses: [versions.at(-1)!] }], { model: options.model });
      const codes = [
        ...latest.rejections.filter(value => value.clause_id === id).flatMap(value => value.codes),
        ...latest.item_rejections.filter(value => value.clause_id === id).flatMap(value => value.codes),
      ];
      if (codes.length) {
        retryIds.add(id);
        feedback.set(id, [...new Set(codes)].sort());
      }
    }
    pending = originalBatches.map(batch => ({ ...batch, clauses: batch.clauses.filter(clause => retryIds.has(clause.clause_id)) }))
      .filter(batch => batch.clauses.length > 0);
  }
  const chosen: z.infer<typeof modelClauseSchema>[] = [];
  for (const id of requestedIds) {
    let best: { candidate: z.infer<typeof modelClauseSchema>; accepted: number; rejected: number } | null = null;
    for (const candidate of candidates.get(id) ?? []) {
      const evaluated = await validateBasSequenceAiResponses(sources, [{ clauses: [candidate] }], { model: options.model });
      const interpretation = evaluated.interpretations.find(value => value.clause_id === id);
      const accepted = (interpretation?.behaviors.length ?? 0) + (interpretation?.candidate_points.length ?? 0);
      const rejected = evaluated.item_rejections.filter(value => value.clause_id === id).length
        + evaluated.rejections.filter(value => value.clause_id === id).length;
      if (!best || accepted > best.accepted || (accepted === best.accepted && rejected < best.rejected)) {
        best = { candidate, accepted, rejected };
      }
    }
    if (best) chosen.push(best.candidate);
  }
  const finalResponses = basSequenceAiResponseEnvelopes(chosen);
  const run = await validateBasSequenceAiResponses(sources, finalResponses, {
    model: options.model, generated_at: options.generated_at,
  });
  return { run, attempts };
}
