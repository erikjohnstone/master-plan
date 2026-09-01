/**
 * Cached PDF → graph → Session for workflow/regression tests.
 * Uses sheetGraphCache (cacache) so reconcile + compile tests share warm graphs.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Session } from "../../src/session.ts";
import { cachedSheetGraph } from "../../scripts/sheetGraphCache.mjs";

/** @param {string} corpusRoot absolute opentakeoff-corpus path */
export async function cachedGraphForKey(corpusRoot, key, identitySuffix = "workflow") {
  const primary = resolve(corpusRoot, key.source_file);
  if (existsSync(primary)) {
    return cachedSheetGraph(primary, {
      identity: [key.set_id, identitySuffix],
      compute: async () => {
        const session = new Session();
        await session.loadPlan(primary);
        return session.graphForPipeline();
      },
    });
  }
  const partsDir = key.source_parts_dir
    ? resolve(corpusRoot, key.source_parts_dir)
    : null;
  if (!partsDir || !existsSync(partsDir)) return null;
  const parts = readdirSync(partsDir)
    .filter((f) => f.endsWith(".pdf"))
    .sort();
  if (!parts.length) return null;
  return cachedSheetGraph(partsDir, {
    identity: [key.set_id, identitySuffix, "parts", String(parts.length)],
    compute: async () => {
      const session = new Session();
      await session.loadPlan(resolve(partsDir, parts[0]));
      for (let i = 1; i < parts.length; i++) {
        await session.loadPlan(resolve(partsDir, parts[i]), { merge: true });
      }
      return session.graphForPipeline();
    },
  });
}

/** Load Session with seeded pipeline graph — never rebuild graph if cache hit. */
export async function loadCachedKeySession(corpusRoot, key, identitySuffix = "workflow") {
  const graph = await cachedGraphForKey(corpusRoot, key, identitySuffix);
  if (!graph) return null;
  const primary = resolve(corpusRoot, key.source_file);
  const session = new Session();
  if (existsSync(primary)) {
    await session.loadPlan(primary);
  } else {
    const partsDir = resolve(corpusRoot, key.source_parts_dir);
    const parts = readdirSync(partsDir).filter((f) => f.endsWith(".pdf")).sort();
    await session.loadPlan(resolve(partsDir, parts[0]));
    for (let i = 1; i < parts.length; i++) {
      await session.loadPlan(resolve(partsDir, parts[i]), { merge: true });
    }
  }
  session.seedPipelineGraph(graph);
  return { key, session, graph };
}

/** @param {import("node:test").TestContext} t */
export async function loadCachedKeySessionOrSkip(t, corpusRoot, keyPath, identitySuffix = "reconcile-fixture") {
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const loaded = await loadCachedKeySession(corpusRoot, key, identitySuffix);
  if (!loaded) {
    t.skip(`PDF/parts missing for ${key.set_id}`);
    return null;
  }
  return loaded;
}

export async function cachedGraphForPdf(corpusRoot, pdfPath, setId, identitySuffix = "reconcile-fixture") {
  return cachedSheetGraph(pdfPath, {
    identity: [setId, identitySuffix],
    compute: async () => {
      const session = new Session();
      await session.loadPlan(pdfPath);
      return session.graphForPipeline();
    },
  });
}
