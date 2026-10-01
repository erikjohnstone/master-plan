// CONTROL INTENT WP4.2 — the robustness suite's rules
// (scripts/control-intent-robustness-eval.mjs), on synthetic readings and
// bindings: which packets the adversarial swap rebinds to which units, what
// counts as a decision resting on the swap, and how a re-run's decisions are
// compared.
import test from "node:test";
import assert from "node:assert/strict";
import { decisionDiff, swapOutcome, swapPlan } from "../scripts/control-intent-robustness-eval.mjs";

const inst = (item, tag, family) => ({ item, tag, family });
const row = (cells) => ({ cells: Object.fromEntries(Object.entries(cells).map(([h, text]) => [h, { text }])) });

test("swap plan: another family never takes a drive's detail when its row prints a VFD; another tag is one the title does not name", () => {
  const first = {
    instances: [inst(0, "EF-1", "FAN"), inst(1, "EF-2", "FAN"), inst(2, "EF-5", "FAN"), inst(3, "P-1", "PUMP"), inst(4, "VAV-1", "VAV")],
    control: {
      packets: [
        { id: "ef", title: "EXHAUST FAN (EF-1 THRU EF-2)" },
        { id: "vfd", title: "VARIABLE FREQUENCY DRIVE CONTROL" },
      ],
      bindings: {
        0: [{ packet: "ef", kind: "list_range", evidence: "t" }],
        1: [{ packet: "ef", kind: "list_range", evidence: "t" }],
        3: [{ packet: "vfd", kind: "family_detail", evidence: "its row prints a VFD" }],
      },
    },
  };
  // Every fan and the pump print a VFD; the VAV box does not.
  const vfd = row({ STARTER: "VFD" });
  const project = { items: [vfd, vfd, vfd, vfd, row({ "BOX TYPE": "SINGLE DUCT" })] };
  const readable = first.instances;
  const family = swapPlan("family", { project, first, readable });
  // The fans' detail goes to a unit of another family; the drive's detail
  // skips every unit whose row prints a VFD (the binder's own rule would
  // bind it there), and takes the VAV box.
  const where = (plan, packet) => [...plan].filter(([, bs]) => bs.some((b) => b.packet === packet)).map(([item]) => item);
  assert.deepEqual(where(family, "vfd"), [4]);
  assert.ok(where(family, "ef").every((i) => ![0, 1, 2].includes(i)));
  assert.equal(family.get(4).find((b) => b.packet === "vfd").kind, "family_detail");
  const tag = swapPlan("tag", { project, first, readable });
  // Only the titled packet, to the fan its range does not name.
  assert.deepEqual([...tag.keys()], [2]);
  assert.deepEqual(tag.get(2), [{ packet: "ef", kind: "list_range", evidence: 'its title "EXHAUST FAN (EF-1 THRU EF-2)" names EF-5 in a list or range' }]);
});

test("swap outcome: a decision rests on the swap when a reading cites a swapped packet or it is an absence; the zone plan's does not", () => {
  const cite = (packet) => ({ packet, sheet: "s", lines: [], text: "x", box: [0, 0, 1, 1] });
  const readings = { units: [{
    item: 4, tag: "VAV-1", family: "VAV", questions: [{ id: "role" }, { id: "opt.co2_sensor" }, { id: "opt.window_switch" }, { id: "opt.scr_heat" }],
    answers: [
      { reader: "r1", question: "role", answer: "commands", cites: [cite("ef")], note: "unverified" },
      { reader: "r0", question: "opt.scr_heat", answer: "no", cites: [cite("ef")] },
      { reader: "rp", question: "opt.co2_sensor", answer: "yes", cites: [cite("s#zones")] },
    ],
    decisions: [
      { question: "role", outcome: "none", value: null, rule: "drawing_read:not_shown", answers: [] },
      { question: "opt.co2_sensor", outcome: "applied", value: true, rule: "drawing_read:rp.co2_sensor.symbol_in_zone", answers: [{ reader: "rp", cites: [cite("s#zones")] }] },
      { question: "opt.window_switch", outcome: "applied", value: false, rule: "drawing_read:absence", answers: [{ reader: "r0", cites: [] }] },
      { question: "opt.scr_heat", outcome: "proposal", value: false, rule: "drawing_read:single(r0)", answers: [{ reader: "r0", cites: [cite("ef")] }] },
    ],
  }] };
  const plan = new Map([[4, [{ packet: "ef", kind: "list_range", evidence: "t" }]]]);
  const s = swapOutcome(readings, plan, () => "EXHAUST FAN");
  assert.deepEqual({ units: s.units, questions: s.questions, rest: s.rest, applied: s.applied, proposal: s.proposal, elsewhere: s.elsewhere, elsewhere_applied: s.elsewhere_applied, answers: s.answers, unverified: s.unverified },
    { units: 1, questions: 4, rest: 2, applied: 1, proposal: 1, elsewhere: 1, elsewhere_applied: 1, answers: 2, unverified: 1 });
  assert.equal(s.applied_list[0].question, "opt.window_switch");
});

test("decision diff: a change is an outcome or a value that differs, over the decisions either run makes", () => {
  const d = (question, outcome, value) => ({ question, outcome, value, answers: [] });
  const a = { units: [{ item: 1, tag: "AHU-1", decisions: [d("role", "applied", "in"), d("opt.a", "proposal", true), d("opt.b", "none", null), d("opt.c", "applied", false)] }] };
  const b = { units: [{ item: 1, tag: "AHU-1", decisions: [d("role", "applied", "in"), d("opt.a", "none", null), d("opt.b", "applied", true), d("opt.c", "applied", true)] }] };
  const { total, changes } = decisionDiff(a, b);
  assert.equal(total, 4);
  assert.deepEqual(changes.map((c) => `${c.question}: ${c.from} → ${c.to}`), ["opt.a: proposal true → none", "opt.c: applied false → applied true", "opt.b: none → applied true"]);
});
