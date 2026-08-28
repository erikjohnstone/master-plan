// MEP system classification (maturity plan Phase 4) — which real building
// system a layer's (and by extension a segment's) ink belongs to: piping,
// ductwork, electrical, or controls. A NEW, separate axis from layers.ts's
// own LayerRole (boundary/finish-pattern/annotation/structure/demolition) —
// deliberately not an extension of it. LayerRole answers "does this ink
// bound a room for the flood mask"; this answers "which building system is
// this ink part of," an orthogonal question layers.ts was never designed to
// carry (stuffing MEP values into LayerRole would make every existing
// buildMask/layerRoleCodes switch reason about codes it was never built
// for).
//
// Reuses layers.ts's own exported `layerNameTokens` tokenizer so the two
// classifiers can never disagree about what a "token" is — the same
// normalization (strip xref path, fold `$n$` xref-bind separators,
// uppercase, split on non-alphanumeric runs) feeds both.
//
// Doctrine, carried over verbatim from layers.ts: refusal over guessing.
// Only a positive token match earns a system; everything else is
// `"unknown"`. But the STAKES differ from layers.ts's own: "a wrong
// `unknown` costs nothing, a wrong `boundary` seals a corridor" — here, a
// wrong `"piping"` label on what's actually a duct run doesn't just corrupt
// one mask pass, it misinforms a real bid about which system a valve
// belongs to. That is why `mepLayerSignal` exists below: when the signal
// is weak or absent, connectivity tracing (mepconnectivity.ts) must run
// layer-agnostic and say so, never quietly assign a system it isn't sure of.

import { layerNameTokens, type LayerInfo } from "./layers.ts";

export type MepSystemRole = "piping" | "ductwork" | "electrical" | "controls" | "unknown";

export interface MepSystemInfo {
  system: MepSystemRole;
  confidence: number;   // 0..1
}

// Token tables. Real, common MEP layer-naming conventions — cross-checked
// against this project's own real corpus (the HVAC/BAS maturity plan's
// Phase 1/2 sourcing) and general AIA-adjacent field practice, not
// invented. Every entry is a WHOLE token match after normalization, same
// discipline as layers.ts's own tables.
const PIPING = new Set([
  "PIPE", "PIPG", "PLMB", "PLUMB", "DWV", "SAN", "SANITARY", "VENT",
  "CW", "HW", "HWS", "HWR", "CHW", "CHWS", "CHWR", "HHW", "HHWS", "HHWR",
  "STM", "STEAM", "COND", "CONDENSATE", "FP", "FIRE", "SPRINKLER", "GAS", "NG", "REFRIG",
]);
const DUCTWORK = new Set([
  "DUCT", "DUCTWORK", "SUPP", "SUPPLY", "RET", "RETURN", "EXH", "EXHAUST",
  "OA", "SA", "RA", "EA", "MA",
]);
// Generic enough (HVAC is often used for the whole mechanical discipline,
// not ductwork specifically) that it grades lower on its own — see grade().
const DUCTWORK_WEAK = new Set(["HVAC"]);
const ELECTRICAL = new Set([
  "ELEC", "PWR", "POWER", "LTG", "LIGHT", "LIGHTING", "CIRC", "CKT",
  "PANEL", "CNDT", "CONDUIT", "EMT", "RECPT", "RECEPT",
]);
const CONTROLS = new Set([
  "BAS", "CTRL", "CTRLS", "CONTROLS", "DDC", "TSTAT", "THERMOSTAT", "SENSR", "SENSOR",
]);
// AIA discipline designators, same set layers.ts's own DISCIPLINES uses —
// graded per-system below since "M-" is genuinely ambiguous between
// ductwork and piping (mechanical covers both) while "P-"/"E-" are not.
const MECHANICAL_DISCIPLINE = "M";
const PIPING_DISCIPLINE = "P";
const ELECTRICAL_DISCIPLINE = "E";

