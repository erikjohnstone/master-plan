// SYMBOL-SWEEP AFFINE PARITY — docs/SYMBOL-SWEEP-AFFINE-GOAL.md Phase 5 item
// 4: "canvas and MCP cannot disagree", made executable for the new `affine`
// option.
//
// matchSymbol/sweepSymbols themselves cannot disagree between the two
// surfaces — the MCP server (mcp/src/session.ts) and the canvas
// (web/src/pages/TakeoffCanvas.jsx) both call the EXACT SAME exported
// functions from web/src/lib/symbolsweep.ts, not two independent
// implementations. What COULD drift is the translation from each surface's
// own wire shape (a zod tool schema on the MCP side, a JSON-schema agent
// tool on the canvas side — both necessarily snake_case, since that is this
// project's own established wire convention) into the engine's own
// camelCase AffineOptions.
//
// The real fix is structural, not just tested for after the fact: both
// surfaces call the ONE exported `affineOptionsFromWire` (web/src/lib/
// symbolsweep.ts) rather than each writing its own object-literal mapping —
// mcp/src/tools.ts imports and calls it directly (see its symbol_sweep and
// sweep_schedule_row registrations). This test proves BOTH that the shared
// function itself is correct and that the canvas agent tool's dispatcher
// (web/src/lib/agentTools.js's `executeAgentTool`) actually reaches the
// engine with the SAME resulting AffineOptions the shared function would
// produce for the same wire input.
//
// A full canvas-vs-MCP run against a real rendered sheet is not executable
// in this environment (no browser); the recon for this phase confirmed
// matchSymbol/sweepSymbols are the literal same function either way, so the
// translation layer proven here is the one place parity could actually be
// lost.
import test from "node:test";
import assert from "node:assert/strict";
import { affineOptionsFromWire, type AffineOptions } from "../../web/src/lib/symbolsweep.ts";
import { executeAgentTool } from "../../web/src/lib/agentTools.js";

test("affineOptionsFromWire: undefined stays undefined, every field maps camelCase, nothing is silently defaulted", () => {
  assert.equal(affineOptionsFromWire(undefined), undefined);
  const mapped = affineOptionsFromWire({ enabled: true, max_stretch: 1.3, max_shear_deg: 8, scale_search: true });
  const expected: AffineOptions = { enabled: true, maxStretch: 1.3, maxShearDeg: 8, scaleSearch: true };
  assert.deepEqual(mapped, expected);
  // a caller stating enabled:false explicitly is not the same as omitting
  // affine outright — both must be preserved verbatim, not collapsed
  assert.deepEqual(
    affineOptionsFromWire({ enabled: false, max_stretch: 1.5, max_shear_deg: 10, scale_search: false }),
    { enabled: false, maxStretch: 1.5, maxShearDeg: 10, scaleSearch: false },
  );
});

test("symbol_sweep affine parity: the canvas agent tool reaches the engine with the SAME AffineOptions affineOptionsFromWire produces for the same wire input", async () => {
  const wireInputs: Array<Record<string, unknown> | undefined> = [
    undefined,
    { enabled: false, max_stretch: 1.5, max_shear_deg: 10, scale_search: false },
    { enabled: true, max_stretch: 1.3, max_shear_deg: 8, scale_search: true },
  ];
  for (const wire of wireInputs) {
    let captured: { affine?: AffineOptions } | undefined;
    const ctx = {
      sheetDims: () => ({ w: 2000, h: 1500 }),
      symbolSweep: async (_sheet: string, _rect: unknown, opts: { affine?: AffineOptions }) => {
        captured = opts;
        return { matches: [], withheld: [] };
      },
    };
    const args: Record<string, unknown> = { sheet: "plan.pdf", seed_rect_norm: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 } };
    if (wire) args.affine = wire;
    const result = await executeAgentTool(ctx, "symbol_sweep", args);
    assert.ok(!("error" in (result as object)), `symbol_sweep should not refuse a valid affine wire shape: ${JSON.stringify(result)}`);
    assert.deepEqual(
      captured?.affine, affineOptionsFromWire(wire as Parameters<typeof affineOptionsFromWire>[0]),
      `wire=${JSON.stringify(wire)} — the canvas path's own AffineOptions must equal the shared translation's`,
    );
  }
});

// docs/SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md Phase B — `hold` on a withheld row
// must reach the agent tool result unchanged: the canvas dispatcher's own
// symbol_sweep case is a pure passthrough of whatever agentSymbolSweep
// returns, and this pins that no future field-filtering silently strips it.
test("symbol_sweep affine parity: a withheld row's `hold` field reaches the agent tool result unchanged", async () => {
  const ctx = {
    sheetDims: () => ({ w: 2000, h: 1500 }),
    symbolSweep: async () => ({
      matches: [],
      withheld: [{ at: [0.1, 0.1], score: 1, rotation: 0, mirrored: false, hold: "bounds", reason: "out of bounds" }],
    }),
  };
  const args: Record<string, unknown> = { sheet: "plan.pdf", seed_rect_norm: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 } };
  const result = await executeAgentTool(ctx, "symbol_sweep", args) as { withheld?: Array<{ hold?: string }> };
  assert.equal(result.withheld?.[0]?.hold, "bounds", "a held withheld row must not be stripped by the agent tool passthrough");
});
