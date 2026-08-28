// Export one sheet's real GraphSpan[] (the exact shape web/test/fixtures/
// m601-spans.json uses) from any loadable plan file, for Node-first
// debugging against real corpus data — mirrors how m601-spans.json was
// itself produced from samples/bessemer-mechanical-bidset.pdf.
//
//   node --import tsx scripts/export-corpus-fixture.mjs <src.pdf> <pageNum> <out.json>
//
// LICENSING — read before ever committing the output of this script:
// m601-spans.json is safe to commit only because samples/bessemer-
// mechanical-bidset.pdf is ALREADY committed in this repo as an accepted
// exception (docs/SHEET-GRAPH-EVAL.md). A span export is a real,
// human-readable derivative of the source PDF's actual text content (real
// tag numbers, real manufacturer/model strings, real project names) — for
// any source whose redistribution terms are not independently confirmed
// (the external corpus's own sets.json/README states this explicitly per
// set), its span export must NEVER be committed either. Use this script's
// output for local verification only, or discard it after checking a real
// finding by hand (this project's own established debug-loop-speed
// practice: iterate library bugs in Node against captured real data, then
// delete the scratch capture once you're done with it).
import { Session } from "../src/session.ts";
import { textSpans } from "../src/pdf.ts";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

const [srcPath, pageArg, outPath] = process.argv.slice(2);
const page = Number(pageArg);
if (!srcPath || !page || !outPath) {
  console.error("usage: node --import tsx scripts/export-corpus-fixture.mjs <src.pdf> <pageNum> <out.json>");
  process.exit(2);
}
const s = new Session();
await s.loadPlan(resolve(srcPath));
const key = s.sheetList()[page - 1].key;
const sh = s.sheet(key);
if (!sh.spans) sh.spans = textSpans(sh.page);
const spans = sh.spans.map((t) => ({ str: t.str, x: t.x0, y: t.y0, w: t.x1 - t.x0, h: t.y1 - t.y0, ...(t.rot ? { rot: t.rot } : {}) }));
writeFileSync(outPath, JSON.stringify({ key, spans }));
console.log(`wrote ${outPath} (${spans.length} spans)`);