/** Raw layer name -> {system, confidence}. Pure, total, never throws. */
export function classifyMepLayerName(raw: string): MepSystemInfo {
  const s = String(raw || "").trim();
  if (!s || /^0$/.test(s) || /^layer\s*\d*$/i.test(s)) return { system: "unknown", confidence: 0 };
  const toks = layerNameTokens(s);
  if (!toks.length) return { system: "unknown", confidence: 0 };
  const discipline = toks[0];
  const conforming = /^[A-Z]$/.test(discipline) && toks.length > 1;
  const grade = (base: number) => (conforming ? base : Math.max(0.5, base - 0.2));
  const has = (table: Set<string>) => toks.some((t) => table.has(t));

  if (has(CONTROLS)) return { system: "controls", confidence: grade(0.85) };
  if (has(PIPING)) {
    // "M-" (mechanical) covers both piping and ductwork — a real PIPING
    // token under it is still trustworthy (the token itself is specific),
    // just not boosted the way a "P-" (plumbing) discipline prefix would be.
    const boosted = conforming && discipline === PIPING_DISCIPLINE ? 0.05 : 0;
    return { system: "piping", confidence: Math.min(1, grade(0.85) + boosted) };
  }
  if (has(DUCTWORK)) {
    const boosted = conforming && discipline === MECHANICAL_DISCIPLINE ? 0.05 : 0;
    return { system: "ductwork", confidence: Math.min(1, grade(0.85) + boosted) };
  }
  if (has(ELECTRICAL)) {
    const boosted = conforming && discipline === ELECTRICAL_DISCIPLINE ? 0.05 : 0;
    return { system: "electrical", confidence: Math.min(1, grade(0.8) + boosted) };
  }
  // A bare "M-SYMBOLS" or similar — mechanical discipline, no specific
  // system token — is NOT enough on its own to call it either piping or
  // ductwork. Refuse rather than guess, same as an unrecognized layers.ts
  // token stays `unknown`.
  if (has(DUCTWORK_WEAK)) return { system: "ductwork", confidence: grade(0.5) };
  return { system: "unknown", confidence: 0.2 };
}

/** How much the layer data on this sheet can be trusted to tell piping from
 * ductwork from electrical from controls — the honest fallback signal
 * mepconnectivity.ts's tracer reads before ever attaching a system label to
 * a traced run.
 *
 *   "none"   — no layers at all, or none classify above a floor confidence.
 *              A real, confirmed case: this project's own
 *              samples/bessemer-mechanical-bidset.pdf is Ghostscript-
 *              flattened (confirmed via pdfinfo) and almost certainly
 *              carries no OCG layers — our own real HVAC sample IS this
 *              case, not a hypothetical one.
 *   "weak"   — some layers classify, but coverage of the sheet's own ink is
 *              partial, or classification only ever reaches the generic
 *              DUCTWORK_WEAK ("HVAC") grade, never a specific system.
 *   "strong" — confident classification covering the bulk of the sheet's
 *              non-boundary/non-annotation ink.
 *
 * Under "none", a tracer must run layer-agnostic (trace through all
 * non-excluded ink) and carry `layer_signal: "none"` through its own
 * result — never silently present an unclassified trace as "the piping
 * network." A wrong `unknown` here costs nothing; a wrong `"piping"`
 * misinforms a real bid — the asymmetry layers.ts's own doctrine names,
 * carried one step further. */
export function mepLayerSignal(
  infos: LayerInfo[] | undefined,
  layerOf: Int32Array | number[] | undefined,
): "none" | "weak" | "strong" {
  if (!infos || !infos.length) return "none";
  const classified = infos.map((info) => ({ info, mep: classifyMepLayerName(info.name) }));
  const confidentCount = classified.filter((c) => c.mep.system !== "unknown" && c.mep.confidence >= 0.5).length;
  if (!confidentCount) return "none";
  // Coverage: what fraction of the sheet's OWN segments sit on a confidently
  // classified layer. No layerOf data at all (text-only extraction, or a
  // caller that never wired it) is treated as weak rather than strong — the
  // classification exists, but nothing here proves it covers the ink that
  // matters for a trace.
  if (!layerOf || !layerOf.length) return "weak";
  const confidentIds = new Set(classified.filter((c) => c.mep.system !== "unknown" && c.mep.confidence >= 0.5).map((c) => c.info.id));
  const idByIndex = infos.map((i) => i.id);
  let covered = 0, total = 0;
  for (let i = 0; i < layerOf.length; i++) {
    const li = layerOf[i];
    if (li < 0 || li >= idByIndex.length) continue;
    total++;
    if (confidentIds.has(idByIndex[li])) covered++;
  }
  if (!total) return "weak";
  const coverage = covered / total;
  // Even confident classification only counting the generic DUCTWORK_WEAK
  // grade (0.5, never boosted) never earns "strong" — it hasn't actually
  // told piping from ductwork, only "some kind of mechanical."
  const anySpecific = classified.some((c) => c.mep.system !== "unknown" && c.mep.confidence > 0.5);
  if (coverage >= 0.6 && anySpecific) return "strong";
  return "weak";
}
