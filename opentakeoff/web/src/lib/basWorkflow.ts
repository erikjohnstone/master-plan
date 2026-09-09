/** Shared BAS evidence persistence. No extraction, installed counts or approvals. */
import { z } from 'zod';
import { basPointListsSchema, type BasPointLists } from './basPointLists.ts';
import { sha256Hex } from './graphKeys.js';
import type { BasSourceDocument } from './basSources.ts';

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const source = z.object({
  source_id: z.string().regex(/^sha256:[a-f0-9]{64}$/), sha256: sha,
  byte_length: z.number().int().positive().safe(), page_count: z.number().int().positive().safe(),
  names: z.array(z.string().min(1).max(4096)).min(1).max(1024),
}).strict().refine(s => s.source_id === `sha256:${s.sha256}`, 'Source digest disagrees with identity');
const capture = z.object({
  capture_id: sha, sources: z.array(source).min(1).max(10000), points: basPointListsSchema,
}).strict().superRefine((c, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const docs = new Map(c.sources.map(s => [s.source_id, s]));
  if (docs.size !== c.sources.length) fail('Duplicate capture source');
  for (const matrix of c.points.matrices) {
    const doc = matrix.source_id ? docs.get(matrix.source_id) : undefined;
    const page = matrix.page_id?.match(/:p([1-9]\d*)$/)?.[1];
    if (!doc || !page || matrix.page_id !== `${doc.source_id}:p${page}` || Number(page) > doc.page_count) {
      fail('Point matrix is not owned by a retained source page');
    }
  }
});
export const basWorkflowSchema = z.object({
  schema_version: z.literal('bas_workflow_v1'), revision: z.literal('point_captures_1'),
  captures: z.array(capture).max(1000), current_capture_id: sha.nullable(),
}).strict().superRefine((w, ctx) => {
  const ids = new Set(w.captures.map(c => c.capture_id));
  if (ids.size !== w.captures.length || (w.current_capture_id !== null && !ids.has(w.current_capture_id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid BAS capture references' });
  }
});
export type BasWorkflow = z.infer<typeof basWorkflowSchema>;
export type BasCapture = BasWorkflow['captures'][number];

export function canonicalBasJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalBasJson).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalBasJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new Error('BAS fingerprint requires finite JSON data');
}

/** Replace ONLY navigation aliases, never raw source strings or local row keys. */
function identityPayload(c: Omit<BasCapture, 'capture_id'>) {
  const points = structuredClone(c.points);
  for (const m of points.matrices) {
    m.raw.sheet = m.page_id!;
    const remap = (s: { sheet_key: string; page_id: string | null }) => { s.sheet_key = s.page_id!; };
    m.header_sources.forEach(remap);
    m.notes.forEach(n => remap(n.source));
    m.rows.forEach(r => { r.observations.forEach(o => remap(o.source)); r.qualifiers.forEach(n => remap(n.source)); });
  }
  return { sources: c.sources.map(({ names: _names, ...s }) => s).sort((a, b) => a.source_id < b.source_id ? -1 : 1), points };
}
const fingerprint = (c: Omit<BasCapture, 'capture_id'>) => sha256Hex(new TextEncoder().encode(canonicalBasJson(identityPayload(c))));

export async function captureBasPoints(sources: BasSourceDocument[], points: BasPointLists): Promise<BasWorkflow> {
  const checked = capture.parse({ capture_id: '0'.repeat(64), sources, points });
  checked.capture_id = await fingerprint(checked);
  return { schema_version: 'bas_workflow_v1', revision: 'point_captures_1', captures: [checked], current_capture_id: checked.capture_id };
}

export async function verifyBasWorkflow(raw: unknown): Promise<BasWorkflow> {
  const result = basWorkflowSchema.parse(raw);
  for (const c of result.captures) if (await fingerprint(c) !== c.capture_id) throw new Error('BAS capture fingerprint mismatch; saved evidence was changed');
  return result;
}

/** Synchronous structure/merge gate; callers verify fingerprints before use. */
export function mergeBasWorkflows(current: unknown, incoming: unknown, activateIncoming = false): BasWorkflow | null {
  const left = current == null ? null : basWorkflowSchema.parse(current);
  const right = incoming == null ? null : basWorkflowSchema.parse(incoming);
  if (!left) return right;
  if (!right) return left;
  const merged = new Map(left.captures.map(c => [c.capture_id, c]));
  for (const c of right.captures) {
    const old = merged.get(c.capture_id);
    if (old && canonicalBasJson(identityPayload(old)) !== canonicalBasJson(identityPayload(c))) throw new Error('Conflicting BAS evidence for one capture identity');
    if (!old) merged.set(c.capture_id, c);
  }
  return basWorkflowSchema.parse({ ...left, captures: [...merged.values()],
    current_capture_id: activateIncoming ? right.current_capture_id : left.current_capture_id ?? right.current_capture_id });
}

export function activeBasCapture(workflow: BasWorkflow | null | undefined) {
  return workflow?.captures.find(c => c.capture_id === workflow.current_capture_id) ?? null;
}

/** Byte-bound source navigation shared by browser and headless consumers.
 * Inputs must describe actual loaded bytes, not filename metadata supplied by an import. */
export function resolveBasPage(pageId: string, loaded: Array<{ name: string; sha256: string }>): string | null {
  const match = /^sha256:([a-f0-9]{64}):p([1-9]\d*)$/.exec(pageId);
  if (!match || !Number.isSafeInteger(Number(match[2]))) return null;
  const names = loaded.filter(d => d.sha256 === match[1]).map(d => d.name).sort();
  return names.length ? `${names[0]}${match[2] === '1' ? '' : `#${match[2]}`}` : null;
}
