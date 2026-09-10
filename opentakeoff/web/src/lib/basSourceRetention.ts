/** Shared source ownership/byte verification. Storage transports must not infer
 * drawing correspondence, calculation validity or approval from retained bytes. */
import { z } from 'zod';
import { verifyBasWorkflow, type BasWorkflow } from './basWorkflow.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const basRetainedSourceSchema = z.object({
  source_id: z.string().regex(/^sha256:[a-f0-9]{64}$/), sha256: digest,
  byte_length: z.number().int().positive().safe(), page_count: z.number().int().positive().safe(),
}).strict().refine(s => s.source_id === `sha256:${s.sha256}`, 'Source digest disagrees with identity');
export type BasRetainedSource = z.infer<typeof basRetainedSourceSchema>;
export interface BasSourceInventoryItem {
  source: BasRetainedSource;
  names: string[];
  capture_ids: string[];
}

/** All historical physical versions, NOT a reviewed current source set. Aliases
 * are lookup hints only; different versions with the same name remain distinct. */
export async function basSourceInventory(rawWorkflow: unknown): Promise<BasSourceInventoryItem[]> {
  return (await inspectBasSourceHistory(rawWorkflow)).inventory;
}

/** Return the owned verified history and inventory together, so a source-view
 * consumer need not verify the same complete historical calculations twice. */
export async function inspectBasSourceHistory(rawWorkflow: unknown) {
  const workflow = await verifyBasWorkflow(rawWorkflow);
  const sources = new Map<string, BasSourceInventoryItem>();
  for (const capture of workflow.captures) for (const { names, ...source } of capture.sources) {
    const item = sources.get(source.source_id);
    if (item && canonicalBasJson(item.source) !== canonicalBasJson(source)) {
      throw new Error('Conflicting physical metadata for one retained BAS source identity');
    }
    const next = item ?? { source, names: [], capture_ids: [] };
    next.names.push(...names);
    next.capture_ids.push(capture.capture_id);
    sources.set(source.source_id, next);
  }
  const inventory = [...sources.values()].sort((a, b) => a.source.source_id.localeCompare(b.source.source_id)).map(item => ({
    ...item, names: [...new Set(item.names)].sort(), capture_ids: [...new Set(item.capture_ids)].sort(),
  }));
  return { workflow, inventory };
}

function copyBytes(input: Uint8Array | ArrayBuffer): Uint8Array {
  if (input instanceof Uint8Array) return new Uint8Array(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0));
  throw new Error('Original BAS source must be PDF bytes, not a filename or encoded string');
}

/** Copy before awaiting: a caller/PDF worker cannot change or detach the bytes
 * after verification. Hash identity establishes bytes, not PDF interpretation. */
export async function verifyBasSourceBytes(rawSource: unknown, input: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const source = basRetainedSourceSchema.parse(rawSource), bytes = copyBytes(input);
  if (bytes.byteLength !== source.byte_length) throw new Error(`Original BAS source length mismatch: ${source.source_id}`);
  if (await sha256Hex(bytes) !== source.sha256) throw new Error(`Original BAS source digest mismatch: ${source.source_id}`);
  return bytes;
}

/** One source at a time bounds working memory; publishing an approved snapshot
 * will require a separate all-dependency atomic seal. This operation never seals. */
export async function prepareBasSourceRetention(rawWorkflow: BasWorkflow, sourceId: string, input: Uint8Array | ArrayBuffer) {
  const workflow = structuredClone(rawWorkflow), bytes = copyBytes(input);
  const item = (await basSourceInventory(workflow)).find(i => i.source.source_id === sourceId);
  if (!item) throw new Error('Original PDF is not owned by the requested BAS workflow');
  return {
    expected_workflow_json: canonicalBasJson(workflow),
    source: item.source,
    bytes: await verifyBasSourceBytes(item.source, bytes),
  };
}
