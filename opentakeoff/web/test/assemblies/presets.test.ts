// ASSEMBLIES WP8.2 — the starter's hook-up profile and responsibility presets as project
// settings (src/lib/assemblies/presets.ts): the defaults, a preset over them, and the
// project's own settings over both.
import test from "node:test";
import assert from "node:assert/strict";
import {
  activeResponsibilityPresets, HOOKUP_SWITCHES, HOOKUP_VARIABLES, hookupProfileDefaults, RESPONSIBILITY_PRESETS, settingsWithPresets, withResponsibilityPreset,
} from "../../src/lib/assemblies/presets.ts";

test("the profile's switches and variables carry a label, a default and their sources", () => {
  assert.ok(HOOKUP_SWITCHES.length > 0 && HOOKUP_SWITCHES.every((s) => s.label && typeof s.default === "boolean" && s.sources.length > 0));
  assert.ok(HOOKUP_VARIABLES.length > 0 && HOOKUP_VARIABLES.every((v) => v.label && v.sources.length > 0));
  const d = hookupProfileDefaults();
  assert.deepEqual(Object.keys(d.profile).sort(), HOOKUP_SWITCHES.map((s) => s.id).sort());
  // A variable with no default waits for the project: it is not set.
  for (const v of HOOKUP_VARIABLES) assert.equal(v.id in d.variables, v.default !== null, v.id);
});

test("settingsWithPresets: the defaults, then the preset, then the project's own settings win", () => {
  const s = settingsWithPresets({
    profile: { hoses_at_terminal_coils: true },
    variables: { kit_max_in: 0 },
    responsibility: { "control-valve": { install: "mechanical" } },
  }, { hookupDefaults: true, responsibilityPreset: "valve-shipped-to-kit-maker" });
  assert.equal(s.profile!.hoses_at_terminal_coils, true, "the project's switch");
  assert.equal(s.profile!.strainer_at_coils, hookupProfileDefaults().profile.strainer_at_coils, "the starter's default");
  assert.equal(s.variables!.kit_max_in, 0);
  assert.equal(s.variables!.balancing, "manual");
  assert.deepEqual(s.responsibility!["control-valve"], { furnish: "controls", install: "mechanical" }, "the preset's furnish, the project's install");
  // Nothing asked for: the settings as given.
  const own = { variables: { spare_pct: 10 } };
  assert.deepEqual(settingsWithPresets(own), own);
  assert.throws(() => settingsWithPresets({}, { responsibilityPreset: "no-such-preset" }), /no responsibility preset/);
});

test("a preset is active while the settings hold every cell of it", () => {
  const id = "valve-by-controls-installed-by-mechanical";
  assert.ok(RESPONSIBILITY_PRESETS.some((p) => p.id === id));
  const s = withResponsibilityPreset({}, id);
  assert.ok(activeResponsibilityPresets(s).includes(id));
  assert.ok(!activeResponsibilityPresets({ responsibility: { "control-valve": { furnish: "controls" } } }).includes(id));
  assert.deepEqual(activeResponsibilityPresets({}), []);
});
