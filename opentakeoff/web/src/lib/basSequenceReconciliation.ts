/** SHOULD THIS BE ON THE SHARED PATH? Yes: source interpretation and joins.
 * Bounded SOO monitoring requirements, not I/O inference or installed quantities.
 * No extraction mutations and no alternate browser/MCP interpretation.
 */
import { z } from 'zod';
import { discoverBasNarratives, type BasNarrativeBlock } from './basNarratives.ts';
import type { BasSourceContext, BasSourceSpan } from './basSources.ts';
import { basPointListsSchema } from './basPointLists.ts';
import { canonicalBasJson } from './basWorkflow.ts';
import { sha256Hex } from './graphKeys.js';

export const BAS_SEQUENCE_RULE = 'explicit_monitor_modulate_1' as const;

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

function blockSpanIds(block: BasNarrativeBlock): string[] {
  return (block.kind === 'paragraph' ? block.lines : block.rows.flat()).flatMap(l => l.span_ids);
}

/** Recompute discovery from the same source snapshot; never accept foreign
 * pre-parsed paragraphs alongside unrelated source evidence. */
export function interpretBasSequences(sources: BasSourceContext) {
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
  return { schema_version: 'bas_sequence_requirements_v1' as const, rule_version: BAS_SEQUENCE_RULE,
    discovery_complete: false as const, interpretation_complete: false as const,
    discovery, regions };
}

const bounded = z.string().trim().min(1).max(512);
const associationSchema = z.array(z.object({
  region_id: bounded, matrix_id: bounded,
  review_origin: z.enum(['operator_input', 'source_review_fixture']),
  reason: z.string().trim().min(1).max(4096),
  equipment_references: z.array(z.object({
    tag: bounded, span_ids: z.array(bounded).min(1).max(100),
    scope: z.object({ building: bounded.nullable(), level: bounded.nullable(),
      system: bounded.nullable(), phase: bounded.nullable() }).strict(),
  }).strict()).min(1).max(1000),
}).strict()).max(10000);
export type BasSequenceAssociation = z.infer<typeof associationSchema>[number];

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
export async function reconcileBasSequencePoints(sources: BasSourceContext, rawPoints: unknown, rawAssociations: unknown) {
  const sequences = interpretBasSequences(sources);
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
    // Validate the interpreter's name against its actual identity column. Do
    // not substitute a matching note/attribute cell or guess a missing name.
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
      return { requirement, clause_id: c.clause_id, source_spans: c.source_spans, status,
        listed_rows: structuredClone(rows), field_wiring_status: 'not_established' as const,
        installed_quantity: null };
    }));
    comparisons.push({ association: structuredClone(association), equipment_references: references,
      requirements, unpaired_point_row_ids: matrix.rows.filter(r => !matchedRows.has(r.row_id)).map(r => r.row_id),
      matrix_issues: [...matrix.issues], quantity_basis: 'comparison_only' as const });
  }
  return { schema_version: 'bas_sequence_point_comparison_v1' as const, rule_version: BAS_SEQUENCE_RULE,
    project_complete: false as const, sequences, comparisons };
}
