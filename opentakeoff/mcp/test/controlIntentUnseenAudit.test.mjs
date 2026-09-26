// CONTROL INTENT WP4.2 — the unseen audit's rules
// (scripts/control-intent-unseen-audit.mjs): which corpus sets it may read,
// and how a run's applied decisions compare with the audit record.
import test from "node:test";
import assert from "node:assert/strict";
import { compareWithRecord, decisionKey, eligibleSets, mergeRun } from "../scripts/control-intent-unseen-audit.mjs";

test("eligible sets: never dev, held-out, a held-out twin or drafter's set, or a copy of a dev document", () => {
  const spec = { sets: ["dev-a", "held-b", "twin-c", "drafter-d", "copy-e", "free-f", "free-g"].map((id) => ({ id })) };
  const split = { dev: { sets: ["dev-a"] }, heldout: { sets: ["held-b"] } };
  const hygiene = { not_unseen: { heldout_twin: ["twin-c"], heldout_drafter: ["drafter-d"], dev_twin_or_near: ["copy-e"] } };
  assert.deepEqual(eligibleSets(spec, split, hygiene), ["free-f", "free-g"]);
  // The assemblies second tier's documents, and a held-out-2 drafter's withheld ones, are not unseen either.
  const spec2 = { sets: [...spec.sets, ...["dev2-h", "held2-i", "withheld-j", "free-k"].map((id) => ({ id }))] };
  const tier2 = { dev: { sets: ["dev2-h"] }, heldout: { sets: ["held2-i"], withheld: ["withheld-j"] } };
  assert.deepEqual(eligibleSets(spec2, split, hygiene, tier2), ["free-f", "free-g", "free-k"]);
});

test("a run's decisions against the record: audited ones keep their verdict, a decision that differs in value or rule is new, one no longer applied is gone", () => {
  const d = (tag, question, value, rule = "drawing_read:agree(r0,r1)") => ({ set: "s", tag, question, value, rule });
  const record = [
    { ...d("AHU-1", "role", "in"), verdict: "right" },
    { ...d("AHU-1", "opt.return_fan", true), verdict: "wrong" },
    { ...d("EF-1", "opt.motorized_damper", true), verdict: "right" },
    { ...d("VAV-1", "opt.co2_sensor", true), verdict: "unaudited" },
  ];
  const applied = [
    d("AHU-1", "role", "in"),
    d("AHU-1", "opt.return_fan", true),
    d("EF-1", "opt.motorized_damper", false),
    d("VAV-1", "opt.co2_sensor", true, "drawing_read:rp.co2_sensor.symbol_in_zone"),
  ];
  const c = compareWithRecord(applied, record);
  assert.deepEqual([c.audited.length, c.right, c.wrong, c.unaudited], [2, 1, 1, 0]);
  assert.deepEqual(c.new.map((x) => `${x.tag} ${x.question}`), ["EF-1 opt.motorized_damper", "VAV-1 opt.co2_sensor"]);
  assert.deepEqual(c.gone.map((x) => `${x.tag} ${x.question}`), ["EF-1 opt.motorized_damper", "VAV-1 opt.co2_sensor"]);
  assert.notEqual(decisionKey(d("EF-1", "opt.motorized_damper", true)), decisionKey(d("EF-1", "opt.motorized_damper", false)));
});

test("a run over some sets is compared with their part of the record only, and leaves the other sets' decisions, verdicts and status as recorded", () => {
  const d = (set, tag, question, value, rule = "drawing_read:agree(r0,r1)") => ({ set, tag, question, value, rule });
  const record = {
    sets: [{ id: "a", status: "read", applied: 2 }, { id: "b", status: "read", applied: 1 }, { id: "c", status: "no_snapshot" }],
    decisions: [
      { ...d("a", "AHU-1", "role", "in"), verdict: "right", checked: "2026-09-26" },
      { ...d("a", "EF-1", "opt.motorized_damper", true), verdict: "right" },
      { ...d("b", "P-1", "role", "in"), verdict: "wrong" },
    ],
  };
  // Re-read set c (now snapshotted) and set a: a's EF-1 is no longer applied, c applies one new decision.
  const sets = [{ id: "a", status: "read", applied: 1 }, { id: "c", status: "read", applied: 1 }];
  const applied = [d("a", "AHU-1", "role", "in"), d("c", "FCU-1", "role", "in")];
  const m = mergeRun(record, ["a", "c"], sets, applied);
  assert.deepEqual([m.cmp.audited.length, m.cmp.right, m.cmp.wrong], [1, 1, 0]);
  assert.deepEqual(m.cmp.new.map((x) => `${x.set} ${x.tag}`), ["c FCU-1"]);
  // Only set a's decision is gone; set b, not in this run, is not.
  assert.deepEqual(m.cmp.gone.map((x) => `${x.set} ${x.tag}`), ["a EF-1"]);
  assert.deepEqual(m.decisions.map((x) => `${x.set} ${x.tag} ${x.verdict}${x.checked ? ` ${x.checked}` : ""}`), ["b P-1 wrong", "a AHU-1 right 2026-09-26", "c FCU-1 unaudited"]);
  assert.deepEqual(m.sets.map((s) => `${s.id} ${s.status}`), ["b read", "a read", "c read"]);
  // A run over every set is the whole record.
  const all = mergeRun(record, ["a", "b", "c"], sets, applied);
  assert.deepEqual(all.kept, []);
  assert.deepEqual(all.cmp.gone.map((x) => `${x.set} ${x.tag}`), ["a EF-1", "b P-1"]);
});

test("a set that is no longer unseen leaves the record with its decisions, and the record keeps naming it", () => {
  const d = (set, tag, question, value, rule = "drawing_read:agree(r0,r1)") => ({ set, tag, question, value, rule });
  const record = {
    sets: [{ id: "a", status: "read", applied: 1 }, { id: "d", status: "read", applied: 1 }, { id: "e", status: "no_scheduled_units" }],
    decisions: [{ ...d("a", "AHU-1", "role", "in"), verdict: "right" }, { ...d("d", "EF-1", "role", "in"), verdict: "right" }],
  };
  // A later hygiene scan finds set d a held-out drafter's and a dev draw takes set e: neither is eligible now.
  const m = mergeRun(record, ["a"], [{ id: "a", status: "read", applied: 1 }], [d("a", "AHU-1", "role", "in")], ["a", "b"]);
  assert.deepEqual(m.withdrawn, ["d", "e"]);
  assert.deepEqual(m.decisions.map((x) => `${x.set} ${x.tag} ${x.verdict}`), ["a AHU-1 right"]);
  assert.deepEqual(m.sets.map((s) => s.id), ["a"]);
  assert.deepEqual([m.cmp.new.length, m.cmp.gone.length], [0, 0]);
  // The next run's record no longer holds d or e, and still names them.
  const next = mergeRun({ sets: m.sets, decisions: m.decisions, totals: { withdrawn: m.withdrawn } }, ["a", "b"], [{ id: "a", status: "read", applied: 1 }, { id: "b", status: "no_snapshot" }], [d("a", "AHU-1", "role", "in")], ["a", "b"]);
  assert.deepEqual(next.withdrawn, ["d", "e"]);
  // Without an eligible list nothing is withdrawn.
  assert.deepEqual(mergeRun(record, ["a"], [], [], null).withdrawn, []);
});
