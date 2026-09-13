/**
 * Display-only citation previews. The source bbox remains in production image
 * pixels; this module only chooses a surrounding crop and renders it for human
 * review. It never feeds pixels back into extraction or reconciliation.
 */

const finiteBox = (bbox) => Array.isArray(bbox) && bbox.length === 4
  && bbox.every((value) => Number.isFinite(value));

const centeredSpan = (center, size, limit) => {
  const bounded = Math.min(size, limit);
  const start = Math.max(0, Math.min(limit - bounded, center - bounded / 2));
  return [start, start + bounded];
};

export function citationPreviewRegion(bbox, width, height, { kind = 'plan' } = {}) {
  if (!finiteBox(bbox) || !(width > 0) || !(height > 0)) {
    throw new Error('Citation preview requires a finite bbox and positive page frame.');
  }
  const [x0, y0, x1, y1] = bbox;
  if (!(x1 > x0 && y1 > y0 && x0 >= 0 && y0 >= 0 && x1 <= width && y1 <= height)) {
    throw new Error('Citation bbox is outside the current source page.');
  }
  const boxWidth = x1 - x0, boxHeight = y1 - y0;
  if (kind === 'schedule') {
    // A schedule row can span thousands of pixels. Showing the entire width in
    // a half-screen card makes its tag unreadable, so lead with the authored
    // row identity and first columns; "Open on drawing" retains the full box.
    const cropWidth = Math.min(width, Math.max(1000, Math.min(1200, boxWidth + 240)));
    const cropHeight = Math.min(height, Math.max(340, boxHeight * 10));
    const rx0 = Math.max(0, Math.min(width - cropWidth, x0 - Math.min(120, cropWidth * 0.1)));
    const [ry0, ry1] = centeredSpan((y0 + y1) / 2, cropHeight, height);
    return { x0: rx0, y0: ry0, x1: rx0 + cropWidth, y1: ry1 };
  }
  // Tiny plan tags need nearby duct/equipment context; long schedule rows need
  // their headers and neighboring rows. Bounded multipliers preserve both.
  const cropWidth = Math.min(width, Math.max(520, boxWidth * 4, boxHeight * 5));
  const cropHeight = Math.min(height, Math.max(340, boxHeight * 8, boxWidth * 0.42));
  const [rx0, rx1] = centeredSpan((x0 + x1) / 2, cropWidth, width);
  const [ry0, ry1] = centeredSpan((y0 + y1) / 2, cropHeight, height);
  return { x0: rx0, y0: ry0, x1: rx1, y1: ry1 };
}

export async function renderPdfCitationPreview(page, bbox, { renderScale, color, kind = 'plan' }) {
  const original = page.getViewport({ scale: renderScale });
  const region = citationPreviewRegion(bbox, original.width, original.height, { kind });
  const regionWidth = region.x1 - region.x0, regionHeight = region.y1 - region.y0;
  const previewScale = Math.min(2, 1600 / regionWidth, 900 / regionHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(regionWidth * previewScale));
  canvas.height = Math.max(1, Math.round(regionHeight * previewScale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Citation preview canvas is unavailable.');
  const viewport = page.getViewport({
    scale: renderScale * previewScale,
    offsetX: -region.x0 * previewScale,
    offsetY: -region.y0 * previewScale,
  });
  const task = page.render({ canvasContext: context, viewport, background: '#ffffff' });
  await task.promise;
  const [x0, y0, x1, y1] = bbox;
  context.fillStyle = `${color}1f`;
  context.strokeStyle = color;
  context.lineWidth = Math.max(3, 2 * previewScale);
  context.fillRect((x0 - region.x0) * previewScale, (y0 - region.y0) * previewScale,
    (x1 - x0) * previewScale, (y1 - y0) * previewScale);
  context.strokeRect((x0 - region.x0) * previewScale, (y0 - region.y0) * previewScale,
    (x1 - x0) * previewScale, (y1 - y0) * previewScale);
  return {
    image_url: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    region,
  };
}
