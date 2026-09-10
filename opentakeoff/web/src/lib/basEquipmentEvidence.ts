/** SHOULD THIS BE ON THE SHARED PATH? Yes: source ownership, designation
 * interpretation and equipment candidate identity are identical for UI/MCP.
 * This consumes the existing graph. It never extracts or changes a table. */
import { z } from 'zod';
import { basSourceContextSchema, type BasSourceContext } from './basSources.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import { parseBasEquipmentMembership, parseBasPrintedCount } from './basEquipmentMembership.ts';

const box = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine(b => b[2] >= b[0] && b[3] >= b[1], 'Unordered equipment source box');
const cell = z.object({ text: z.string(), bbox: box }).passthrough();
const row = z.object({ key: z.string(), sheet: z.string().min(1), building: z.string().optional(),
  cells: z.record(cell) }).passthrough();
const rawTable = z.object({ kind: z.literal('equipment'), sheet: z.string().min(1),
  title: cell.extend({ sheet: z.string().min(1) }).nullable(), headers: z.array(z.string()),
  rows: z.array(row), region: box, building: z.string().optional(),
  parts: z.array(z.object({ sheet: z.string().min(1), title: z.string(), rows: z.number().int().nonnegative(),
    region: box }).passthrough()).optional(),
}).passthrough();

/** Unknown graph metadata is retained verbatim, but never interpreted as BAS
 * evidence by virtue of being present. Validate consumed fields and JSON safety. */
export const basEquipmentEvidenceSchema = z.object({
  schema_version: z.literal('bas_equipment_evidence_v1'), rule_version: z.literal('schedule_members_1'),
  scope: z.literal('discovered_equipment_tables_only'), tables: z.array(rawTable).max(100000),
}).strict().superRefine((evidence, ctx) => {
  try { canonicalBasJson(evidence); }
  catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Equipment evidence must be finite JSON' }); }
});
export type BasEquipmentEvidence = z.infer<typeof basEquipmentEvidenceSchema>;
export type BasEquipmentTable = BasEquipmentEvidence['tables'][number];

export function captureBasEquipmentTables(tables: unknown[]): BasEquipmentEvidence {
  return basEquipmentEvidenceSchema.parse({ schema_version: 'bas_equipment_evidence_v1',
    rule_version: 'schedule_members_1', scope: 'discovered_equipment_tables_only',
    tables: tables.filter(t => t && typeof t === 'object' && 'kind' in t && t.kind === 'equipment') });
}

function pageAliases(sources: BasSourceContext) {
  return new Map(sources.pages.flatMap(p => p.sheet_keys.map(key => [key, p] as const)));
}

/** Remove only navigation aliases from identity. Unknown aliases stay explicit
 * and unresolved; they must not be conflated with a guessed base page. */
export function equipmentIdentityPayload(evidence: BasEquipmentEvidence, sources: BasSourceContext) {
  const aliases = pageAliases(sources);
  const sheet = (key: string) => aliases.get(key)?.page_id ?? key;
  return { ...evidence, tables: evidence.tables.map(t => ({ ...t, sheet: sheet(t.sheet),
    title: t.title ? { ...t.title, sheet: sheet(t.title.sheet) } : null,
    rows: t.rows.map(r => ({ ...r, sheet: sheet(r.sheet),
      // A graph revision marker has a nested navigation alias too. Its original
      // text/box/revision data remain unchanged and are not phase interpretation.
      ...(r.revision && typeof r.revision === 'object' && 'source' in r.revision
        && r.revision.source && typeof r.revision.source === 'object' && 'sheet' in r.revision.source
        && typeof r.revision.source.sheet === 'string'
        ? { revision: { ...r.revision, source: { ...r.revision.source, sheet: sheet(r.revision.source.sheet) } } } : {}),
    })),
    ...(t.parts ? { parts: t.parts.map(p => ({ ...p, sheet: sheet(p.sheet) })) } : {}),
  })) };
}

