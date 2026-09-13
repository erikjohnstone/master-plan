/** SHOULD THIS BE ON THE SHARED PATH? Yes: source interpretation and joins.
 * Bounded SOO monitoring requirements, not I/O inference or installed quantities.
 * No extraction mutations and no alternate browser/MCP interpretation.
 */
import { z } from 'zod';
import { discoverBasNarratives, type BasNarrativeBlock } from './basNarratives.ts';
import type { BasSourceContext, BasSourceSpan } from './basSources.ts';
import { basPointListsSchema } from './basPointLists.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';

export const BAS_SEQUENCE_RULE_V1 = 'explicit_monitor_modulate_1' as const;
export const BAS_SEQUENCE_RULE = 'explicit_monitor_and_labeled_points_2' as const;
export const BAS_SEQUENCE_RULES = [BAS_SEQUENCE_RULE_V1, BAS_SEQUENCE_RULE] as const;
export type BasSequenceRuleVersion = typeof BAS_SEQUENCE_RULES[number];

/** Deliberate literal equivalences, not fuzzy similarity or noun deletion. */
export function normalizedBasVariable(text: string): string {
  return text.normalize('NFKC').toUpperCase().replace(/\bCHW\b/g, 'CHILLED WATER')
    .replace(/\bHW\b/g, 'HOT WATER').replace(/\bTEMP\b\.?/g, 'TEMPERATURE')
    .replace(/\bSET\s+POINT\b/g, 'SETPOINT').replace(/\s+/g, ' ').trim();
}

export interface MonitorRequirement {
  requirement_id: string;
  kind: 'monitor_variable';
  variable: string;
  normalized_variable: string;
  operating_mode: string | null;
  subject_label: string | null;
  modulation: string;
  target: string;
  scope_status: 'requires_region_review';
  signal_type: null;
  installed_quantity: null;
}

export interface LabeledPointRequirement {
  requirement_id: string;
  kind: 'labeled_point_candidate';
  variable: string;
  normalized_variable: string;
  source_tag: string;
  /** Exact source fragments for this authored label. The surrounding clause
   * remains available separately and is not implied to be interpreted. */
  source_span_ids: string[];
  operating_mode: null;
  scope_status: 'requires_region_review';
  signal_type: null;
  installed_quantity: null;
}

export type BasSequenceRequirement = MonitorRequirement | LabeledPointRequirement;

/** A narrow grammar must fail closed on scope-changing language. Retaining a
 * matched monitoring clause is not a claim to interpret its target numerically. */
function monitorClause(text: string, marker: string | null): { requirement: Omit<MonitorRequirement, 'requirement_id'>; tail: string } | null {
  let input = text.trim();
  if (input.length > 4096) return null;
  if (marker && input.startsWith(`${marker} `)) input = input.slice(marker.length).trimStart();
  const label = /^(SUPPLY AIR FAN|RETURN AIR FAN|EXHAUST AIR FAN):\s+/i.exec(input);
  if (label) input = input.slice(label[0].length);
  const match = /^(?:(IN COOLING|IN HEATING),\s+)?THE CONTROLLER SHALL MONITOR (?:THE )?(.+?) AND MODULATE (?:THE )?(.+?) TO MAINTAIN (?:THE )?(.+?)\.(?:\s+([\s\S]*))?$/i.exec(input);
  if (!match) return null;
  const [, mode, variable, modulation, target, tail = ''] = match;
  // No hidden negation, conjunction, qualifier or second instruction can be
  // stripped to force a match. Unrecognized trailing prose remains untouched.
  const unsafe = /\b(?:NOT|NO|UNLESS|EXCEPT|ONLY|IF|WHEN|UNTIL|PROVIDED|SHOULD|MAY|CAN|AND|OR|SHALL|WILL)\b/i;
  if ([variable, modulation, target].some(s => s.length > 250 || unsafe.test(s))) return null;
  if (/\b(?:NOT|UNLESS|EXCEPT|ONLY|IF|WHEN|UNTIL)\b/i.test(tail)) return null;
  const normalized = normalizedBasVariable(variable);
  const temperature = /^(?:(?:CHILLED|HOT) WATER COIL LEAVING AIR|SUPPLY AIR|RETURN AIR|MIXED AIR|OUTSIDE AIR|DISCHARGE AIR|(?:CHILLED|HEATING|HOT|CONDENSER) WATER(?: SUPPLY| RETURN)?) TEMPERATURE$/;
  const pressure = /^(?:DUCT|DOWNSTREAM|SUPPLY(?: AIR)?|RETURN(?: AIR)?) STATIC PRESSURE$/;
  if (!temperature.test(normalized) && !pressure.test(normalized)) return null;
  return { requirement: { kind: 'monitor_variable', variable, normalized_variable: normalized,
    operating_mode: mode ?? null, subject_label: label?.[1] ?? null, modulation, target,
    scope_status: 'requires_region_review', signal_type: null, installed_quantity: null }, tail };
}

