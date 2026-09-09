// Test-local descriptions of dictionaries constructed dynamically by the
// existing JavaScript implementation. These types emit no executable code and
// do not change the production contract or the intentionally minimal fixtures.
export interface FixtureCell {
  text: string;
  bbox: number[] | null;
}
export interface FixtureFamilyItem {
  tag: string;
  quantity: number;
  scheduled_qty: number | null;
  installed_qty: number | null;
  status: string | null;
  qty_kind: string;
  unit: string;
  sheet_id: string;
  table_title: string;
  bbox_px: number[] | null;
  row_bbox_px: number[] | null;
  table_bbox_px: number[] | null;
  title_bbox_px: number[] | null;
  description: string | null;
  building: string | null;
  cells: Record<string, FixtureCell>;
}
export interface FixtureFamilyCategory {
  count: number;
  tolerance: number;
  building: Record<string, number>;
  provenance: string;
  items: FixtureFamilyItem[];
}
export type FixtureCategories = Record<string, FixtureFamilyCategory>;
