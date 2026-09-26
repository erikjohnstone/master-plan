// CONTROL INTENT WP4.2 — the unseen audit's rules
// (scripts/control-intent-unseen-audit.mjs): which corpus sets it may read,
// and how a run's applied decisions compare with the audit record.
import test from "node:test";
import assert from "node:assert/strict";
import { compareWithRecord, decisionKey, eligibleSets } from "../scripts/control-intent-unseen-audit.mjs";

test("eligible sets: never dev, held-out, a held-out twin or drafter's set, or a copy of a dev document", () => {
  const spec = { sets: ["dev-a", "held-b", "twin-c", "drafter-d", "copy-e", "free-f", "free-g"].map((id) => ({ id })) };
  const split = { dev: { sets: ["dev-a"] }, heldout: { sets: ["held-b"] } };
  const hygiene = { not_unseen: { heldout_twin: ["twin-c"], heldout_drafter: ["drafter-d"], dev_twin_or_near: ["copy-e"] } };
  assert.deepEqual(eligibleSets(spec, split, hygiene), ["free-f", "free-g"]);
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
