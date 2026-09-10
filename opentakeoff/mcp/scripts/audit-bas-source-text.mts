/** SHOULD THIS BE ON THE SHARED PATH? No: diagnostic source capture only.
 * Uses the production PDF text adapter; never interprets requirements/counts.
 */
import { openPdf, textSpans } from '../src/pdf.ts';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: node --import tsx scripts/audit-bas-source-text.mts PDF OUTPUT_JSON');
const doc = await openPdf(source);
const pages = [];
try {
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.page(n);
    const spans = textSpans(page);
    pages.push({ page: n, width: page.viewport.width, height: page.viewport.height, spans });
    page.cleanup();
  }
} finally { await doc.destroy(); }
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ source, sha256: createHash('sha256').update(await readFile(source)).digest('hex'),
  coordinateFrame: 'production image pixels, same textSpans as Session; no geometry/table changes', pages }, null, 2));
console.log(JSON.stringify({ pages: pages.length, spans: pages.reduce((n, p) => n + p.spans.length, 0), output }));
