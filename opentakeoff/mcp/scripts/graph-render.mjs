// Render a corpus set's sheets for HUMAN (or vision) labelling — the other
// half of the eval loop. The parser reads the text layer; a key read off
// these renders is an INDEPENDENT channel, which is the only thing that makes
// the score mean anything.
//
//   node --import tsx scripts/graph-render.mjs <corpus-dir> <setId> [--bands N]
//   node --import tsx scripts/graph-render.mjs <corpus-dir> --pdf <path> [label] [--bands N]
//
// The --pdf form is the look-before-you-register escape hatch: any PDF on
// disk (a bulk document not yet in sets.json) can be rendered without a
// sets.json entry first. [label] names the output files (default: the PDF's
// own basename); the registered-setId form below is completely unchanged.
//
// Writes renders/<setId>-<sheet>-<n>.png. Schedule sheets are cropped to the
// tables the graph found (plus generous margin) and split into horizontal
// bands so the type stays legible; plan sheets render whole.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { resolveSetFiles } from "./corpusFiles.mjs";
import { Session } from "../src/session.ts";

const args = process.argv.slice(2);
const pdfArgIdx = args.indexOf("--pdf");
const pdfPath = pdfArgIdx >= 0 ? args[pdfArgIdx + 1] : null;
const positional = args.filter((a, i) => !a.startsWith("--") && !(pdfArgIdx >= 0 && i === pdfArgIdx + 1));
const [corpusDir, setIdArg] = positional;
const bandsArg = args.indexOf("--bands");
const BANDS = bandsArg >= 0 ? Number(args[bandsArg + 1]) : 3;
if (!corpusDir || (!pdfPath && !setIdArg)) {
  console.error(
    "usage: node --import tsx scripts/graph-render.mjs <corpus-dir> <setId> [--bands N]\n"
    + "       node --import tsx scripts/graph-render.mjs <corpus-dir> --pdf <path> [label] [--bands N]",
  );
  process.exit(2);
}
const corpus = resolve(corpusDir);

let files, setId;
if (pdfPath) {
  // Escape hatch: an arbitrary PDF path, not a registered set — nothing else
  // below (region-cropping, banding, filename slugging) needs to know that.
  files = [resolve(pdfPath)];
  setId = setIdArg || basename(pdfPath).replace(/\.pdf$/i, "");
} else {
  const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));
  const set = spec.sets.find((s) => s.id === setIdArg);
  if (!set) { console.error(`no set "${setIdArg}"`); process.exit(2); }
  setId = setIdArg;
  files = resolveSetFiles(corpus, spec, set);
}
const outDir = join(corpus, "renders");
mkdirSync(outDir, { recursive: true });

const s = new Session();
for (let i = 0; i < files.length; i++) await s.loadPlan(files[i], { merge: i > 0 });
const g = await s.sheetGraph();

const sheetOf = (key) => s.sheet(key);
const slug = (k) => {
  // keep the PAGE: a combined single-file set has every sheet under one file
  // name, and dropping the "#N" made every render overwrite the last.
  const page = /#(\d+)$/.exec(k)?.[1] ?? "1";
  const base = k.replace(/#\d+$/, "").replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(-24);
  return `${base}-p${page}`;
};
const tableSlug = (title, kind, index) => {
  const label = (title || kind || "untitled")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 64) || "untitled";
  return `${String(index + 1).padStart(2, "0")}-${label}`;
};

// every table region the graph found, per sheet
const regions = new Map();
for (const sh of g.sheets) {
  for (const t of sh.schedules) {
    if (!regions.has(sh.sheet)) regions.set(sh.sheet, []);
    regions.get(sh.sheet).push({ kind: t.kind, title: t.title, region: t.region });
  }
}

let n = 0;
for (const sh of g.sheets) {
  const page = sheetOf(sh.sheet).page;
  const tables = regions.get(sh.sheet) ?? [];
  if (!tables.length) {
    if (!process.argv.includes("--all")) continue;
    // no table found here — render the WHOLE sheet, because "the graph saw
    // nothing" is exactly the case a label needs to check
    const png = await page.renderPng(0.5);
    const p = join(outDir, `${setId}--${slug(sh.sheet)}--full.png`);
    writeFileSync(p, png);
    console.log(`${p}   (${sh.role}, no tables found)`);
    n++;
    continue;
  }
  for (const [tableIndex, t] of tables.entries()) {
    const r = t.region;
    const pad = 40;
    const y0 = Math.max(0, r.y0 - pad), y1 = r.y1 + pad;
    const x0 = Math.max(0, r.x0 - pad), x1 = r.x1 + pad;
    const h = (y1 - y0) / BANDS;
    for (let b = 0; b < BANDS; b++) {
      const by0 = y0 + b * h, by1 = b === BANDS - 1 ? y1 : y0 + (b + 1) * h + 12;
      const out = await page.renderRegionPng({ x0, y0: by0, x1, y1: by1 }, 2400);
      const p = join(outDir, `${setId}--${slug(sh.sheet)}--${tableSlug(t.title, t.kind, tableIndex)}-${b + 1}of${BANDS}.png`);
      writeFileSync(p, out.png);
      console.log(`${p}   "${t.title}" band ${b + 1}/${BANDS}`);
      n++;
    }
  }
}
console.error(`\n${n} render(s) in ${outDir}`);
process.exit(0);
