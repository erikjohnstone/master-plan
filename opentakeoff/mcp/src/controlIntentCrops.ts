// CONTROL INTENT goal, WP3.3: rendering R2's crops from PDFs on disk (MCP
// and the evals). The crop's spec is shared (web/src/lib/controlIntent/
// readers/r2.ts cropSpec); only drawing its pixels is surface-specific.
//
// SHOULD THIS BE ON THE SHARED PATH? The spec is; this renderer is the MCP
// surface's (the browser draws the same spec with its own pdf.js canvas).
import { createRequire } from "node:module";
import { openPdf, type DocHandle } from "./pdf.ts";
import type { CropRenderer, CropSpec } from "../../web/src/lib/controlIntent/readers/r2.ts";

const require = createRequire(import.meta.url);

/** A renderer over PDFs on disk; `pdfPath(file)` maps a sheet id's file
 * ("set.pdf" of "set.pdf#14") to its path, or null. */
export function pdfCropRenderer(pdfPath: (file: string) => string | null): CropRenderer & { close(): Promise<void> } {
  const docs = new Map<string, Promise<DocHandle>>();
  const render = async (spec: CropSpec): Promise<string | null> => {
    const hash = spec.sheet.lastIndexOf("#");
    const file = hash >= 0 ? spec.sheet.slice(0, hash) : spec.sheet;
    const page = hash >= 0 ? Number(spec.sheet.slice(hash + 1)) : 1;
    const path = pdfPath(file);
    if (!path || !Number.isInteger(page)) return null;
    if (!docs.has(path)) docs.set(path, openPdf(path));
    const doc = await docs.get(path)!;
    const ph = await doc.page(page);
    try {
      const [x0, y0, x1, y1] = spec.region;
      const r = await ph.renderRegionPng({ x0, y0, x1, y1 }, spec.long_edge);
      let png: Buffer = Buffer.from(r.png);
      if (spec.rotate) {
        const napi = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
        const img = await napi.loadImage(png);
        const quarter = spec.rotate === 90 || spec.rotate === 270;
        const w = quarter ? img.height : img.width, h = quarter ? img.width : img.height;
        const c = napi.createCanvas(w, h);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.translate(w / 2, h / 2);
        ctx.rotate((-spec.rotate * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        png = c.toBuffer("image/png");
      }
      return `data:image/png;base64,${png.toString("base64")}`;
    } finally {
      ph.cleanup?.();
    }
  };
  return Object.assign(render, {
    async close() { for (const d of docs.values()) await (await d).destroy(); docs.clear(); },
  });
}
