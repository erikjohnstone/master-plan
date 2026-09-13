import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { extractControlSchematics } from "../../web/src/lib/controlSchematic.ts";
import { controlSchematicOutput } from "../src/outputs.ts";

const span = (str: string, x: number, y: number, w = 80, h = 16) => ({ str, x, y, w, h });

test("MCP control-diagram schema preserves the complete shared-engine result", () => {
  const result = extractControlSchematics([
    {
      key: "controls.pdf#1", sheet_number: "M6.1", width: 700, height: 700,
      spans: [
        span("AHU CONTROL SCHEMATIC", 100, 500, 350, 20),
        span("AI", 110, 112, 18, 16), span("TT", 106, 176, 28, 16),
      ],
      segs: [115, 112, 115, 200],
    },
    {
      key: "controls.pdf#2", sheet_number: "M7.1", width: 700, height: 700,
      spans: [
        span("BUILDING AUTOMATION NETWORK RISER DIAGRAM", 100, 500, 420, 20),
        span("ROOF", 40, 100, 60), span("FIRST FLOOR", 40, 400, 110),
        span("BACnet / IP", 350, 180, 100), span("ME Stack", 480, 330, 80),
        span("FOR CONTINUATION SEE SHEET M7.2", 180, 440, 270, 14),
      ],
      segs: [250, 80, 250, 430],
    },
  ]);

  const parsed = z.object(controlSchematicOutput).safeParse(result);
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues, null, 2));
  if (!parsed.success) return;
  assert.deepEqual(parsed.data, result, "declared MCP output must not strip fields from the shared result");
});
