/**
 * Type declaration for queryTable.mjs (checkJs stays off for the .mjs itself;
 * this is the runtime-agnostic contract its one TS importer — mcp/src/tools.ts
 * — type-checks against). Field names mirror mcp/src/outputs.ts's
 * queryTableOutput Zod schema; keep the two in sync by hand.
 */
export type Bbox = [number, number, number, number];

export interface QueryTableCell {
  text: string;
  bbox: Bbox;
}

export interface QueryTableMatch {
  sheet: string;
  kind: string;
  title: { text: string; bbox: Bbox } | null;
  region: Bbox;
  headers: string[];
  family_mark?: boolean;
  row: {
    key: string;
    identity: { header: string; text: string; bbox: Bbox } | null;
    family_mark?: boolean;
    cells: Record<string, QueryTableCell>;
    all_cells: Record<string, QueryTableCell>;
  };
}

export interface QueryTableSuccess {
  query: {
    title: string | null;
    row_key: string | null;
    column: string | null;
    cell_value: string | null;
    cell_contains: string | null;
  };
  count: number;
  truncated: boolean;
  matches: QueryTableMatch[];
  building_tag_counts?: Record<string, number>;
  point_type_counts?: Record<string, number>;
  next_move?: string;
}

export interface QueryTableError {
  error: string;
}

export type QueryTableResult = QueryTableSuccess | QueryTableError;

export function queryTable(
  graph: unknown,
  opts?: {
    title?: string;
    row_key?: string;
    column?: string;
    cell_value?: string;
    cell_contains?: string;
    limit?: number;
  },
): QueryTableResult;
