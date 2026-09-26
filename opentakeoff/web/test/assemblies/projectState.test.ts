// ASSEMBLIES WP5.2 — a project's assemblies in its file (src/lib/assemblies/projectState.ts):
// the pinned definitions, settings and overrides round-trip; a library edit never changes a
// saved project silently (A5); "update to latest" is a per-line diff that applies nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyAssemblies, type CompiledItem } from "../../src/lib/assemblies/apply.ts";
import type { NormalizedItem } from "../../src/lib/assemblies/normalize.ts";
import {
  adoptUpdate, ASSEMBLIES_STATE_SCHEMA, emptyAssembliesState, libraryUpdates, pinUsed, projectLibrary, sanitizeAssembliesState,
} from "../../src/lib/assemblies/projectState.ts";
import { sanitizeAssemblyDefinitions, type AssemblyDefinition } from "../../src/lib/assemblies/schema.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";
import { appendAnswer, replayAnswers } from "../../src/lib/controlIntent/journal.ts";

const LIB = sanitizeAssemblyDefinitions([
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies,
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-hookups-v1.json"), "utf8")).assemblies,
]).assemblies;
const byId = (id: string) => LIB.find((a) => a.id === id)!;

const items: CompiledItem[] = [
  { family: "PUMP", tag: "P-1", sheet_id: "s.pdf#2", table_title: "PUMP SCHEDULE", cells: { MARK: { text: "P-1", bbox: [0, 0, 1, 1] } } },
  { family: "FCU", tag: "FCU-1", sheet_id: "s.pdf#3", table_title: "FAN COIL SCHEDULE", cells: { MARK: { text: "FCU-1", bbox: [0, 0, 1, 1] } } },
];
const norm = (it: CompiledItem, values: Record<string, string | number>): NormalizedItem => ({
  family: it.family, tag: it.tag, unknown: {},
  attributes: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v, printed: String(v), rule: "t", cite: { sheet: it.sheet_id, table_title: it.table_title, header: k, bbox: null } }])),
});
const normalized = [norm(items[0], { vfd: "yes" }), norm(items[1], { ecm: "yes", cooling_type: "chw", heating_type: "hw" })];

/** A newer version of a starter record, as a partner library edit would ship it. */
function bumped(def: AssemblyDefinition): AssemblyDefinition {
  const next = structuredClone(def);
  next.version = "2";
  next.options = next.options.map((o) => (o.id === "ufc_minimum_points" ? { ...o, default: true } : o));
  next.lines = [...next.lines.slice(1), { ...next.lines[1], id: "new-line" }];
  return next;
}

test("the project file's block round-trips; the gate names everything it drops", () => {
  const state = { ...emptyAssembliesState(), pinned: [byId("pump-vfd")], settings: { partnerDefaults: { ecm: "no" }, variables: { spare_pct: 10 } },
    overrides: [{ tag: "P-1", reason: "owner standard", options: { ufc_minimum_points: true } }] };
  const wire = JSON.parse(JSON.stringify(state));
  const back = sanitizeAssembliesState(wire);
  assert.deepEqual(back.dropped, []);
  assert.deepEqual(back.state, state);
  assert.deepEqual(sanitizeAssembliesState(undefined), { state: null, dropped: [] });
  const bad = sanitizeAssembliesState({
    schema: ASSEMBLIES_STATE_SCHEMA,
    pinned: [byId("fcu"), { ...byId("fcu"), version: "9" }, { id: "Bad Id" }],
    settings: { profile: { x: "yes" } },
    overrides: [{ tag: "P-1" }, { tag: "P-2", reason: "ok", exclude: true }],
  });
  assert.equal(bad.state!.pinned.length, 1, "one version per id");
  assert.deepEqual(bad.state!.overrides, [{ tag: "P-2", reason: "ok", exclude: true }]);
  assert.deepEqual(bad.state!.settings, {});
  assert.equal(bad.dropped.length, 4, bad.dropped.join("\n"));
  assert.match(bad.dropped.join("\n"), /a second version of fcu/);
  assert.match(bad.dropped.join("\n"), /override 1: reason/);
  assert.equal(sanitizeAssembliesState({ schema: "x" }).state, null);
});

