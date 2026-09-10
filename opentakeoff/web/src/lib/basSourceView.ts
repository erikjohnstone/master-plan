/** Shared, read-only source-view contract. Never selects a current drawing set,
 * changes a citation, or interprets a rendered image as takeoff evidence. */
import { z } from 'zod';
import { inspectBasSourceHistory } from './basSourceRetention.ts';
import { canonicalBasJson } from './basCanonical.ts';

const pageId = z.string().regex(/^sha256:[a-f0-9]{64}:p[1-9]\d*$/);
const box = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]);
export const basSourceViewRequestSchema = z.object({ page_id: pageId, bbox_px: box.optional() }).strict();
export type BasSourceViewRequest = z.infer<typeof basSourceViewRequestSchema>;

export async function prepareBasSourceView(rawWorkflow: unknown, rawRequest: unknown) {
  const request = basSourceViewRequestSchema.parse(rawRequest);
  const { workflow, inventory } = await inspectBasSourceHistory(rawWorkflow);
  const source_id = request.page_id.slice(0, request.page_id.lastIndexOf(':p'));
  const page_number = Number(request.page_id.slice(request.page_id.lastIndexOf(':p') + 2));
  const item = inventory.find(i => i.source.source_id === source_id);
  if (!item || !Number.isSafeInteger(page_number) || page_number > item.source.page_count) {
    throw new Error('Source page is not owned by saved BAS history');
  }
  if (item.source.byte_length > 512 * 1024 * 1024) throw new Error('Original PDF exceeds the 512 MiB source-review limit');
  let frame: { width_px: number; height_px: number; rotation: number } | null = null;
  for (const capture of workflow.captures) {
    const page = capture.narrative_sources?.pages.find(p => p.page_id === request.page_id);
    if (!page) continue;
    const next = { width_px: page.width_px, height_px: page.height_px, rotation: page.rotation };
    if (frame && canonicalBasJson(frame) !== canonicalBasJson(next)) throw new Error('Conflicting saved frames for the same original PDF page');
    frame = next;
  }
  if (request.bbox_px) {
    if (!frame) throw new Error('Saved page frame unavailable. Open the original page without a highlight; do not transfer this box to another version.');
    const [x0, y0, x1, y1] = request.bbox_px;
    if (!(x0 >= 0 && y0 >= 0 && x1 > x0 && y1 > y0 && x1 <= frame.width_px && y1 <= frame.height_px)) {
      throw new Error('Citation box is outside its original saved page frame');
    }
  }
  return { ...item, page_id: request.page_id, page_number, frame, bbox_px: request.bbox_px ?? null };
}
export type BasSourceView = Awaited<ReturnType<typeof prepareBasSourceView>>;

/** Call after exact byte verification and opening those bytes. No clipping,
 * rotation compensation or resize may make a mismatched frame appear valid. */
export function assertBasSourceViewFrame(view: BasSourceView, actual: {
  page_count: number; width_px: number; height_px: number; rotation: number;
}) {
  if (actual.page_count !== view.source.page_count) throw new Error('Original PDF page count disagrees with saved source metadata');
  if (!(Number.isFinite(actual.width_px) && actual.width_px > 0 && Number.isFinite(actual.height_px) && actual.height_px > 0
    && Number.isFinite(actual.rotation))) throw new Error('Original PDF page frame is invalid');
  if (view.frame && (actual.width_px !== view.frame.width_px || actual.height_px !== view.frame.height_px || actual.rotation !== view.frame.rotation)) {
    throw new Error('Original PDF page frame disagrees with saved evidence; no highlight was moved or rescaled');
  }
}

/** Display-only crop, separate from the unchanged citation. Bounded long edge
 * keeps huge construction sheets from allocating full-page high-DPI canvases. */
export function basSourceViewRegion(view: BasSourceView, width: number, height: number, focus: boolean) {
  if (!focus || !view.bbox_px) return { x0: 0, y0: 0, x1: width, y1: height };
  const [x0, y0, x1, y1] = view.bbox_px;
  const pad = Math.max(24, Math.min(Math.max(x1 - x0, y1 - y0) * 0.15, 120));
  return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(width, x1 + pad), y1: Math.min(height, y1 + pad) };
}
