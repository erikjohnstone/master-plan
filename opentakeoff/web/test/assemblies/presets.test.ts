// ASSEMBLIES WP8.2 — the starter's hook-up profile and responsibility presets as project
// settings (src/lib/assemblies/presets.ts): the defaults, a preset over them, and the
// project's own settings over both.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unreadSettings } from "../../src/lib/assemblies/expand.ts";
import {
  activeResponsibilityPresets, HOOKUP_SWITCHES, HOOKUP_VARIABLES, hookupProfileDefaults, RESPONSIBILITY_PRESETS, settingsWithPresets, withResponsibilityPreset,
} from "../../src/lib/assemblies/presets.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

test("the profile's switches and variables carry a label, a default and their sources", () => {
  assert.ok(HOOKUP_SWITCHES.length > 0 && HOOKUP_SWITCHES.every((s) => s.label && typeof s.default === "boolean" && s.sources.length > 0));
  assert.ok(HOOKUP_VARIABLES.length > 0 && HOOKUP_VARIABLES.every((v) => v.label && v.sources.length > 0));
  const d = hookupProfileDefaults();
  assert.deepEqual(Object.keys(d.profile).sort(), HOOKUP_SWITCHES.map((s) => s.id).sort());
  // A variable with no default waits for the project: it is not set.
  for (const v of HOOKUP_VARIABLES) assert.equal(v.id in d.variables, v.default !== null, v.id);
});

test("the starter library reads every setting the panel offers: each switch, variable and preset cell (AS-50)", () => {
  const starter = sanitizeAssemblyDefinitions(["us-typicals-v1.json", "us-hookups-v1.json"]
    .flatMap((f) => JSON.parse(readFileSync(join(STARTER_DIR, f), "utf8")).assemblies)).assemblies;
  const every = { profile: Object.fromEntries(HOOKUP_SWITCHES.map((s) => [s.id, true])), variables: Object.fromEntries(HOOKUP_VARIABLES.map((v) => [v.id, 1])) };
  assert.deepEqual(unreadSettings(starter, every), []);
  for (const p of RESPONSIBILITY_PRESETS) assert.deepEqual(unreadSettings(starter, withResponsibilityPreset({}, p.id)), [], p.id);
  // A library without the hook-ups reads none of the hook-up switches.
  const typicalsOnly = starter.filter((a) => !a.lines.some((l) => l.profile_switch));
  assert.equal(unreadSettings(typicalsOnly, { profile: every.profile }).length, HOOKUP_SWITCHES.length);
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
