// mepsystems.ts (maturity plan Phase 4) — MEP system classification, the
// new axis alongside layers.ts's own LayerRole. Pure, so tested the same
// way layers.test.ts already tests classifyLayerName: real layer-name
// examples in, a real {system, confidence} out, no PDF/DOM involved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMepLayerName, mepLayerSignal } from "../src/lib/mepsystems.ts";
import type { LayerInfo } from "../src/lib/layers.ts";

test("classifyMepLayerName: real piping tokens, conforming discipline prefixes boost confidence", () => {
  assert.equal(classifyMepLayerName("P-PIPE").system, "piping");
  assert.ok(classifyMepLayerName("P-PIPE").confidence > classifyMepLayerName("PIPE").confidence, "P- discipline prefix boosts a real piping token");
  assert.equal(classifyMepLayerName("M-CHWS").system, "piping");
  assert.equal(classifyMepLayerName("SAN").system, "piping");
  assert.equal(classifyMepLayerName("FP-SPRINKLER").system, "piping");
});

test("classifyMepLayerName: real ductwork tokens, M- discipline boosts", () => {
  assert.equal(classifyMepLayerName("M-DUCT").system, "ductwork");
  assert.ok(classifyMepLayerName("M-DUCT").confidence > classifyMepLayerName("DUCT").confidence);
  assert.equal(classifyMepLayerName("SUPPLY").system, "ductwork");
  assert.equal(classifyMepLayerName("RA").system, "ductwork");
});

test("classifyMepLayerName: a bare mechanical-discipline layer with no specific token stays unknown, not guessed", () => {
  // "M-SYMBOLS" is real mechanical-discipline naming, but the token
  // "SYMBOLS" names nothing — refuse rather than pick piping or ductwork.
  const r = classifyMepLayerName("M-SYMBOLS");
  assert.equal(r.system, "unknown");
});

test("classifyMepLayerName: HVAC alone is real but generic — grades lower than a specific token, never unknown", () => {
  const hvac = classifyMepLayerName("M-HVAC");
  const specific = classifyMepLayerName("M-DUCT");
  assert.equal(hvac.system, "ductwork");
  assert.ok(hvac.confidence < specific.confidence, "HVAC alone must not equal a specific ductwork token's confidence");
});

test("classifyMepLayerName: electrical tokens, E- discipline boosts", () => {
  assert.equal(classifyMepLayerName("E-PWR").system, "electrical");
  assert.equal(classifyMepLayerName("LTG").system, "electrical");
  assert.equal(classifyMepLayerName("CONDUIT").system, "electrical");
});

test("classifyMepLayerName: controls tokens", () => {
  assert.equal(classifyMepLayerName("BAS").system, "controls");
  assert.equal(classifyMepLayerName("DDC-POINTS").system, "controls");
  assert.equal(classifyMepLayerName("TSTAT").system, "controls");
});

test("classifyMepLayerName: degenerate names (unnamed/flattened) refuse cleanly, same as layers.ts's own doctrine", () => {
  assert.equal(classifyMepLayerName("").system, "unknown");
  assert.equal(classifyMepLayerName("0").system, "unknown");
  assert.equal(classifyMepLayerName("Layer 1").system, "unknown");
  assert.equal(classifyMepLayerName("A-WALL-FULL").system, "unknown", "a real architectural boundary layer names no MEP system");
});

// ── mepLayerSignal ───────────────────────────────────────────────────────
const mkInfo = (over: Partial<LayerInfo>): LayerInfo => ({ id: "0", name: "", role: "unknown", confidence: 0, visible: true, seg_count: 0, ...over });

test("mepLayerSignal: no layers at all -> none (the real, confirmed Bessemer case)", () => {
  assert.equal(mepLayerSignal(undefined, undefined), "none");
  assert.equal(mepLayerSignal([], undefined), "none");
});

test("mepLayerSignal: layers exist but none classify -> none", () => {
  const infos = [mkInfo({ id: "1", name: "A-WALL-FULL" }), mkInfo({ id: "2", name: "0" })];
  assert.equal(mepLayerSignal(infos, [0, 1, 0, 1]), "none");
});

test("mepLayerSignal: confident classification but no layerOf coverage data -> weak, not strong", () => {
  const infos = [mkInfo({ id: "1", name: "M-DUCT" })];
  assert.equal(mepLayerSignal(infos, undefined), "weak");
  assert.equal(mepLayerSignal(infos, []), "weak");
});

test("mepLayerSignal: confident classification, high real coverage -> strong", () => {
  const infos = [mkInfo({ id: "1", name: "M-DUCT" }), mkInfo({ id: "2", name: "A-ANNO-TEXT" })];
  // 8 of 10 segments sit on the confidently-classified ductwork layer (id 1)
  const layerOf = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1];
  assert.equal(mepLayerSignal(infos, layerOf), "strong");
});

test("mepLayerSignal: confident classification but LOW coverage -> weak, not strong", () => {
  const infos = [mkInfo({ id: "1", name: "M-DUCT" }), mkInfo({ id: "2", name: "A-ANNO-TEXT" })];
  // only 2 of 10 segments are on the classified layer (index 0 = M-DUCT)
  const layerOf = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1];
  assert.equal(mepLayerSignal(infos, layerOf), "weak");
});

test("mepLayerSignal: only the generic HVAC grade classifies, even with full coverage -> weak, never strong", () => {
  const infos = [mkInfo({ id: "1", name: "HVAC" })];
  const layerOf = [0, 0, 0, 0];
  assert.equal(mepLayerSignal(infos, layerOf), "weak", "a generic-only classification never earns strong, even at 100% coverage");
});
