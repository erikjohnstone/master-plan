import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cacache from "cacache";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(HERE, "..");
const WEB_ROOT = resolve(MCP_ROOT, "..", "web");
const WEB_LIB = resolve(MCP_ROOT, "..", "web", "src", "lib");
const CACHE_DIR = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "opentakeoff-eval");
const CACHE_VERSION = "scored-result-v1";

async function sourceFiles(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...await sourceFiles(path));
    // .js matters here too: session.ts/marked.ts/importing.ts import real
    // engine modules under web/src/lib with a plain .js extension
    // (geometry.js, cutout.js, approvals.js, totals.js, rollTakeoff.js,
    // importTakeoff.js, markedset.js) — omitting it left every one of those
    // invisible to this digest, so an edit to any of them silently served a
    // stale cached score.
    else if ([".ts", ".mjs", ".js"].includes(extname(entry.name))) out.push(path);
  }
  return out;
}

let sourceDigestPromise;
function sourceDigest() {
  sourceDigestPromise ??= (async () => {
    const files = [
      ...await sourceFiles(join(MCP_ROOT, "src")),
      ...await sourceFiles(WEB_LIB),
      // Explicit files only, never a directory scan of mcp/scripts (~70
      // files): the two scorers that call cachedEvalResult (takeoff-eval.mjs,
      // graph-eval.mjs) each import exactly corpusFiles.mjs and this module
      // from scripts/ — nothing else. Scanning the whole directory meant
      // editing any of the ~70 other scripts here, including a dead probe
      // nothing imports, discarded every cached result for every set (same
      // failure class sheetGraphCache.mjs's own header documents and this
      // mirrors its explicit-file fix for).
      join(HERE, "evalCache.mjs"),
      join(HERE, "corpusFiles.mjs"),
      join(MCP_ROOT, "package.json"),
      join(MCP_ROOT, "package-lock.json"),
      join(WEB_ROOT, "package.json"),
      join(WEB_ROOT, "package-lock.json"),
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

async function inputDigest(paths) {
  const hash = createHash("sha256");
  for (const path of [...new Set(paths)].sort()) {
    hash.update(path);
    try {
      const info = await stat(path);
      // PDFs can be hundreds of MB; path + exact size + nanosecond-derived
      // mtime invalidates them without making every cache lookup re-read the
      // entire corpus. Small authored keys are hashed by content.
      if (/\.pdf$/i.test(path)) {
        hash.update(`${info.size}:${info.mtimeMs}`);
      } else {
        hash.update(await readFile(path));
      }
    } catch {
      hash.update("(missing)");
    }
  }
  return hash.digest("hex");
}

/** Content-addressed cache for complete per-set scorer results.
 *
 * The key includes every deterministic engine/evaluator source file, the
 * selected set's own manifest entry, and every PDF/authored key consumed by
 * that set. Adding an unrelated corpus set therefore leaves every existing
 * entry hot; a relevant code, drawing, manifest, or answer-key edit forces a
 * real recomputation. Set OPENTAKEOFF_EVAL_NO_CACHE=1 for explicit cold-path
 * benchmarks/equivalence checks.
 */
export async function cachedEvalResult(namespace, inputPaths, identityValues, compute) {
  if (process.env.OPENTAKEOFF_EVAL_NO_CACHE === "1") return compute();
  const keyHash = createHash("sha256")
    .update(CACHE_VERSION)
    .update(namespace)
    .update(await sourceDigest())
    .update(await inputDigest(inputPaths));
  for (const value of identityValues) keyHash.update(value);
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
