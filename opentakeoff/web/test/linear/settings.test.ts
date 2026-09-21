// linear/settings.ts — sanitizeLinearSettings (#linear-takeoff WP2.4).
// Every field independently validated; unknown/malformed values are
// dropped rather than throwing, so a hand-edited or hostile project
// payload degrades this block to {} instead of wedging hydrate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeLinearSettings } from "../../src/lib/linear/settings.ts";

test("non-object input sanitizes to {}", () => {
  for (const raw of [undefined, null, 42, "x", []]) {
    assert.deepEqual(sanitizeLinearSettings(raw as never), {}, String(raw));
  }
});

test("a fully well-formed settings object round-trips unchanged", () => {
  const raw = {
    adopted_pipe_hanger_code: "upc313_3",
    climate_zone: "cz5_8",
    pressure_class_by_system: { SA: 2, HHWS: 1 },
    stick_length_by_material: { steel: 21, copper_pvc: 20 },
    offset_allowance_pct: 5,
  };
  assert.deepEqual(sanitizeLinearSettings(raw), raw);
});

test("adopted_pipe_hanger_code: only the four legal codes survive", () => {
  assert.equal(sanitizeLinearSettings({ adopted_pipe_hanger_code: "mss_sp58" }).adopted_pipe_hanger_code, "mss_sp58");
  assert.equal(sanitizeLinearSettings({ adopted_pipe_hanger_code: "nonsense" }).adopted_pipe_hanger_code, undefined);
});

test("climate_zone: only cz0_4/cz5_8 survive", () => {
  assert.equal(sanitizeLinearSettings({ climate_zone: "cz0_4" }).climate_zone, "cz0_4");
  assert.equal(sanitizeLinearSettings({ climate_zone: "tropical" }).climate_zone, undefined);
});

test("pressure_class_by_system / stick_length_by_material: non-numeric or non-positive entries are dropped; an all-dropped map is absent entirely", () => {
  const out = sanitizeLinearSettings({
    pressure_class_by_system: { SA: 2, HHWS: "two", bad: -1, [""]: 3, ok: 0.5 },
  });
  assert.deepEqual(out.pressure_class_by_system, { SA: 2, ok: 0.5 });
  const allBad = sanitizeLinearSettings({ pressure_class_by_system: { HHWS: "two", bad: -1 } });
  assert.equal("pressure_class_by_system" in allBad, false);
});

test("offset_allowance_pct: negative or non-finite is dropped, zero is kept", () => {
  assert.equal(sanitizeLinearSettings({ offset_allowance_pct: 5 }).offset_allowance_pct, 5);
  assert.equal(sanitizeLinearSettings({ offset_allowance_pct: 0 }).offset_allowance_pct, 0);
  assert.equal(sanitizeLinearSettings({ offset_allowance_pct: -5 }).offset_allowance_pct, undefined);
  assert.equal(sanitizeLinearSettings({ offset_allowance_pct: NaN }).offset_allowance_pct, undefined);
  assert.equal(sanitizeLinearSettings({ offset_allowance_pct: "5" }).offset_allowance_pct, undefined);
});