/**
 * Capture an authored, labeled point requirement such as
 * "SUPPLY FAN STATUS (SF-S)". The label and tag are retained literally. This
 * does not infer AI/AO/DI/DO, field wiring, controller assignment, equipment
 * applicability or installed quantity. Compound prose and unlabeled control
 * intent remain uninterpreted for estimator review.
 */
function labeledPointLine(text: string, marker: string | null, sourceSpanIds: string[]): {
  requirement: Omit<LabeledPointRequirement, 'requirement_id'>;
  tail: string;
} | null {
  let input = text.trim();
  if (input.length > 4096) return null;
  if (marker && input.startsWith(`${marker} `)) input = input.slice(marker.length).trimStart();
  const match = /^(.{3,220}?)\s+\(([A-Z][A-Z0-9]{0,15}(?:-[A-Z0-9]{1,16}){1,8})\)([\s\S]*)$/i.exec(input);
  if (!match) return null;
  const variable = match[1].replace(/\s+/g, ' ').trim();
  const sourceTag = match[2].toUpperCase();
  const suffix = match[3].trim();
  // A point-list-like label may end at the tag or carry a concise authored
  // threshold/value. If prose resumes after the tag, this is a mention inside
  // an instruction, not an independently labeled requirement.
  if (suffix && !/^[.:]$/.test(suffix)
      && !/^(?:[.:]\s*)?(?:(?:[A-Z0-9-]{1,20}\s+)?[<>]=?\s*)?(?:[-+]?\d|TBD\b|ADJ\b)/i.test(suffix)) return null;
  const tail = suffix.replace(/^[.:]\s*/, '');
  // A label may contain nouns such as COMMAND or OPEN, but sentence-level
  // actors/connectors indicate control prose rather than an authored point
  // identity. Reject those instead of extracting a convenient parenthetical.
  if (/[.;!?]/.test(variable)
      || /\b(?:SHALL|MUST|MAY|WHEN|WHILE|IF|UNLESS|EXCEPT|REFER|SEE|ALSO|THEN|IS|ARE|WILL|TO|THE|BY|FROM|THAN|ABOVE|BELOW|DROPS?|RISES?|MAINTAIN|MODULATE|COMMANDED|ENERGI[ZS]E[DS]?|DISABLED?|ENABLED?)\b/i.test(variable)) return null;
  const pointFunction = /\b(?:STATUS|ALARM|TEMPERATURE|PRESSURE|HUMIDITY|AIRFLOW|FLOW(?:RATE)?|POSITION|FREEZE\s*STAT|SMOKE|SET\s*POINT|SENSOR|SWITCH|ENABLE|START\s*\/\s*STOP|ON\s*\/\s*OFF|RESET|CONTROL|COMMAND)\b/i;
  if (!pointFunction.test(variable)) return null;
  return { requirement: {
    kind: 'labeled_point_candidate', variable,
    normalized_variable: normalizedBasVariable(variable), source_tag: sourceTag,
    source_span_ids: [...sourceSpanIds],
    operating_mode: null, scope_status: 'requires_region_review',
    signal_type: null, installed_quantity: null,
  }, tail };
}

function blockSpanIds(block: BasNarrativeBlock): string[] {
  return (block.kind === 'paragraph' ? block.lines : block.rows.flat()).flatMap(l => l.span_ids);
}

/** Recompute discovery from the same source snapshot; never accept foreign
 * pre-parsed paragraphs alongside unrelated source evidence. */
function interpretBasSequencesV1(sources: BasSourceContext) {
  const discovery = discoverBasNarratives(sources);
  const spans = new Map(sources.pages.flatMap(p => p.spans.map(s => [s.span_id, s] as const)));
  const regions = discovery.pages.flatMap(page => page.regions.map(region => ({
    region_id: region.region_id, page_id: region.page_id, title: region.title,
    raw: structuredClone(region),
    clauses: region.blocks.map(block => {
      const text = block.kind === 'paragraph' ? block.lines.map(l => l.text).join(' ') : null;
      const matched = region.status === 'body_detected' && text !== null && block.kind === 'paragraph'
        ? monitorClause(text, block.marker) : null;
      const evidence = blockSpanIds(block).map(id => {
        const span = spans.get(id);
        if (!span) throw new Error('Narrative evidence is not owned by the source snapshot');
        return structuredClone(span);
      });
      return { clause_id: block.block_id, kind: block.kind, reading_text: text,
        source_spans: evidence,
        status: matched ? 'partially_interpreted' as const : 'uninterpreted' as const,
        // Target/modulation are preserved literal relationships, not a fully
        // evaluated behavior. Even a matched clause remains partially interpreted.
        requirements: matched ? [{ requirement_id: `${block.block_id}:monitor`, ...matched.requirement }] : [],
        uninterpreted_text: matched ? matched.tail : text,
      };
    }),
  })));
  return { schema_version: 'bas_sequence_requirements_v1' as const, rule_version: BAS_SEQUENCE_RULE_V1,
    discovery_complete: false as const, interpretation_complete: false as const,
    discovery, regions };
}

