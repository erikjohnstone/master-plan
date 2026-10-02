// Grid replay, step 1: list every table-bearing page of a directory of saved
// sheet graphs (*.graph.json.gz) as "set<TAB>pdf file<TAB>page" lines.
// Usage: node pages.mjs GRAPH_DIR > pages.tsv
import { readdirSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

const dir = process.argv[2];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".graph.json.gz")).sort()) {
  const graph = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString());
  const pages = new Map();
  for (const t of graph.tables || []) {
    const [, file, page] = String(t.sheet).match(/^(.*?)(?:#(\d+))?$/);
    pages.set(`${file}|${page || 1}`, [file, Number(page || 1)]);
  }
  for (const [file, page] of pages.values()) console.log(`${f.replace(/\.graph\.json\.gz$/, "")}\t${file}\t${page}`);
}
