/**
 * Content-addressed SheetGraph cache (cacache — same OSS npm uses).
 *
 * Demo regressions and golden verify previously paid ~11s of sheetgraph+ODL
 * work per process even when the PDF bytes were unchanged. Ten demos that
 * share one fixture PDF therefore rebuilt the same graph ten times.
 *
 * Key = cache version + engine source digest + PDF identity (sha256 when
 * known, else path+size+mtime). Set OPENTAKEOFF_GRAPH_NO_CACHE=1 for cold
 * benchmarks. Deliberately set-agnostic — any PDF path works.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cacache from "cacache";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(HERE, "..");
const WEB_LIB = resolve(MCP_ROOT, "..", "web", "src", "lib");
const CACHE_DIR = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "opentakeoff-sheet-graph");
const CACHE_VERSION = "sheet-graph-v1";

async function sourceFiles(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...await sourceFiles(path));
    else if ([".ts", ".mjs", ".js"].includes(extname(entry.name))) out.push(path);
  }
  return out;
}

let sourceDigestPromise;
function sourceDigest() {
  sourceDigestPromise ??= (async () => {
    const files = [
      ...await sourceFiles(join(MCP_ROOT, "src")),
      join(HERE, "sheetGraphCache.mjs"),
      join(WEB_LIB, "sheetgraph.ts"),
      join(WEB_LIB, "corpusTakeoff.mjs"),
      join(WEB_LIB, "queryTable.mjs"),
      join(MCP_ROOT, "package.json"),
      join(MCP_ROOT, "package-lock.json"),
    ].sort();
    const hash = createHash("sha256");
    hash.update(process.version);
    for (const path of files) {
      hash.update(path);
      try {
        hash.update(await readFile(path));
      } catch {
        hash.update("(missing)");
      }
    }
    return hash.digest("hex");
  })();
  return sourceDigestPromise;
}

async function pdfIdentity(pdfPath, expectedSha256) {
  if (expectedSha256) return `sha256:${expectedSha256}`;
  const info = await stat(pdfPath);
  return `stat:${pdfPath}:${info.size}:${info.mtimeMs}`;
}

/**
 * @param {string} pdfPath
 * @param {{ expectedSha256?: string, identity?: string[], compute: () => Promise<object> }} opts
 */
export async function cachedSheetGraph(pdfPath, opts) {
  const compute = opts.compute;
  if (process.env.OPENTAKEOFF_GRAPH_NO_CACHE === "1") return compute();
  const keyHash = createHash("sha256")
    .update(CACHE_VERSION)
    .update(await sourceDigest())
    .update(await pdfIdentity(pdfPath, opts.expectedSha256));
  for (const value of opts.identity || []) keyHash.update(String(value));
  const key = keyHash.digest("hex");
  try {
    const hit = await cacache.get(CACHE_DIR, key);
    return JSON.parse(hit.data.toString("utf8"));
  } catch {
    const result = await compute();
    await cacache.put(CACHE_DIR, key, JSON.stringify(result)).catch(() => {});
    return result;
  }
}

export function sheetGraphCacheDir() {
  return CACHE_DIR;
}
