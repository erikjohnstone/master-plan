// Node transport for the same source/frame contract used by the browser reader.
import { open } from 'node:fs/promises';
import { prepareBasSourceView, assertBasSourceViewFrame, basSourceViewRegion, type BasSourceViewRequest } from '../../web/src/lib/basSourceView.ts';
import { verifyBasSourceBytes } from '../../web/src/lib/basSourceRetention.ts';
import { openPdfBytes } from './pdf.ts';
import type { Session } from './session.ts';

export async function viewBasOriginalSource(session: Session, request: BasSourceViewRequest, options: {
  originalPath?: string; px?: number; signal?: AbortSignal;
} = {}) {
  const workflow = session.basWorkflow, files = JSON.stringify(session.files);
  const guard = () => {
    options.signal?.throwIfAborted();
    if (session.basWorkflow !== workflow || JSON.stringify(session.files) !== files) throw new Error('BAS source workspace changed during review; retry');
  };
  guard();
  if (!workflow) throw new Error('No saved BAS source history. Import the takeoff history before reviewing its original PDF.');
  const view = await prepareBasSourceView(workflow, request); guard();
  let bytes = await session.basOriginalBytes(view.source.sha256); guard();
  if (!bytes && options.originalPath) {
    // Explicit local path only; names inside saved history are never opened.
    const file = await open(options.originalPath, 'r');
    try {
      const info = await file.stat(); guard();
      if (!info.isFile() || info.size !== view.source.byte_length) throw new Error('Original PDF length mismatch or not a regular file');
      bytes = new Uint8Array(info.size); let done = 0;
      while (done < bytes.length) {
        guard();
        const { bytesRead } = await file.read(bytes, done, Math.min(1024 * 1024, bytes.length - done), done);
        if (!bytesRead) throw new Error('Original PDF changed or was truncated during reading');
        done += bytesRead;
      }
      const extra = await file.read(new Uint8Array(1), 0, 1, bytes.length);
      if (extra.bytesRead) throw new Error('Original PDF changed during reading');
    } finally { await file.close(); }
  }
  if (!bytes) throw new Error('Exact original PDF unavailable. Supply original_pdf_path; a newer namesake is not a substitute.');
  bytes = await verifyBasSourceBytes(view.source, bytes); guard();
  const doc = await openPdfBytes(bytes);
  let destroying: Promise<void> | undefined;
  const destroy = () => destroying ??= doc.destroy();
  const abort = () => { void destroy().catch(() => {}); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    guard();
    const page = await doc.page(view.page_number); guard();
    assertBasSourceViewFrame(view, { page_count: doc.numPages, width_px: page.viewport.width, height_px: page.viewport.height, rotation: page.rotate });
    const region = basSourceViewRegion(view, page.viewport.width, page.viewport.height, !!view.bbox_px);
    const px = Math.max(200, Math.min(2000, Math.round(options.px ?? 1400)));
    const result = await page.renderRegionPng(region, px, (ctx, toCanvas) => {
      if (!view.bbox_px) return;
      const context = ctx as { strokeStyle: string; lineWidth: number; strokeRect(x: number, y: number, w: number, h: number): void };
      const [x0, y0] = toCanvas(view.bbox_px[0], view.bbox_px[1]), [x1, y1] = toCanvas(view.bbox_px[2], view.bbox_px[3]);
      context.strokeStyle = '#1f3fc7'; context.lineWidth = 2; context.strokeRect(x0, y0, x1 - x0, y1 - y0);
    });
    guard();
    return { png: result.png, meta: { source_id: view.source.source_id, page_id: view.page_id, page: view.page_number,
      sheet_px: [page.viewport.width, page.viewport.height], original_bbox_px: view.bbox_px,
      region: [region.x0, region.y0, region.x1, region.y1], img_px: [result.width, result.height], zoom: result.zoom,
      source_byte_verification: 'verified_now', saved_frame_verification: view.frame ? 'verified_now' : 'legacy_frame_unavailable',
      read_only: true, added_to_active_set: false, overlay: false, project_complete: false } };
  } finally { options.signal?.removeEventListener('abort', abort); await destroy(); }
}
