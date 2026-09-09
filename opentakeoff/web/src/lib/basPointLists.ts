/** Shared wire validation for Python point observations. No browser arithmetic. */
import { z } from 'zod';

const id = z.string().min(1).max(512);
const count = z.number().int().nonnegative().safe();
const box = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine(b => b[2] >= b[0] && b[3] >= b[1], 'Unordered point source box');
const cell = z.object({ text: z.string(), bbox: box.nullable() }).strict();
const row = z.object({ key: z.string(), cells: z.record(cell) }).strict();
const table = z.object({ sheet: z.string(), title: cell.nullable(), headers: z.array(z.string()),
  region: box.nullable(), rows: z.array(row) }).strict();
const source = z.object({ source_id: id.nullable(), page_id: id.nullable(), sheet_key: id,
  column: z.string().nullable(), span_id: id.nullable(), text: z.string(), bbox_px: box.nullable() }).strict();
const note = z.object({ kind: z.enum(['controller_provided', 'lon_integrated']), subject: z.string(), source }).strict();
export const basPointListsSchema = z.object({
  schema_version: z.literal('bas_point_lists_v1'), rule_version: z.literal('point_observations_1'),
  scope: z.literal('discovered_matrices_only'), project_complete: z.literal(false), issues: z.array(z.string()),
  matrices: z.array(z.object({ matrix_id: id, source_id: id.nullable(), page_id: id.nullable(), raw: table,
    header_rows: count, header_sources: z.array(source), notes: z.array(note), issues: z.array(z.string()),
    quantity_basis: z.literal('listed_matrix_only'),
    rows: z.array(z.object({ row_id: id, local_key: z.string(), name: z.string(), raw: row,
      status: z.enum(['interpreted', 'unpopulated', 'no_typed_requirement', 'review_required']),
      observations: z.array(z.object({ kind: z.enum(['declared_io', 'software_value', 'attribute']), channel: z.string(),
        value: count.nullable(), status: z.enum(['read', 'ambiguous']), source }).strict()),
      qualifiers: z.array(note), issues: z.array(z.string()), uninterpreted_columns: z.array(z.string()),
      unobserved_columns: z.array(z.string()),
      field_wiring_status: z.literal('not_established'),
    }).strict()),
  }).strict()),
}).strict().superRefine((result, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const equalBox = (a: z.infer<typeof box> | null, b: z.infer<typeof box> | null) => JSON.stringify(a) === JSON.stringify(b);
  const equalCell = (s: z.infer<typeof source>, c: z.infer<typeof cell> | undefined) => !!c && s.text === c.text && equalBox(s.bbox_px, c.bbox);
  const rowKey = (r: z.infer<typeof row>) => JSON.stringify([r.key,
    Object.keys(r.cells).sort().map(k => [k, r.cells[k].text, r.cells[k].bbox])]);
  const matrixIds = new Set<string>(), rowIds = new Set<string>();
  for (const matrix of result.matrices) {
    if (matrixIds.has(matrix.matrix_id)) fail('Duplicate point matrix identity');
    matrixIds.add(matrix.matrix_id);
    if ((matrix.source_id === null) !== (matrix.page_id === null)
        || (matrix.source_id !== null && (!/^sha256:[a-f0-9]{64}$/.test(matrix.source_id)
        || !matrix.page_id?.startsWith(`${matrix.source_id}:p`)))) fail('Invalid point matrix source identity');
    if (matrix.header_rows > matrix.raw.rows.length) fail('Point header exceeds source rows');
    const owns = (s: z.infer<typeof source>) => {
      if (s.source_id !== matrix.source_id || s.page_id !== matrix.page_id || s.sheet_key !== matrix.raw.sheet) fail('Point evidence belongs to another matrix source');
      if (s.span_id !== null && (!s.page_id || !s.span_id.startsWith(`${s.page_id}:s`))) fail('Point span belongs to another page');
    };
    for (const s of matrix.header_sources) {
      owns(s);
      if (!matrix.header_rows || !s.column || !equalCell(s, matrix.raw.rows[0]?.cells[s.column])) fail('Point header evidence differs from source cell');
    }
    for (const n of matrix.notes) owns(n.source);
    const rawRows = new Map<string, number>();
    for (const r of matrix.raw.rows.slice(matrix.header_rows)) rawRows.set(rowKey(r), (rawRows.get(rowKey(r)) ?? 0) + 1);
    for (const r of matrix.rows) {
      if (rowIds.has(r.row_id)) fail('Duplicate point row identity');
      rowIds.add(r.row_id);
      const key = rowKey(r.raw), remaining = rawRows.get(key) ?? 0;
      if (!remaining || r.local_key !== r.raw.key) fail('Point row differs from its raw source');
      else rawRows.set(key, remaining - 1);
      const missing = new Set(matrix.raw.headers.filter(h => !Object.prototype.hasOwnProperty.call(r.raw.cells, h)));
      if (r.unobserved_columns.length !== missing.size || r.unobserved_columns.some(h => !missing.delete(h))) fail('Sparse point columns are not accounted for');
      if (r.status === 'interpreted' && (r.issues.length || matrix.issues.length)) fail('An unresolved point cannot be interpreted');
      const columns = new Set<string>();
      for (const observation of r.observations) {
        const s = observation.source;
        owns(s);
        if (!s.column || columns.has(s.column) || !equalCell(s, r.raw.cells[s.column])) fail('Point observation differs from source cell');
        if (s.column) columns.add(s.column);
        if ((observation.status === 'ambiguous') !== (observation.value === null)) fail('Point observation status/value disagree');
      }
      for (const n of r.qualifiers) {
        owns(n.source);
        if (!matrix.notes.some(note => JSON.stringify(note) === JSON.stringify(n))) fail('Point qualifier is not a retained matrix note');
      }
    }
    if ([...rawRows.values()].some(n => n !== 0)) fail('Point source rows were omitted');
  }
});

export type BasPointLists = z.infer<typeof basPointListsSchema>;

export const basPointListsOutputSchema = z.union([basPointListsSchema, z.object({
  schema_version: z.literal('bas_point_lists_v1'), status: z.literal('unavailable'),
  project_complete: z.literal(false), error: z.string(),
}).strict()]);
