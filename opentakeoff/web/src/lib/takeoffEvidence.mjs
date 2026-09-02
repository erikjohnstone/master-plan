/**
 * Grounded EVIDENCE objects for out/<file>.takeoff.json (shared path).
 */
import { parseSheetKey } from "./sheetKey.ts";

/** @typedef {{ page: number, bbox: [number,number,number,number], layer: string, kind: string, rawIds: string[], rawText: string, confidence: number }} TakeoffEvidence */

/**
 * @param {object} opts
 * @returns {TakeoffEvidence}
 */
export function cellEvidence(opts) {
  const {
    sheetKey,
    tableId,
    rowKey,
    colKey,
    cell,
    layer = "L5",
    kind = "cell",
  } = opts;
  const { page } = parseSheetKey(sheetKey);
  const bbox = normalizeBbox(cell?.bbox);
  const spanIds = cell?.spanIds || [];
  const rawIds = [
    `table:${tableId}:r:${sanitizeId(rowKey)}:c:${sanitizeId(colKey)}`,
    ...spanIds,
  ];
  return {
    page,
    bbox,
    layer,
    kind,
    rawIds,
    rawText: String(cell?.text || "").trim(),
    confidence: bbox ? 0.9 : 0.55,
  };
}

export function titleEvidence(sheetKey, tableId, title, layer = "L2") {
  const { page } = parseSheetKey(sheetKey);
  const bbox = normalizeBbox(title?.bbox);
  return {
    page,
    bbox,
    layer,
    kind: "header",
    rawIds: [`table:${tableId}:title`],
    rawText: String(title?.text || "").trim(),
    confidence: bbox ? 0.88 : 0.5,
  };
}

export function rowEvidence(sheetKey, tableId, row, layer = "L5") {
  const { page } = parseSheetKey(sheetKey);
  const cells = Object.values(row?.cells || {});
  const bboxes = cells.map((c) => normalizeBbox(c?.bbox)).filter((b) => b[2] > b[0]);
  const bbox = unionBbox(bboxes) || [0, 0, 0, 0];
  return {
    page,
    bbox,
    layer,
    kind: "row",
    rawIds: [`table:${tableId}:r:${sanitizeId(row.key)}`],
    rawText: String(row.key || "").trim(),
    confidence: bbox[2] > bbox[0] ? 0.85 : 0.5,
  };
}

function sanitizeId(s) {
  return String(s || "").replace(/\s+/g, "_").slice(0, 48) || "row";
}

function normalizeBbox(b) {
  if (!Array.isArray(b) || b.length !== 4) return [0, 0, 0, 0];
  return [b[0], b[1], b[2], b[3]];
}

function unionBbox(boxes) {
  if (!boxes.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b[0]);
    y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[2]);
    y1 = Math.max(y1, b[3]);
  }
  return [x0, y0, x1, y1];
}

/** Normalize tag for matching — preserve original separately in evidence. */
export function normalizeTakeoffTag(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, "").toUpperCase();
}

export const TAG_PATTERN = /^[A-Z]{1,5}[- .]?\d+(?:[- .]\d+[A-Z]?)*$/i;