/**
 * Versioned interpretation over retained source spans. V1 remains available
 * for replay of existing capture fingerprints. V2 adds only explicit labeled
 * point candidates; unsupported prose remains verbatim and uninterpreted.
 */
export function interpretBasSequences(sources: BasSourceContext,
  ruleVersion: BasSequenceRuleVersion = BAS_SEQUENCE_RULE) {
  const original = interpretBasSequencesV1(sources);
  if (ruleVersion === BAS_SEQUENCE_RULE_V1) return original;
  if (ruleVersion !== BAS_SEQUENCE_RULE) throw new Error('Unsupported BAS sequence interpretation rule');
  const regions = original.regions.map(region => ({ ...region,
    clauses: region.clauses.map((clause, index) => {
      if (clause.requirements.length || clause.reading_text === null || region.raw.status !== 'body_detected') return clause;
      const block = region.raw.blocks[index];
      if (block?.kind !== 'paragraph') return clause;
      // Point labels are line-local. Running an anchored expression over a
      // joined multi-line paragraph can accidentally bind the first prose to a
      // later parenthetical tag. Multiple explicit lines remain independent.
      const matches = block.lines.flatMap((line, lineIndex) => {
        const matched = labeledPointLine(line.text, lineIndex === 0 ? block.marker : null, line.span_ids);
        return matched ? [{ lineIndex, ...matched }] : [];
      });
      if (!matches.length) return clause;
      return { ...clause, status: 'partially_interpreted' as const,
        requirements: matches.map(match => ({ requirement_id: `${clause.clause_id}:labeled-point:${match.lineIndex}`,
          ...match.requirement })),
        // The candidate identity is extracted, but its suffix and all adjacent
        // instructions remain unparsed original text for estimator review.
        uninterpreted_text: clause.reading_text };
    }),
  }));
  return { ...original, schema_version: 'bas_sequence_requirements_v2' as const,
    rule_version: BAS_SEQUENCE_RULE, regions };
}

const bounded = z.string().trim().min(1).max(512);
export const basSequenceAssociationSchema = z.object({
  region_id: bounded, matrix_id: bounded,
  review_origin: z.enum(['operator_input', 'agent_proposal', 'source_review_fixture']),
  reason: z.string().trim().min(1).max(4096),
  equipment_references: z.array(z.object({
    tag: bounded, span_ids: z.array(bounded).min(1).max(100),
    scope: z.object({ building: bounded.nullable(), level: bounded.nullable(),
      system: bounded.nullable(), phase: bounded.nullable() }).strict(),
  }).strict()).min(1).max(1000),
}).strict();
const associationSchema = z.array(basSequenceAssociationSchema).max(10000);
export type BasSequenceAssociation = z.infer<typeof basSequenceAssociationSchema>;

const digest = (value: unknown) => sha256Hex(new TextEncoder().encode(canonicalBasJson(value)));
const literal = (text: string) => text.normalize('NFKC').toUpperCase().replace(/\s+/g, ' ').trim();

/** Reference text has to occur as a complete token sequence in retained spans;
 * DOAS 1 must not match DOAS 10. This does not resolve tag ranges/alternatives. */
function hasLiteralReference(tag: string, evidence: BasSourceSpan[]) {
  const needle = literal(tag);
  // Do not concatenate arbitrarily chosen distant spans into a fabricated tag.
  // Fragmented tags need separately reviewed geometric assembly in a later rule.
  return evidence.some(span => {
    const text = literal(span.text);
    let index = text.indexOf(needle);
    while (index >= 0) {
      if (!/[A-Z0-9]/.test(text[index - 1] ?? '') && !/[A-Z0-9]/.test(text[index + needle.length] ?? '')) return true;
      index = text.indexOf(needle, index + 1);
    }
    return false;
  });
}

/** An explicit association compares evidence; it neither assigns a physical
 * quantity nor proves applicability. No association is inferred by this API. */
