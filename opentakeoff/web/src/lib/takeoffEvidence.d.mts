/**
 * Type declaration for takeoffEvidence.mjs — the runtime authority stays the
 * JSDoc typedef in the .mjs itself; this is what TS-side importers (checkJs
 * stays off) see. normalizeBbox() in the .mjs always returns a 4-tuple, so
 * this is not a looser contract than the real return value, just a typed one.
 */
export type Bbox = [number, number, number, number];

export interface TakeoffEvidence {
  page: number;
  bbox: Bbox;
  layer: string;
  kind: string;
  rawIds: string[];
  rawText: string;
  confidence: number;
}

export interface EvidenceCell {
  bbox?: number[] | null;
  spanIds?: string[];
  text?: string;
}

export interface EvidenceTitle {
  bbox?: number[] | null;
  text?: string;
}

export interface EvidenceRow {
  key?: string;
  cells?: Record<string, EvidenceCell>;
}

export function cellEvidence(opts: {
  sheetKey: string;
  tableId: number | string;
  rowKey: string;
  colKey: string;
  cell?: EvidenceCell | null;
  layer?: string;
  kind?: string;
}): TakeoffEvidence;

export function titleEvidence(
  sheetKey: string,
  tableId: number | string,
  title: EvidenceTitle | null | undefined,
  layer?: string,
): TakeoffEvidence;

export function rowEvidence(
  sheetKey: string,
  tableId: number | string,
  row: EvidenceRow,
  layer?: string,
): TakeoffEvidence;

export function normalizeTakeoffTag(raw: unknown): string;

export const TAG_PATTERN: RegExp;