test("applying pins what the records used (with the sub-assemblies their lines name); a library edit then changes nothing (A5)", () => {
  const first = applyAssemblies({ project: { items }, library: projectLibrary(null, LIB), normalized });
  const state = pinUsed(emptyAssembliesState(), first.applications, LIB);
  const pinnedIds = state.pinned.map((a) => a.id);
  for (const a of first.applications) if (a.assembly) assert.ok(pinnedIds.includes(a.assembly.id), `${a.assembly.id} pinned`);
  // A hook-up names its coil or pump part as a sub-assembly line: pinned too.
  const subs = state.pinned.flatMap((a) => a.lines.filter((l) => l.kind === "assembly" && l.ref).map((l) => l.ref!.id));
  for (const id of subs) assert.ok(pinnedIds.includes(id), `sub-assembly ${id} pinned`);
  assert.ok(subs.length > 0, "the fixture exercises a sub-assembly");

  // The partner ships a new pump-vfd; the saved project applies what it pinned.
  const edited = [...LIB.filter((a) => a.id !== "pump-vfd"), bumped(byId("pump-vfd"))];
  const again = applyAssemblies({ project: { items }, library: projectLibrary(state, edited), normalized });
  assert.equal(JSON.stringify(again.lines), JSON.stringify(first.lines), "same lines: nothing changed silently");
  assert.equal(again.applications.find((a) => a.instance.tag === "P-1" && a.layer === "controls")!.assembly!.version, "1");
  // An id the project never used comes from the library's newest.
  assert.ok(projectLibrary(state, edited).some((a) => a.id === "boiler"));
});

test("update to latest: a per-option, per-line diff that applies nothing until adopted", () => {
  const state = pinUsed(emptyAssembliesState(), applyAssemblies({ project: { items }, library: LIB, normalized }).applications, LIB);
  assert.deepEqual(libraryUpdates(state, LIB), [], "no newer version: nothing to show");
  const newer = bumped(byId("pump-vfd"));
  const edited = [...LIB, newer];
  const ups = libraryUpdates(state, edited);
  assert.equal(ups.length, 1);
  const u = ups[0];
  assert.deepEqual([u.id, u.from, u.to], ["pump-vfd", "1", "2"]);
  assert.deepEqual(u.fields, ["version"]);
  assert.deepEqual(u.options, [{ id: "ufc_minimum_points", change: "changed", fields: ["default"] }]);
  const first = byId("pump-vfd").lines[0].id;
  assert.ok(u.lines.some((l) => l.id === first && l.change === "removed"));
  assert.ok(u.lines.some((l) => l.id === "new-line" && l.change === "added"));
  // Still pinned at v1 until the user adopts it.
  assert.equal(state.pinned.find((a) => a.id === "pump-vfd")!.version, "1");
  const adopted = adoptUpdate(state, "pump-vfd", edited);
  assert.equal(adopted.pinned.find((a) => a.id === "pump-vfd")!.version, "2");
  assert.deepEqual(libraryUpdates(adopted, edited), []);
  assert.equal(adoptUpdate(state, "boiler", edited), state, "an id not pinned is not adopted by this path");
});

test("the answer journal rides the project file whole, or is dropped whole and named (a hash chain has no partial read)", async () => {
  const a = await appendAnswer([], {
    operation_id: crypto.randomUUID(), expected_head: null, reviewer: "estimator", reason: "owner's letter",
    question: "PQ2", answer: "dod", prefill: null,
  }, { origin: "operator_input" });
  const state = { ...emptyAssembliesState(), answer_journal: a.events };
  const back = sanitizeAssembliesState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(back.dropped, []);
  assert.deepEqual(back.state, state);
  assert.deepEqual((await replayAnswers(back.state!.answer_journal!)).answers, { PQ2: "dod" });
  const broken = sanitizeAssembliesState({ ...JSON.parse(JSON.stringify(state)), answer_journal: [{ ...a.events[0], approved: true }] });
  assert.equal(broken.state!.answer_journal, undefined);
  assert.match(broken.dropped.join("\n"), /answer_journal: .*approved.*the project's answers were not read/);
  assert.equal(sanitizeAssembliesState({ ...emptyAssembliesState(), answer_journal: [] }).state!.answer_journal, undefined, "an empty journal is no journal");
});
