import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cacache from "cacache";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(HERE, "..");
const WEB_LIB = resolve(MCP_ROOT, "..", "web", "src", "lib");
const CACHE_DIR = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "opentakeoff-eval");
const CACHE_VERSION = "scored-result-v1";

async function sourceFiles(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...await sourceFiles(path));
    else if ([".ts", ".mjs"].includes(extname(entry.name))) out.push(path);
  }
  return out;
}

let sourceDigestPromise;
function sourceDigest() {
  sourceDigestPromise ??= (async () => {
    const files = [
      ...await sourceFiles(join(MCP_ROOT, "src")),
      ...await sourceFiles(HERE),
      ...await sourceFiles(WEB_LIB),
    ].sort();
    const hash = createHash("sha256");
    for (const path of files) {
      hash.update(path);
      hash.update(await readFile(path));
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
 * The key includes every deterministic engine/evaluator source file plus
 * every PDF and authored key consumed by the set. Therefore a code, drawing,
 * or expected-answer edit forces a real recomputation; repeated validation of
 * the same revision returns immediately. Set OPENTAKEOFF_EVAL_NO_CACHE=1 for
 * explicit cold-path benchmarks/equivalence checks.
 */
export async function cachedEvalResult(namespace, inputPaths, compute) {
  if (process.env.OPENTAKEOFF_EVAL_NO_CACHE === "1") return compute();
  const key = createHash("sha256")
    .update(CACHE_VERSION)
    .update(namespace)
    .update(await sourceDigest())
    .update(await inputDigest(inputPaths))
    .digest("hex");
  try {
    const hit = await cacache.get(CACHE_DIR, key);
    return JSON.parse(hit.data.toString("utf8"));
  } catch {
    const result = await compute();
    await cacache.put(CACHE_DIR, key, JSON.stringify(result)).catch(() => {});
    return result;
  }
}
