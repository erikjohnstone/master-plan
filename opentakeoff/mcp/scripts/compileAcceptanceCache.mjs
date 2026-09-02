/**
 * Content-addressed cache for WP1 compile acceptance triplets (HVAC/BAS/valve).
 * Reuses evalCache keying — invalidates when corpusTakeoff / engine sources change.
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { cachedEvalResult } from "./evalCache.mjs";

/** @param {string} corpusRoot */
function inputPathsForKey(corpusRoot, key, keyPath) {
  const paths = [keyPath];
  if (key.source_file) paths.push(resolve(corpusRoot, key.source_file));
  if (key.source_parts_dir) paths.push(resolve(corpusRoot, key.source_parts_dir));
  return paths;
}

/**
 * @param {string} corpusRoot
 * @param {object} key acceptance key JSON
 * @param {string} keyPath absolute path to compile.json
 * @param {object} graph SheetGraph from cachedGraphForKey
 */
export async function cachedCompileTriplet(corpusRoot, key, keyPath, graph) {
  return cachedEvalResult(
    "wp1-compile-triplet-v1",
    inputPathsForKey(corpusRoot, key, keyPath),
    [key.set_id],
    async () => ({
      hvac: compileCorpusTakeoff(null, graph, "hvac_equipment"),
      bas: compileCorpusTakeoff(null, graph, "bas_points"),
      valve: compileCorpusTakeoff(null, graph, "control_valves"),
    }),
  );
}

/** Shared WP1 acceptance assertions — compile truth only, no per-set hardcodes. */
export function assertWp1CompileAcceptance(key, { hvac, bas, valve }) {
  assert.equal(hvac.totals.items, key.totals.items, `${key.set_id} HVAC total`);
  for (const [fam, n] of Object.entries(key.categories)) {
    assert.equal(
      hvac.categories?.[fam]?.count ?? 0,
      n,
      `${key.set_id} ${fam} count`,
    );
  }
  for (const [fam, cat] of Object.entries(hvac.categories || {})) {
    if (key.categories[fam] != null) continue;
    assert.equal(cat.count, 0, `${key.set_id} unexpected family ${fam}=${cat.count}`);
  }
  assert.equal(bas.totals.rows ?? bas.totals.items ?? 0, key.bas_points.rows,
    `${key.set_id} BAS empty/honest disclose`);
  for (const field of ["alarm", "trend", "hardwired", "soft"]) {
    if (key.bas_points[field] == null) continue;
    assert.equal(
      bas.totals[field] ?? 0,
      key.bas_points[field],
      `${key.set_id} BAS ${field}`,
    );
  }
  assert.ok(bas.page_accounting?.sheet_count >= 1, `${key.set_id} BAS page accounting`);
  assert.equal(valve.totals.items, key.control_valves.items, `${key.set_id} valve total`);
  for (const [fam, n] of Object.entries(key.control_valves.categories || {})) {
    assert.equal(valve.categories?.[fam]?.count ?? 0, n, `${key.set_id} valve ${fam}`);
  }
}
