/**
 * Score emitted out/*.takeoff.json against compile-key expectations (shared path).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

function groundedFraction(items) {
  if (!items?.length) return null;
  let ok = 0;
  for (const item of items) {
    const ev = item.evidence || [];
    const hasBbox = ev.some((e) => Array.isArray(e.bbox) && e.bbox[2] > e.bbox[0]);
    if (ev.length && hasBbox) ok += 1;
    else if (ev.length) ok += 0.5;
  }
  return ok / items.length;
}

function loadCompileKeys(corpusRoot) {
  const dir = resolve(corpusRoot, "takeoffs/cross-set-compile");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".compile.json"))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")));
}

function loadTakeoffDoc(outDir, setId) {
  const direct = resolve(outDir, `${setId}.takeoff.json`);
  if (existsSync(direct)) return JSON.parse(readFileSync(direct, "utf8"));
  const alt = readdirSync(outDir).find((f) => f.startsWith(setId.slice(0, 8)) && f.endsWith(".takeoff.json"));
  return alt ? JSON.parse(readFileSync(resolve(outDir, alt), "utf8")) : null;
}

/**
 * @param {string} corpusRoot
 * @param {string} outDir
 * @param {object} [opts]
 */
export function scoreCorpusTakeoffs(corpusRoot, outDir, opts = {}) {
  const keys = loadCompileKeys(corpusRoot);
  const filter = opts.setIds ? new Set(opts.setIds) : null;
  const perSet = [];
  let valveExpected = 0;
  let valveHit = 0;
  let basExpected = 0;
  let basHit = 0;
  let groundingSum = 0;
  let groundingN = 0;
  let emitted = 0;
  let missing = 0;
  let seqExpected = 0;
  let seqHit = 0;

  for (const key of keys) {
    if (filter && !filter.has(key.set_id)) continue;
    const doc = loadTakeoffDoc(outDir, key.set_id);
    if (!doc) {
      missing += 1;
      perSet.push({ set_id: key.set_id, status: "missing_emit" });
      continue;
    }
    emitted += 1;
    const expValves = key.control_valves?.items ?? 0;
    const actValves = doc.valves?.length ?? 0;
    if (expValves > 0) {
      valveExpected += 1;
      if (actValves > 0) valveHit += 1;
    }
    const expBas = key.bas_points?.rows ?? 0;
    const actBas = doc.points?.length ?? 0;
    if (expBas > 0) {
      basExpected += 1;
      if (actBas > 0) basHit += 1;
    }
    const g = groundedFraction([
      ...(doc.valves || []),
      ...(doc.dampers || []),
      ...(doc.points || []),
    ]);
    if (g != null) {
      groundingSum += g;
      groundingN += 1;
    }
    const sooStatus = doc.pillars?.c_estimator?.bas?.estimator_product?.soo?.present
      || doc.pillars?.c_estimator?.bas?.estimator_product?.soo?.status === "present_not_row_extractable";
    if (sooStatus) {
      seqExpected += 1;
      if ((doc.sequences || []).length > 0) seqHit += 1;
    }
    perSet.push({
      set_id: key.set_id,
      status: "scored",
      expected_valves: expValves,
      actual_valves: actValves,
      expected_bas: expBas,
      actual_bas: actBas,
      sequences: doc.sequences?.length ?? 0,
      grounding: g,
      grid_types: doc.grid_classifications?.length ?? 0,
    });
  }

  const metrics = {
    grounding_coverage: groundingN ? groundingSum / groundingN : null,
    table_cell_f1: null,
    grid_type_acc: null,
    valve_prec: null,
    valve_rec: valveExpected ? valveHit / valveExpected : null,
    valve_attr_acc: null,
    damper_prec: null,
    damper_rec: null,
    damper_attr_acc: null,
    point_prec: null,
    point_rec: basExpected ? basHit / basExpected : null,
    point_type_acc: null,
    io_total_abs_err: null,
    seq_section_f1: seqExpected ? seqHit / seqExpected : null,
    seq_implied_point_f1: null,
    discrepancy_prec: null,
    determinism: opts.determinism ?? null,
    corpus_pass_rate: keys.length ? emitted / keys.length : null,
  };

  const acceptance = {
    mvp: Boolean(
      metrics.corpus_pass_rate != null && metrics.corpus_pass_rate >= 0.95
      && metrics.grounding_coverage != null && metrics.grounding_coverage >= 0.5,
    ),
    emitted,
    missing,
    keys_total: keys.length,
  };

  return { metrics, acceptance, perSet };
}

export function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function checkDeterminism(emitFn, pdfPath) {
  const a = emitFn(pdfPath);
  const b = emitFn(pdfPath);
  return a === b;
}

export { loadCompileKeys, loadTakeoffDoc };