const normalizedHeader = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ').replace(/\.$/, '');
const markHeaders = new Set(['MARK', 'TAG', 'TAG NO', 'TAG NUMBER', 'ID', 'EQUIPMENT ID', 'EQUIPMENT TAG', 'EQUIP ID', 'UNIT TAG', 'UNIT MARK']);
const quantityHeaders = new Set(['QTY', 'QUANTITY', 'COUNT']);

export async function buildBasEquipmentCandidates(rawSources: unknown, rawEvidence: unknown) {
  const sources = basSourceContextSchema.parse(rawSources), evidence = basEquipmentEvidenceSchema.parse(rawEvidence);
  const aliases = pageAliases(sources), copies = new Map<string, number>();
  const identity = equipmentIdentityPayload(evidence, sources);
  const tables = [];
  for (let ti = 0; ti < evidence.tables.length; ti++) {
    const raw = evidence.tables[ti];
    const contentId = await sha256Hex(new TextEncoder().encode(canonicalBasJson(identity.tables[ti])));
    const copy = (copies.get(contentId) ?? 0) + 1; copies.set(contentId, copy);
    const table_id = `bas-equipment:${contentId}:copy${copy}`;
    const mark_columns = raw.headers.filter(h => markHeaders.has(normalizedHeader(h)));
    const quantity_columns = raw.headers.filter(h => quantityHeaders.has(normalizedHeader(h)));
    const rows = raw.rows.map((r, row_index) => {
      const issues: string[] = [];
      const page = aliases.get(r.sheet);
      if (!page) issues.push('unowned_row_source');
      if (!aliases.has(raw.sheet) || (raw.title && !aliases.has(raw.title.sheet))
        || raw.parts?.some(p => !aliases.has(p.sheet))) issues.push('unowned_table_source');
      if (mark_columns.length !== 1) issues.push(mark_columns.length ? 'ambiguous_mark_columns' : 'missing_mark_column');
      const mark = mark_columns.length === 1 ? r.cells[mark_columns[0]] : undefined;
      if (mark_columns.length === 1 && !mark) issues.push('missing_mark_cell');
      const membership = mark ? parseBasEquipmentMembership(mark.text) : null;
      if (membership?.status === 'unresolved') issues.push(`membership_${membership.reason}`);
      if (quantity_columns.length > 1) issues.push('ambiguous_quantity_columns');
      const quantity = quantity_columns.length === 1 ? r.cells[quantity_columns[0]] : undefined;
      if (quantity_columns.length === 1 && !quantity) issues.push('missing_quantity_cell');
      const printed_quantity = quantity ? parseBasPrintedCount(quantity.text) : null;
      if (printed_quantity?.status === 'unresolved') issues.push(`quantity_${printed_quantity.reason}`);
      if (printed_quantity?.value != null && membership?.members && printed_quantity.value !== membership.members.length) {
        issues.push('named_members_differ_from_printed_count');
      }
      return { occurrence_id: `${table_id}:r${row_index}`, table_id, row_index,
        source_id: page?.source_id ?? null, page_id: page?.page_id ?? null,
        mark_columns, quantity_columns, membership, printed_quantity,
        named_member_count: membership?.members?.length ?? null,
        installed_quantity: null, scope_status: 'not_established' as const,
        building_hint: r.building ?? raw.building ?? null, issues };
    });
    tables.push({ table_id, content_id: contentId, duplicate_copy: copy, raw, rows });
  }
  for (const table of tables) if ((copies.get(table.content_id) ?? 0) > 1) {
    table.rows.forEach(r => r.issues.push('duplicate_source_table'));
  }
  return { schema_version: 'bas_equipment_candidates_v1' as const, rule_version: evidence.rule_version,
    scope: evidence.scope, project_complete: false as const, tables };
}
export type BasEquipmentCandidates = Awaited<ReturnType<typeof buildBasEquipmentCandidates>>;
