/** Shared source contract for BAS narrative/table consumers (UI and MCP).
 * SHOULD THIS BE ON THE SHARED PATH? Yes: source identity and evidence frames.
 * This accounts for available text; it does not discover or interpret SOO.
 */
import { z } from 'zod';

const finite = z.number().finite();
const positiveInteger = z.number().int().positive().safe();
const spanSchema = z.object({
  str: z.string(), x0: finite, y0: finite, x1: finite, y1: finite,
  rot: finite.optional(),
}).strict().refine(s => s.x1 >= s.x0 && s.y1 >= s.y0, 'Unordered source span');
const pageSchema = z.object({
  page_number: positiveInteger, sheet_key: z.string().min(1),
  width_px: finite.positive(), height_px: finite.positive(), rotation: finite,
  spans: z.array(spanSchema),
}).strict();
const documentSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/), byte_length: positiveInteger,
  name: z.string().min(1), page_count: positiveInteger,
  pages: z.array(pageSchema),
}).strict().superRefine((d, ctx) => {
  const numbers = d.pages.map(p => p.page_number).sort((a, b) => a - b);
  if (numbers.length !== d.page_count || numbers.some((n, i) => n !== i + 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Every loaded page must be represented exactly once' });
  }
});

export type BasSourceDocumentInput = z.infer<typeof documentSchema>;
export interface BasSourceDocument {
  source_id: string;
  sha256: string;
  byte_length: number;
  page_count: number;
  names: string[];
}
export interface BasSourceSpan {
  span_id: string;
  /** Index in the existing textSpans adapter output, not a raw PDF glyph ID. */
  source_index: number;
  text: string;
  bbox_px: [number, number, number, number];
  rotation?: number;
}
export interface BasSourcePage {
  page_id: string;
  source_id: string;
  page_number: number;
  sheet_keys: string[];
  width_px: number;
  height_px: number;
  rotation: number;
  text_status: 'available' | 'no_text';
  spans: BasSourceSpan[];
}
export interface BasSourceContext {
  schema_version: 'bas_sources_v1';
  adapter: 'session_text_spans_v1';
  coordinate_frame: 'image_px';
  scope: 'available_pdf_text_only';
  documents: BasSourceDocument[];
  pages: BasSourcePage[];
}

/** Shared persisted-source validation. IDs are checked against their actual
 * owner/index, never accepted merely because they have a plausible prefix. */
const sourceId = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sourceBox = z.tuple([finite, finite, finite, finite]).refine(b => b[2] >= b[0] && b[3] >= b[1], 'Unordered source box');
export const basSourceContextSchema = z.object({
  schema_version: z.literal('bas_sources_v1'), adapter: z.literal('session_text_spans_v1'),
  coordinate_frame: z.literal('image_px'), scope: z.literal('available_pdf_text_only'),
  documents: z.array(z.object({ source_id: sourceId, sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byte_length: positiveInteger, page_count: positiveInteger,
    names: z.array(z.string().min(1).max(4096)).min(1).max(1024) }).strict()).max(10000),
  pages: z.array(z.object({ page_id: z.string().min(1).max(512), source_id: sourceId,
    page_number: positiveInteger, sheet_keys: z.array(z.string().min(1).max(4096)).min(1).max(1024),
    width_px: finite.positive(), height_px: finite.positive(), rotation: finite,
    text_status: z.enum(['available', 'no_text']),
    spans: z.array(z.object({ span_id: z.string().min(1).max(512), source_index: z.number().int().nonnegative().safe(),
      text: z.string().max(1000000), bbox_px: sourceBox, rotation: finite.optional() }).strict()).max(200000),
  }).strict()).max(25000),
}).strict().superRefine((context, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const docs = new Map(context.documents.map(d => [d.source_id, d]));
  if (docs.size !== context.documents.length) fail('Duplicate source document');
  const aliases = new Set<string>(), pageIds = new Set<string>(), sheets = new Set<string>();
  for (const doc of context.documents) {
    if (doc.source_id !== `sha256:${doc.sha256}`) fail('Source digest disagrees with document identity');
    for (const name of doc.names) { if (aliases.has(name)) fail('Duplicate source alias'); aliases.add(name); }
    const pages = context.pages.filter(p => p.source_id === doc.source_id).map(p => p.page_number).sort((a, b) => a - b);
    if (pages.length !== doc.page_count || pages.some((n, i) => n !== i + 1)) fail('Source pages are missing or duplicated');
  }
  for (const page of context.pages) {
    if (!docs.has(page.source_id) || page.page_id !== `${page.source_id}:p${page.page_number}` || pageIds.has(page.page_id)) fail('Invalid source page ownership');
    pageIds.add(page.page_id);
    for (const key of page.sheet_keys) { if (sheets.has(key)) fail('Duplicate source sheet key'); sheets.add(key); }
    if (page.text_status !== (page.spans.some(s => s.text.trim()) ? 'available' : 'no_text')) fail('Source text availability disagrees with spans');
    page.spans.forEach((s, i) => { if (s.source_index !== i || s.span_id !== `${page.page_id}:s${i}`) fail('Invalid source span ownership/order'); });
  }
});

/** A fresh, validated snapshot. No source/geometry mutation or text rewriting.
 * IDs are version-scoped. Cross-version equipment identity is a separate job.
 */
export function buildBasSourceContext(raw: unknown): BasSourceContext {
  const inputs = z.array(documentSchema).parse(raw);
  const documents = new Map<string, BasSourceDocument>();
  const pages = new Map<string, BasSourcePage>();
  const pageContent = new Map<string, string>();
  const aliasOwners = new Map<string, string>();
  const sheetOwners = new Map<string, string>();
  for (const d of inputs) {
    const source_id = `sha256:${d.sha256}`;
    const aliasOwner = aliasOwners.get(d.name);
    if (aliasOwner && aliasOwner !== source_id) throw new Error('One filename cannot identify two loaded source versions');
    aliasOwners.set(d.name, source_id);
    const old = documents.get(source_id);
    if (old && (old.byte_length !== d.byte_length || old.page_count !== d.page_count)) {
      throw new Error('Conflicting metadata for one source version');
    }
    const document = old ?? { source_id, sha256: d.sha256, byte_length: d.byte_length, page_count: d.page_count, names: [] };
    if (!document.names.includes(d.name)) document.names.push(d.name);
    documents.set(source_id, document);
    for (const p of d.pages) {
      const page_id = `${source_id}:p${p.page_number}`;
      const sheetOwner = sheetOwners.get(p.sheet_key);
      if (sheetOwner && sheetOwner !== page_id) throw new Error('One sheet key cannot identify two source pages');
      sheetOwners.set(p.sheet_key, page_id);
      const content = JSON.stringify([p.width_px, p.height_px, p.rotation,
        p.spans.map(s => [s.str, s.x0, s.y0, s.x1, s.y1, s.rot !== undefined, s.rot ?? 0])]);
      if (pageContent.has(page_id) && pageContent.get(page_id) !== content) {
        throw new Error('Conflicting text or geometry for one source page');
      }
      pageContent.set(page_id, content);
      const previous = pages.get(page_id);
      if (previous) {
        if (!previous.sheet_keys.includes(p.sheet_key)) previous.sheet_keys.push(p.sheet_key);
        continue;
      }
      pages.set(page_id, {
        page_id, source_id, page_number: p.page_number, sheet_keys: [p.sheet_key],
        width_px: p.width_px, height_px: p.height_px, rotation: p.rotation,
        text_status: p.spans.some(s => s.str.trim()) ? 'available' : 'no_text',
        spans: p.spans.map((s, i) => ({ span_id: `${page_id}:s${i}`, source_index: i,
          text: s.str, bbox_px: [s.x0, s.y0, s.x1, s.y1], ...(s.rot !== undefined ? { rotation: s.rot } : {}) })),
      });
    }
  }
  for (const d of documents.values()) d.names.sort();
  for (const p of pages.values()) p.sheet_keys.sort();
  const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return { schema_version: 'bas_sources_v1', adapter: 'session_text_spans_v1',
    coordinate_frame: 'image_px', scope: 'available_pdf_text_only',
    documents: [...documents.values()].sort((a, b) => compareId(a.source_id, b.source_id)),
    pages: [...pages.values()].sort((a, b) => compareId(a.source_id, b.source_id) || a.page_number - b.page_number),
  };
}
