/** Shared read-only delivery projection, no interpretation or quantity math. */
import { basRevisionViewPageSchema, basRevisionViewQuerySchema } from './basRevisionTransportContract.ts';
import { verifyBasWorkflow } from './basWorkflow.ts';
import { replayBasDrawingHistory } from './basDrawingRevision.ts';
import { defaultBasRevisionBasis } from './basRevisionBasis.ts';
type Value = null | boolean | number | string | Value[] | { [key: string]: Value };
const type = (v: Value) => v === null ? 'null' as const : Array.isArray(v) ? 'array' as const : typeof v as 'string' | 'number' | 'boolean' | 'object';
const size = (v: Value) => typeof v === 'string' || Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
const preview = (v: Value) => typeof v === 'string' ? v.slice(0, 256) : v !== null && typeof v === 'object' ? null : v;
function summary(v: Value) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const values: Record<string, ReturnType<typeof preview>> = {};
  for (const key of ['row_id', 'item_id', 'capture_id', 'source_set_id', 'event_id', 'kind', 'label', 'name', 'disposition', 'status', 'dimension', 'delta'])
    if (Object.prototype.hasOwnProperty.call(v, key) && (v[key] === null || typeof v[key] !== 'object')) values[key] = preview(v[key]);
  for (const side of ['before', 'after']) {
    const item = v[side];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      if (typeof item.label === 'string') values[`${side}_label_preview`] = preview(item.label);
      if (typeof item.item_id === 'string') values[`${side}_item_id`] = item.item_id;
    }
  }
  return values;
}
export function readBasRevisionView(root: unknown, rawQuery: unknown = {}) {
  const q = basRevisionViewQuerySchema.parse(rawQuery);
  let node = root as Value;
  for (const key of q.path) {
    if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, key)
      || (Array.isArray(node) && typeof key !== 'number') || (!Array.isArray(node) && typeof key !== 'string'))
      throw new Error('Revision view path is not an owned field or array index');
    node = (node as Record<string | number, Value>)[key];
  }
  const entries = node && typeof node === 'object'
    ? (Array.isArray(node) ? node.slice(q.offset, q.offset + q.limit).map((v, i) => [i + q.offset, v] as const)
      : Object.keys(node).slice(q.offset, q.offset + q.limit).map(k => [k, node[k]] as const)) : [];
  return basRevisionViewPageSchema.parse({ path: q.path, type: type(node), total: size(node), offset: q.offset, limit: q.limit,
    string_offset: q.string_offset, string_length: typeof node === 'string' ? node.length : 0,
    string_fragment: typeof node === 'string' ? node.slice(q.string_offset, q.string_offset + q.string_limit) : null,
    scalar: typeof node === 'object' || typeof node === 'string' ? null : node,
    entries: entries.map(([key, value]) => ({ key, type: type(value), size: size(value), scalar_preview: preview(value),
      preview_truncated: typeof value === 'string' && value.length > 256, summary: summary(value) })),
    paging_units: 'container_entries_or_utf16_string_units' });
}
export async function inspectBasRevisionVersions(raw: unknown, sourceSetId?: string) {
  const workflow = await verifyBasWorkflow(raw), replay = replayBasDrawingHistory(workflow.captures, workflow.drawing_events);
  const collections = ['review_events', 'equipment_events', 'assembly_events', 'engineering_events', 'assignment_calculations', 'assembly_calculations'] as const;
  const versions = new Map<string, Record<typeof collections[number], { id: string; created_at: string }[]>>(
    workflow.captures.map(c => [c.capture_id, { review_events: [], equipment_events: [], assembly_events: [], engineering_events: [], assignment_calculations: [], assembly_calculations: [] }]));
  for (const key of collections) for (const e of workflow[key] || []) {
    const captureId = 'capture_id' in e ? e.capture_id : e.result.capture_id;
    versions.get(captureId)?.[key].push({ id: 'event_id' in e ? e.event_id : e.calculation_id, created_at: e.created_at });
  }
  return { approved: false, source_bytes: 'not_verified', journal_head: workflow.revision_events?.at(-1)?.event_id ?? null,
    source_sets: [...replay.source_sets.values()].map(s => ({ source_set_id: s.source_set_id, name: s.name, page_count: s.pages.length })),
    selected_basis: sourceSetId ? defaultBasRevisionBasis(workflow, sourceSetId) : null,
    versions: workflow.captures.map(c => ({ capture_id: c.capture_id, name: c.sources[0].names[0], ...versions.get(c.capture_id) })),
    saved_comparisons: workflow.revision_events || [], replay_status: 'not_replayed_inspection_only' };
}
