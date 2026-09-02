/**
 * L1.5 — page tiling with overlap + affine transforms (SAHI-style slice/merge
 * on the shared vector path). Pure TS; maps tile-local coords back to page space.
 */
import type { Bbox } from "./sheetgraph.ts";

export interface PageTile {
  index: number;
  region: Bbox;
  /** Affine [a,b,c,d,e,f]: tile-local → page image px. */
  transform: number[];
  overlapPx: number;
}

export interface PageTileGridOpts {
  tileSize?: number;
  overlapFrac?: number;
  minPageDim?: number;
}

const DEFAULT_TILE = 2048;
const DEFAULT_OVERLAP = 0.35;
const DEFAULT_MIN = 2600;

/** Slice a page into overlapping tiles when either dimension exceeds minPageDim. */
export function slicePageTiles(
  width: number,
  height: number,
  opts: PageTileGridOpts = {},
): PageTile[] {
  const tileSize = opts.tileSize ?? DEFAULT_TILE;
  const overlapFrac = opts.overlapFrac ?? DEFAULT_OVERLAP;
  const minDim = opts.minPageDim ?? DEFAULT_MIN;
  if (width < minDim && height < minDim) return [];

  const overlapPx = Math.round(tileSize * overlapFrac);
  const stride = Math.max(1, tileSize - overlapPx);
  const tiles: PageTile[] = [];
  let index = 0;
  for (let y0 = 0; y0 < height; y0 += stride) {
    for (let x0 = 0; x0 < width; x0 += stride) {
      const x1 = Math.min(width, x0 + tileSize);
      const y1 = Math.min(height, y0 + tileSize);
      if (x1 - x0 < 120 || y1 - y0 < 80) continue;
      tiles.push({
        index: index++,
        region: [x0, y0, x1, y1],
        transform: [1, 0, 0, 1, x0, y0],
        overlapPx,
      });
      if (x1 >= width) break;
    }
    if (y0 + tileSize >= height) break;
  }
  return tiles;
}

/** Map a bbox from tile-local coordinates back to page space. */
export function tileLocalToPage(bbox: Bbox, tile: PageTile): Bbox {
  const [a, b, c, d, e, f] = tile.transform;
  const corners: [number, number][] = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[0], bbox[3]],
    [bbox[2], bbox[3]],
  ];
  const mapped = corners.map(([x, y]) => [a * x + c * y + e, b * x + d * y + f] as [number, number]);
  const xs = mapped.map((p) => p[0]);
  const ys = mapped.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Filter spans/segs to a tile region (page space). */
export function clipSpansToTile<T extends { x: number; y: number; w: number; h: number }>(
  spans: T[],
  tile: PageTile,
): T[] {
  const [x0, y0, x1, y1] = tile.region;
  return spans.filter((sp) => {
    const cx = sp.x + sp.w / 2;
    const cy = sp.y + sp.h / 2;
    return cx >= x0 && cx < x1 && cy >= y0 && cy < y1;
  }).map((sp) => ({
    ...sp,
    x: sp.x - x0,
    y: sp.y - y0,
  }));
}

export function clipSegsToTile(segs: number[], tile: PageTile): number[] {
  const [x0, y0, x1, y1] = tile.region;
  const out: number[] = [];
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const sx0 = segs[i];
    const sy0 = segs[i + 1];
    const sx1 = segs[i + 2];
    const sy1 = segs[i + 3];
    const mx = (sx0 + sx1) / 2;
    const my = (sy0 + sy1) / 2;
    if (mx >= x0 && mx < x1 && my >= y0 && my < y1) {
      out.push(sx0 - x0, sy0 - y0, sx1 - x0, sy1 - y0);
    }
  }
  return out;
}