export function compareBasSequenceMatrix(region: ReturnType<typeof interpretBasSequences>['regions'][number],
  matrix: ReturnType<typeof basPointListsSchema.parse>['matrices'][number]) {
  // One comparator for source-reference links and canonical-equipment links.
  // Callers establish ownership/applicability; this function only compares the
  // unchanged supported requirements with the actual point identity column.
  const nameColumns = matrix.raw.headers.filter(header => {
    const effective = matrix.header_sources.find(s => s.column === header)?.text ?? header;
    return ['POINTNAME', 'POINTDESCRIPTION', 'CONTROLPOINTS', 'DESCRIPTION'].includes(effective.toUpperCase().replace(/[^A-Z]/g, ''));
  });
  const comparable = matrix.rows.filter(r => {
    const cell = nameColumns.length === 1 ? r.raw.cells[nameColumns[0]] : undefined;
    return r.name.trim() && cell?.text === r.name && cell.bbox !== null;
  });
  const labelsComplete = comparable.length === matrix.rows.length;
  const matchedRows = new Set<string>();
  const requirements = region.clauses.flatMap(c => c.requirements.map(requirement => {
    const rows = comparable.filter(r => normalizedBasVariable(r.name) === requirement.normalized_variable);
    rows.forEach(r => matchedRows.add(r.row_id));
    const status = rows.length > 1 ? 'ambiguous_listed_rows' as const : rows.length === 1 ? 'listed' as const
      : labelsComplete ? 'not_listed_in_selected_matrix' as const : 'point_labels_unavailable' as const;
    const requirementSpanIds = requirement.kind === 'labeled_point_candidate'
      ? new Set(requirement.source_span_ids) : null;
    const sourceSpans = requirementSpanIds ? c.source_spans.filter(span => requirementSpanIds.has(span.span_id)) : c.source_spans;
    return { requirement, clause_id: c.clause_id, source_spans: sourceSpans, status,
      listed_rows: structuredClone(rows), field_wiring_status: 'not_established' as const,
      installed_quantity: null };
  }));
  return { requirements, unpaired_point_row_ids: matrix.rows.filter(r => !matchedRows.has(r.row_id)).map(r => r.row_id),
    matrix_issues: [...matrix.issues], quantity_basis: 'comparison_only' as const };
}

export async function reconcileBasSequencePoints(sources: BasSourceContext, rawPoints: unknown, rawAssociations: unknown,
  ruleVersion: BasSequenceRuleVersion = BAS_SEQUENCE_RULE) {
  const sequences = interpretBasSequences(sources, ruleVersion);
  const points = basPointListsSchema.parse(rawPoints);
  const associations = associationSchema.parse(rawAssociations);
  const pageMap = new Map(sources.pages.map(p => [p.page_id, p]));
  const spans = new Map(sources.pages.flatMap(p => p.spans.map(s => [s.span_id, { page: p, span: s }] as const)));
  const seen = new Set<string>();
  const comparisons = [];
  for (const association of associations) {
    const region = sequences.regions.find(r => r.region_id === association.region_id);
    const matrix = points.matrices.find(m => m.matrix_id === association.matrix_id);
    if (!region || region.raw.status !== 'body_detected' || !matrix || !matrix.page_id
        || pageMap.get(matrix.page_id)?.source_id !== matrix.source_id) throw new Error('Stale or unowned sequence/matrix association');
    const pair = JSON.stringify([region.region_id, matrix.matrix_id]);
    if (seen.has(pair)) throw new Error('Duplicate sequence/matrix association');
    seen.add(pair);
    const references = [];
    const referenceIds = new Set<string>();
    for (const ref of association.equipment_references) {
      const evidence = ref.span_ids.map(id => spans.get(id));
      if (new Set(ref.span_ids).size !== ref.span_ids.length || evidence.some(e => !e)
          || new Set(evidence.map(e => e!.page.page_id)).size !== 1) throw new Error('Unowned or ambiguous equipment reference spans');
      const sourceSpans = evidence.map(e => structuredClone(e!.span));
      if (!hasLiteralReference(ref.tag, sourceSpans)) throw new Error('Equipment reference text is absent from its source spans');
      const referenceId = await digest({ tag: literal(ref.tag), scope: ref.scope,
        spans: [...sourceSpans].sort((a, b) => a.source_index - b.source_index) });
      if (referenceIds.has(referenceId)) throw new Error('Duplicate equipment reference');
      referenceIds.add(referenceId);
      references.push({ reference_id: referenceId, ...ref, source_spans: sourceSpans,
        quantity_basis: 'source_reference_only' as const, installed_quantity: null });
    }
    comparisons.push({ association: structuredClone(association), equipment_references: references,
      ...compareBasSequenceMatrix(region, matrix) });
  }
  return { schema_version: ruleVersion === BAS_SEQUENCE_RULE_V1
      ? 'bas_sequence_point_comparison_v1' as const : 'bas_sequence_point_comparison_v2' as const,
    rule_version: ruleVersion,
    project_complete: false as const, sequences, comparisons };
}
