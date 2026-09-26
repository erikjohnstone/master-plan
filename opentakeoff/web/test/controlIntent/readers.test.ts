// CONTROL INTENT WP3: the readers (text, R0, R1, R2), the combiner, the run
// store and the reading record — synthetic packets and canned model replies
// only (no document text, no live model).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NoteSpan } from "../../src/lib/assemblies/scheduleNotes.ts";
import { findPackets, type Packet } from "../../src/lib/controlIntent/evidence.ts";
import type { Binding } from "../../src/lib/controlIntent/binding.ts";
import { closeLetterSpacing, leadSubject, normText, packetText, printedIn } from "../../src/lib/controlIntent/readers/text.ts";
import { compileTermList, TERM_LIST } from "../../src/lib/controlIntent/readers/terms.ts";
import { readR0, namesUnit, type BoundPacket, type ReaderAnswer } from "../../src/lib/controlIntent/readers/r0.ts";
import type { ReadingQuestion } from "../../src/lib/controlIntent/readers/questions.ts";
import { r1Answers, r1Request } from "../../src/lib/controlIntent/readers/r1.ts";
import { cropSpec, joinRun, r2PacketAnswers, SPAN_PX_PER_PT } from "../../src/lib/controlIntent/readers/r2.ts";
import { combineUnit, decisionIntent } from "../../src/lib/controlIntent/combine.ts";
import { memoryRunStore, recordedCall, requestHash, type ModelRequest, type Transport } from "../../src/lib/controlIntent/runs.ts";
import { readControlIntent } from "../../src/lib/controlIntent/record.ts";
import { applyAssemblies, type CompiledItem, type CompiledProject } from "../../src/lib/assemblies/apply.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { RENDER_SCALE } from "../../src/lib/sheets.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const LIB = sanitizeAssemblyDefinitions(JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies).assemblies;

/** A span of `str` at (x, y), `h` tall, about 0.55 h per character wide. */
const sp = (str: string, x: number, y: number, h = 19): NoteSpan => ({ str, x0: x, y0: y, x1: x + str.length * 0.55 * h, y1: y + h });
/** A packet over some spans (the finder's region is not under test here). */
const packet = (id: string, title: string, spans: NoteSpan[], kind: Packet["kind"] = "diagram"): Packet => ({
  id, sheet: "set.pdf#5", kind, scope: "detail", title, title_box: [0, 0, 1, 1], direction: "above_title", region: [0, 0, 4000, 4000], spans,
});
const bound = (p: Packet, kind: Binding["kind"] = "tag", extra: Partial<Binding> = {}): BoundPacket => ({ packet: p, text: packetText(p), binding: { packet: p.id, kind, evidence: "test", ...extra } });
const role: ReadingQuestion = { id: "role", kind: "role" };
const opt = (option: string): ReadingQuestion => ({ id: `opt.${option}`, kind: "option", option, label: option, device: TERM_LIST.options[option]?.device });

// ── text ────────────────────────────────────────────────────────────────────

test("text: two columns read one at a time; a list marker reads before its line; a centred title below crosses no column", () => {
  const left = ["THE SUPPLY FAN SHALL START", "AND RUN CONTINUOUSLY.", "1.", "SEND AN OPEN COMMAND TO THE DAMPER."];
  const right = ["THE HEATING VALVE SHALL", "MODULATE TO MAINTAIN SETPOINT."];
  const spans = [
    sp(left[0], 100, 100), sp(left[1], 100, 123), sp(left[2], 100, 146), sp(left[3], 130, 146),
    sp(right[0], 900, 100), sp(right[1], 900, 123),
    sp("SPLIT SYSTEM SEQUENCE OF OPERATION", 400, 200, 30),
  ];
  const t = packetText(packet("p1", "SPLIT SYSTEM SEQUENCE OF OPERATION", spans, "sequence"));
  const texts = t.paragraphs.map((p) => p.text);
  assert.ok(texts.includes("THE SUPPLY FAN SHALL START AND RUN CONTINUOUSLY."), texts.join(" | "));
  assert.ok(texts.includes("1. SEND AN OPEN COMMAND TO THE DAMPER."), texts.join(" | "));
  assert.ok(texts.includes("THE HEATING VALVE SHALL MODULATE TO MAINTAIN SETPOINT."), texts.join(" | "));
  assert.ok(t.clauses.some((c) => c.norm === "THE HEATING VALVE SHALL MODULATE TO MAINTAIN SETPOINT."));
});

test("text: letter-spaced print closes up to dictionary words; real word pairs stay apart; quotes verify spacing aside", () => {
  assert.equal(normText("W HEN THE O UTDOO R AIR TEM PERATURE SENSO R SHALL M O DULATE THE CONTRO L VALVE"), "WHEN THE OUTDOOR AIR TEMPERATURE SENSOR SHALL MODULATE THE CONTROL VALVE");
  assert.equal(normText("TW O - PO SITION DAM PER"), "TWO - POSITION DAMPER");
  assert.equal(closeLetterSpacing("CO NTRO L"), "CONTROL");
  assert.equal(closeLetterSpacing("IN TO THE UNIT"), "IN TO THE UNIT");
  assert.ok(printedIn("MODULATE THE CONTROL VALVE", "SENSOR SHALL M O DULATE THE CONTRO L VALVE AND"));
  assert.ok(!printedIn("MODULATE THE HEATING VALVE", "SENSOR SHALL MODULATE THE CONTROL VALVE"));
});

// ── the term list ───────────────────────────────────────────────────────────

test("term list: every pattern has a source the list defines, dev-document sources name two drafters or more, and a bad entry fails at load", () => {
  const all = [...TERM_LIST.role.not_connected, ...TERM_LIST.role.local_control, ...Object.values(TERM_LIST.options).flatMap((o) => [...o.mention, ...o.yes, ...o.no, ...o.traps])];
  assert.ok(all.length > 60);
  for (const p of all) {
    assert.ok(p.sources.length > 0, p.id);
    for (const s of p.sources) {
      assert.ok(TERM_LIST.sources[s], `${p.id}: ${s}`);
      if (s.startsWith("dev-")) assert.match(TERM_LIST.sources[s], /\bdev documents of [2-9] drafters\b/, s);
    }
  }
  // Every option the term list covers is a library option.
  const options = new Set(LIB.flatMap((a) => a.options.map((o) => o.id)));
  for (const o of Object.keys(TERM_LIST.options)) assert.ok(options.has(o), o);
  const raw = { version: "t", sources: { lib: "x" }, role: {}, options: { a: { device: "d", mention: [{ id: "m", re: "X", sources: ["lib"] }], yes: [{ id: "y", re: "X", sources: [] }] } } };
  assert.throws(() => compileTermList(raw), /no source/);
  assert.throws(() => compileTermList({ ...raw, options: { a: { ...raw.options.a, yes: [{ id: "y", re: "X", sources: ["nope"] }] } } }), /unknown source/);
  assert.throws(() => compileTermList({ ...raw, options: { a: { ...raw.options.a, yes: [{ id: "y", re: "(", sources: ["lib"] }] } } }));
  assert.throws(() => compileTermList({ ...raw, options: { a: { ...raw.options.a, yes: [{ id: "y", re: "X?", sources: ["lib"] }] } } }), /empty/);
});

// ── R0 ──────────────────────────────────────────────────────────────────────

test("R0: a standalone statement in the unit's own titled packet is whitelisted; through a family detail it is not", () => {
  const p = packet("p1", "GENERAL EXHAUST FAN SEQUENCE OF OPERATION", [sp("THE EXHAUST FAN SHALL BE CONTROLLED THROUGH A WALL SWITCH.", 100, 100), sp("THIS SYSTEM IS STANDALONE AND NOT CONTROLLED BY THE DDC SYSTEM.", 100, 123)], "sequence");
  const own = readR0({ tag: "EF-1", family: "FAN" }, [bound(p, "list_range")], [role], TERM_LIST);
  assert.equal(own[0].answer, "not_connected");
  assert.equal(own[0].whitelisted, true);
  const family = readR0({ tag: "EF-4", family: "FAN" }, [bound(p, "family_detail")], [role], TERM_LIST);
  assert.equal(family[0].answer, "not_connected");
  assert.equal(family[0].whitelisted, undefined);
});

test("R0: the negation guard reads a negated device as its absence; a trap is never the device", () => {
  const p = packet("p1", "AHU-1 CONTROLS", [sp("SMOKE MODE OUTSIDE AIR", 100, 100), sp("NO SMOKE DETECTORS ARE REQUIRED.", 100, 300)]);
  const [a] = readR0({ tag: "AHU-1" }, [bound(p)], [opt("duct_smoke_detectors")], TERM_LIST);
  assert.equal(a.answer, "no");
  const q = packet("p2", "AHU-2 CONTROLS", [sp("SMOKE MODE OUTSIDE AIR", 100, 100), sp("FREEZESTAT", 100, 300)]);
  const [b] = readR0({ tag: "AHU-2" }, [bound(q)], [opt("duct_smoke_detectors")], TERM_LIST);
  assert.equal(b.answer, "absent", "SMOKE MODE is not a smoke detector");
});

test("R0: absence is read only through a packet a title binds to the unit; a shared packet speaks for the unit only where it names it", () => {
  const p = packet("p1", "VAV BOX CONTROL DIAGRAM", [sp("ZONE TEMPERATURE SENSOR", 100, 100), sp("AO - DAMPER", 100, 300)]);
  const [fam] = readR0({ tag: "VAV-1" }, [bound(p, "family_detail")], [opt("co2_sensor")], TERM_LIST);
  assert.equal(fam.answer, "not_shown", "a typical detail need not draw a zone's CO2 sensor");
  const [own] = readR0({ tag: "VAV-1" }, [bound(p, "tag")], [opt("co2_sensor")], TERM_LIST);
  assert.equal(own.answer, "absent");
  const sys = packet("p2", "HEATING HOT WATER SYSTEM - SEQUENCE OF OPERATION", [
    sp("THE BMS SHALL MODULATE BOILER ISOLATION VALVES TO BALANCE FLOW.", 100, 100),
    sp("THE PUMP ISOLATION VALVE SHALL CLOSE WHEN THE PUMP STOPS.", 100, 300),
  ], "sequence");
  const [boiler] = readR0({ tag: "B-1", family: "BOILER" }, [bound(sys, "tag_body")], [opt("isolation_valve")], TERM_LIST);
  assert.equal(boiler.answer, "yes");
  assert.match(boiler.cites[0].text, /BOILER ISOLATION VALVES/);
  assert.ok(namesUnit("THE LEAD HOT WATER PUMP SHALL START", { tag: "HWP-1", family: "PUMP" }));
  assert.ok(!namesUnit("THE PUMPS SHALL RUN", { tag: "BP-1", family: "PUMP" }));
});

test("R0: in a packet titled for other units of its family, the family's noun is theirs; only the unit's own tag speaks for it", () => {
  // Robustness find (an unseen set): EF-3, printed in the body of "EXHAUST
  // FAN (EF-1,2) SEQUENCE", took "EXHAUST FAN SHALL OPEN THE ... DAMPER".
  const seq = packet("p4", "EXHAUST FAN (EF-1,2) SEQUENCE OF OPERATION", [
    sp("1. WHEN COMMANDED TO RUN, EXHAUST FAN SHALL OPEN THE INTERLOCKED MOTORIZED DAMPER.", 100, 100),
    sp("2. EF-3 SHALL RUN WHENEVER EF-1 RUNS.", 100, 146),
  ], "sequence");
  const shared = { ...bound(seq, "tag_body"), othersTitled: true };
  const [damper] = readR0({ tag: "EF-3", family: "FAN" }, [shared], [opt("motorized_damper")], TERM_LIST);
  assert.equal(damper.answer, "not_shown", "the damper clause is EF-1 and EF-2's");
  // Without a title for other fans, the family's noun still names it.
  const [system] = readR0({ tag: "EF-3", family: "FAN" }, [bound(seq, "tag_body")], [opt("motorized_damper")], TERM_LIST);
  assert.equal(system.answer, "yes");
  assert.ok(!namesUnit("EXHAUST FAN SHALL OPEN THE DAMPER", { tag: "EF-3", family: "FAN" }, true));
  assert.ok(namesUnit("EF-3 SHALL RUN WHENEVER EF-1 RUNS", { tag: "EF-3", family: "FAN" }, true));
});

test("text + R0: a section runs from a heading to the next; in a shared packet, a section whose heading names the unit speaks for it", () => {
  const seq = packet("p3", "AIR HANDLING UNIT SEQUENCE OF OPERATION", [
    sp("HUMIDIFICATION MODE OF OPERATION :", 100, 100),
    sp("THE MODE SHALL BE ENABLED WHENEVER THE FOLLOWING CONDITION EXISTS:", 100, 123),
    sp("1.", 100, 170), sp("ANY SPACE RELATIVE HUMIDITY DECREASES BELOW ITS SET POINT.", 130, 170),
    sp("2.", 100, 216), sp("SEND AN ENABLE COMMAND TO THE HUMIDIFIER.", 130, 216),
    sp("DEHUMIDIFICATION MODE OF OPERATION :", 100, 300),
    sp("1.", 100, 346), sp("THE RETURN AIR HUMIDITY SHALL BE MONITORED.", 130, 346),
  ], "sequence");
  const t = packetText(seq);
  const under = (s: string) => t.paragraphs.find((p) => p.text.includes(s))?.heading;
  assert.equal(under("ANY SPACE RELATIVE HUMIDITY"), "HUMIDIFICATION MODE OF OPERATION :");
  assert.equal(under("RETURN AIR HUMIDITY"), "DEHUMIDIFICATION MODE OF OPERATION :");
  assert.equal(under("THE MODE SHALL BE ENABLED"), "HUMIDIFICATION MODE OF OPERATION :", "a sentence ending in a colon heads nothing");
  const [hum] = readR0({ tag: "HUM-1", family: "HUMIDIFIER" }, [bound(seq, "tag_body")], [opt("space_humidity")], TERM_LIST);
  assert.equal(hum.answer, "yes", "the humidification section is the humidifier's; the dehumidification one is not");
  assert.match(hum.cites[0].text, /SPACE RELATIVE HUMIDITY/);
  const [fan] = readR0({ tag: "EF-1", family: "FAN" }, [bound(seq, "tag_body")], [opt("space_humidity")], TERM_LIST);
  assert.equal(fan.answer, "not_shown", "no heading names the fan");
});

test("text: a list item with no subject of its own carries its lead-in's; the list ends at a paragraph that is no item", () => {
  assert.equal(leadSubject("WHEN THE ABOVE CONDITIONS ARE MET, THE DDC CONTROLLER SHALL SEQUENCE THE FOLLOWING:"), "THE DDC CONTROLLER");
  assert.equal(leadSubject("WHEN THE ABOVE CONDITION EXISTS THE THERMOSTAT SHALL SEQUENCE THE FOLLOWING:"), "THE THERMOSTAT");
  assert.equal(leadSubject("FMCS SHALL:"), "FMCS");
  const seq = packet("p4", "EH-1 SEQUENCE OF OPERATION", [
    sp("WHEN THE ABOVE CONDITION EXISTS THE THERMOSTAT SHALL SEQUENCE THE FOLLOWING:", 100, 100),
    sp("1.", 100, 146), sp("SEND AN ENABLE COMMAND TO THE UNIT HEATER.", 130, 146),
    sp("a.", 130, 192), sp("VALIDATE THE STATUS THROUGH A CURRENT SENSING RELAY.", 160, 192),
    sp("1)", 160, 238), sp("IF THE HEATER FAILS TO RUN, AN ALARM SHALL BE SENT TO THE OPERATOR'S WORKSTATION.", 190, 238),
    sp("THE HEATER FAN SHALL HAVE A MINIMUM RUN TIME OF 5 MINUTES.", 100, 330),
    sp("2.", 100, 376), sp("SEND A DISABLE COMMAND TO THE UNIT HEATER.", 130, 376),
  ], "sequence");
  const t = packetText(seq);
  const leadOf = (s: string) => t.clauses.find((c) => c.text.includes(s))?.lead;
  assert.equal(leadOf("SEND AN ENABLE COMMAND"), "THE THERMOSTAT");
  assert.equal(leadOf("VALIDATE THE STATUS"), "THE THERMOSTAT", "a nested item too");
  assert.equal(leadOf("AN ALARM SHALL BE SENT"), undefined, "an item with a subject of its own");
  assert.equal(leadOf("SEND A DISABLE COMMAND"), undefined, "a paragraph that is no item ends the list");
});

test("R0: a control act's subject decides the role: the BAS by name commands, a local actor runs it, both leave it open", () => {
  const act = (...lines: string[]) => packet("p5", "EF-1 SEQUENCE", lines.map((l, i) => sp(l, 100, 100 + 60 * i)), "sequence");
  const role1 = (p: Packet) => readR0({ tag: "EF-1" }, [bound(p)], [role], TERM_LIST)[0];
  assert.deepEqual([role1(act("THE BMS SHALL ENERGIZE THE EXHAUST FAN IN THE OCCUPIED MODE.")).answer, role1(act("THE BMS SHALL ENERGIZE THE EXHAUST FAN IN THE OCCUPIED MODE.")).rule], ["commands", "r0.role.bas_actor"]);
  const led = role1(act("WHEN THE ABOVE CONDITION EXISTS THE THERMOSTAT SHALL SEQUENCE THE FOLLOWING:", "1. SEND AN ENABLE COMMAND TO THE FAN."));
  assert.deepEqual([led.answer, led.rule], ["local_control", "r0.role.local_control.actor.thermostat"]);
  assert.equal(role1(act("SPACE THERMOSTAT SHALL CONTROL THE EXHAUST FAN.", "THE BMS SHALL ENERGIZE THE EXHAUST FAN UPON AN END SWITCH INPUT.")).answer, "not_shown", "both act on it");
  assert.equal(role1(act("THE LAG FAN SHALL BE ENABLED BY THE BMS.")).answer, "not_shown", "a passive clause names no actor");
  assert.equal(role1(act("THE CONTROLLER SHALL START THE FAN.")).answer, "not_shown", "a bare controller is no one by name");
});

test("R0: outputs in the unit's own diagram mean the BAS commands it; inputs alone decide nothing", () => {
  const cmd = packet("p1", "EF-1 CONTROLS", [sp("BO - FAN START/STOP", 100, 100), sp("BI - FAN STATUS", 100, 300)]);
  assert.equal(readR0({ tag: "EF-1" }, [bound(cmd)], [role], TERM_LIST)[0].answer, "commands");
  const mon = packet("p2", "EH-1 CONTROLS", [sp("AI", 100, 100), sp("DI", 100, 300), sp("HEATER STATUS", 300, 300)]);
  assert.equal(readR0({ tag: "EH-1" }, [bound(mon)], [role], TERM_LIST)[0].answer, "not_shown");
  const table = packet("p3", "EF-2 POINTS", [sp("AI AO BI BO", 100, 100), sp("FAN STATUS", 100, 300)]);
  assert.equal(readR0({ tag: "EF-2" }, [bound(table)], [role], TERM_LIST)[0].answer, "not_shown", "a table header names every I/O type");
});

// ── the combiner ────────────────────────────────────────────────────────────

const ans = (reader: ReaderAnswer["reader"], question: string, answer: ReaderAnswer["answer"], extra: Partial<ReaderAnswer> = {}): ReaderAnswer => ({
  reader, question, answer, rule: `${reader}.test`, cites: answer === "absent" || answer === "not_shown" ? [] : [{ packet: "p1", sheet: "s#1", lines: ["L1"], text: "X", box: [0, 0, 1, 1] }], ...extra,
});
const titled: Binding[] = [{ packet: "p1", kind: "tag", evidence: "t" }];

test("combine: two readers agree → applied; one model alone → proposal; a disagreement or an unverified reading → unresolved", () => {
  const q = [opt("motorized_damper")];
  const d = (answers: ReaderAnswer[], bindings = titled) => combineUnit({ questions: q, answers, bindings }, TERM_LIST)[0];
  assert.equal(d([ans("r0", "opt.motorized_damper", "yes"), ans("r1", "opt.motorized_damper", "yes")]).outcome, "applied");
  assert.equal(d([ans("r1", "opt.motorized_damper", "yes")]).outcome, "proposal");
  assert.equal(d([ans("r0", "opt.motorized_damper", "yes")]).outcome, "proposal", "R0 off its whitelist is a proposal");
  assert.equal(d([ans("r0", "opt.motorized_damper", "yes"), ans("r1", "opt.motorized_damper", "no")]).outcome, "unresolved");
  // A reading that did not verify is dropped (CI2)…
  assert.equal(d([ans("r0", "opt.motorized_damper", "yes"), ans("r1", "opt.motorized_damper", "yes", { note: "unverified" })]).outcome, "proposal");
  // …unless it says the opposite: then the question stays open.
  assert.equal(d([ans("r0", "opt.motorized_damper", "yes"), ans("r2", "opt.motorized_damper", "yes", { run: "a" }), ans("r2", "opt.motorized_damper", "yes", { run: "b" }), ans("r1", "opt.motorized_damper", "no", { note: "unverified" })]).outcome, "unresolved");
  const r2split = [ans("r1", "opt.motorized_damper", "yes"), ans("r2", "opt.motorized_damper", "yes", { run: "a" }), ans("r2", "opt.motorized_damper", "no", { run: "b" })];
  assert.equal(d(r2split).outcome, "unresolved", "two vision runs that disagree");
  // Through a binding C5 makes a proposal, an agreement is a proposal.
  assert.equal(d([ans("r0", "opt.motorized_damper", "yes"), ans("r1", "opt.motorized_damper", "yes")], [{ packet: "p1", kind: "family_detail", evidence: "f", proposal: true }]).outcome, "proposal");
});

test("combine: a reading in only one of several packets bound equally is a proposal; one every such packet gives applies", () => {
  // Robustness find (an unseen set): two same-titled VAV sequences, one per
  // box type, both bound to every box; one's CO2 clause applied to all.
  const q = [opt("co2_sensor")];
  const equally: Binding[] = [
    { packet: "p1", kind: "family_detail", evidence: "f", ambiguous: true },
    { packet: "p2", kind: "family_detail", evidence: "f", ambiguous: true },
  ];
  const cite = (packet: string) => ({ packet, sheet: "s#1", lines: ["L1"], text: "X", box: [0, 0, 1, 1] as [number, number, number, number] });
  const d = (packets: string[]) => combineUnit({ questions: q, bindings: equally, answers: [
    ans("r0", "opt.co2_sensor", "yes", { cites: packets.map(cite) }), ans("r1", "opt.co2_sensor", "yes", { cites: packets.map(cite) }),
  ] }, TERM_LIST)[0];
  assert.equal(d(["p2"]).outcome, "proposal");
  assert.match(d(["p2"]).why, /one of the packets bound to the unit equally/);
  assert.equal(d(["p1", "p2"]).outcome, "applied", "both box types' sequences say so");
  // A title binding besides them is no doubt.
  assert.equal(combineUnit({ questions: q, bindings: [...equally, { packet: "p3", kind: "tag", evidence: "t" }], answers: [
    ans("r0", "opt.co2_sensor", "yes", { cites: [cite("p3")] }), ans("r1", "opt.co2_sensor", "yes", { cites: [cite("p3")] }),
  ] }, TERM_LIST)[0].outcome, "applied");
});

test("combine: absence applies only when R0 finds no term and both vision runs find none (C9)", () => {
  const q = [opt("duct_smoke_detectors")];
  const d = (answers: ReaderAnswer[], bindings = titled) => combineUnit({ questions: q, answers, bindings }, TERM_LIST)[0];
  const r0 = ans("r0", "opt.duct_smoke_detectors", "absent");
  const a = ans("r2", "opt.duct_smoke_detectors", "absent", { run: "a" });
  const b = ans("r2", "opt.duct_smoke_detectors", "absent", { run: "b" });
  assert.deepEqual([d([r0, a, b]).outcome, d([r0, a, b]).value], ["applied", false]);
  assert.equal(d([r0, a]).outcome, "proposal", "one vision run is not two");
  assert.equal(d([a, b]).outcome, "proposal", "R0 must find no term");
  assert.equal(d([r0, a, b, ans("r1", "opt.duct_smoke_detectors", "yes")]).outcome, "unresolved");
  assert.equal(d([r0, a, b], [...titled, { packet: "p2", kind: "tag", evidence: "t", ambiguous: true }]).outcome, "proposal");
});

test("combine: a false read explicitly is not an absence; another reader finding no mention agrees with it (C8)", () => {
  const q = [opt("duct_smoke_detectors")];
  const d = (answers: ReaderAnswer[], bindings = titled) => combineUnit({ questions: q, answers, bindings }, TERM_LIST)[0];
  const no = (run: string) => ans("r2", "opt.duct_smoke_detectors", "no", { run });
  const absent = (reader: ReaderAnswer["reader"], run?: string) => ans(reader, "opt.duct_smoke_detectors", "absent", run ? { run } : {});
  const both = d([no("a"), no("b"), absent("r1")]);
  assert.deepEqual([both.outcome, both.value, both.rule], ["applied", false, "drawing_read:agree(r1,r2)"]);
  assert.match(both.why, /r2 read it false, and r1 finds no mention of it/);
  assert.equal(d([no("a"), no("b")]).outcome, "proposal", "one reader alone");
  // The two runs agree on the value: one printed the alternative, the other
  // found no device. Together they are R2's explicit false, never an absence.
  const mixed = d([no("a"), absent("r2", "b"), absent("r0")]);
  assert.deepEqual([mixed.outcome, mixed.value], ["applied", false]);
  assert.equal(d([no("a"), absent("r2", "b")]).outcome, "proposal");
  // An absence alone still needs all of C9.
  assert.equal(d([absent("r1"), absent("r2", "a"), absent("r2", "b")]).outcome, "proposal");
  // A refuted reading holds nothing open; an unverified one that says
  // otherwise does.
  assert.equal(d([no("a"), no("b"), absent("r1"), ans("r1", "opt.duct_smoke_detectors", "yes", { note: "refuted" })]).outcome, "applied");
  // A "yes" from any reader is a disagreement.
  assert.equal(d([no("a"), no("b"), ans("r1", "opt.duct_smoke_detectors", "yes")]).outcome, "unresolved");
});

test("combine: a whitelisted R0 phrase applies alone; one choice read twice leaves both unresolved; the intent carries the facts", () => {
  const w = combineUnit({ questions: [role], answers: [ans("r0", "role", "not_connected", { whitelisted: true })], bindings: titled }, TERM_LIST);
  assert.equal(w[0].outcome, "applied");
  const it = decisionIntent(w)!;
  assert.equal(it.out_of_scope?.value, true);
  assert.match(it.out_of_scope!.rule, /^drawing_read:role\.not_connected$/);
  const both = combineUnit({ questions: [opt("return_fan"), opt("relief_fan")], answers: [
    ans("r0", "opt.return_fan", "yes"), ans("r1", "opt.return_fan", "yes"), ans("r0", "opt.relief_fan", "yes"), ans("r1", "opt.relief_fan", "yes"),
  ], bindings: titled }, TERM_LIST);
  assert.deepEqual(both.map((x) => x.outcome), ["unresolved", "unresolved"]);
  // One of the group applied while a verified reader reads the other there
  // too: the drawings name both.
  const named = combineUnit({ questions: [opt("return_fan"), opt("relief_fan")], answers: [
    ans("r0", "opt.relief_fan", "yes"), ans("r1", "opt.relief_fan", "yes"), ans("r0", "opt.return_fan", "yes"),
  ], bindings: titled }, TERM_LIST);
  assert.deepEqual(named.map((x) => [x.question, x.outcome]), [["opt.return_fan", "unresolved"], ["opt.relief_fan", "unresolved"]]);
  const one = combineUnit({ questions: [opt("motorized_damper")], answers: [ans("r0", "opt.motorized_damper", "yes"), ans("r1", "opt.motorized_damper", "yes")], bindings: titled }, TERM_LIST);
  assert.deepEqual(decisionIntent(one)?.options?.motorized_damper?.value, true);
});

// ── the run store ───────────────────────────────────────────────────────────

const req = (text: string, model = "m"): ModelRequest => ({
  model, messages: [{ role: "user", content: text }], temperature: 0, max_completion_tokens: 10,
  response_format: { type: "json_schema", json_schema: { name: "x", strict: true, schema: {} } },
});

test("runs: a request replays by its hash; a changed model or prompt is a new run; an image is keyed by what was rendered", async () => {
  assert.equal(await requestHash(req("a")), await requestHash(req("a")));
  assert.notEqual(await requestHash(req("a")), await requestHash(req("a", "m2")));
  assert.notEqual(await requestHash(req("a")), await requestHash(req("b")));
  const img = (url: string): ModelRequest => ({ ...req("x"), messages: [{ role: "user", content: [{ type: "text", text: "q" }, { type: "image_url", image_url: { url } }] }] });
  assert.equal(await requestHash(img("data:1"), ["crop-A"]), await requestHash(img("data:2"), ["crop-A"]), "pixels aside, the same crop");
  assert.notEqual(await requestHash(img("data:1"), ["crop-A"]), await requestHash(img("data:1"), ["crop-B"]));
  const store = memoryRunStore();
  let calls = 0;
  const transport: Transport = async () => { calls++; return { content: "{\"ok\":1}", usage: { total_tokens: 3 } }; };
  const live = await recordedCall(store, transport, "r1", "v", req("a"), {});
  assert.equal(live.status, "live");
  const again = await recordedCall(store, transport, "r1", "v", req("a"), {});
  assert.deepEqual([again.status, again.content, calls], ["replayed", "{\"ok\":1}", 1]);
  assert.equal((await recordedCall(store, null, "r1", "v", req("b"), {})).status, "not_recorded");
  const failing: Transport = async () => { throw new Error("down"); };
  const failed = await recordedCall(store, failing, "r1", "v", req("c"), {});
  assert.equal(failed.status, "failed");
  assert.equal(store.get(failed.run!.hash), undefined, "a failure is not recorded");
});

// ── R1 and R2 checks ────────────────────────────────────────────────────────

test("R1: a quote must be printed where it says, name the device, and a role needs its subject clause", () => {
  const p = packet("p1", "EF-1 SEQUENCE", [sp("WHEN THE FAN IS ENERGIZED THE TW O - PO SITION DAM PER SHALL FULLY OPEN.", 100, 100), sp("THE DDC CONTROLLER SHALL START THE EXHAUST FAN.", 100, 300)], "sequence");
  const prep = r1Request({ tags: ["EF-1"], family: "FAN", schedule: "FAN SCHEDULE" }, [bound(p)], [role, opt("motorized_damper")]);
  const ids = [...prep.index.keys()];
  const reply = (answers: unknown[]) => JSON.stringify({ answers });
  const damper = { question: "opt.motorized_damper", answer: "yes", quotes: [{ paragraph: ids[0], text: "TWO-POSITION DAMPER SHALL FULLY OPEN" }], subject_quote: null };
  const roleOk = { question: "role", answer: "commands", quotes: [{ paragraph: ids[1], text: "SHALL START THE EXHAUST FAN" }], subject_quote: { paragraph: ids[1], text: "THE DDC CONTROLLER SHALL START THE EXHAUST FAN" } };
  const good = r1Answers(reply([damper, roleOk]), prep, [role, opt("motorized_damper")], TERM_LIST);
  assert.deepEqual(good.map((a) => [a.question, a.answer, a.note ?? "ok"]), [["opt.motorized_damper", "yes", "ok"], ["role", "commands", "ok"]]);
  const invented = r1Answers(reply([{ ...damper, quotes: [{ paragraph: ids[0], text: "MOTORIZED DAMPER WITH ACTUATOR" }] }]), prep, [opt("motorized_damper")], TERM_LIST);
  assert.equal(invented[0].note, "unverified");
  const offDevice = r1Answers(reply([{ ...damper, quotes: [{ paragraph: ids[1], text: "THE DDC CONTROLLER SHALL START" }] }]), prep, [opt("motorized_damper")], TERM_LIST);
  assert.equal(offDevice[0].note, "unverified", "a yes must quote the device");
  const noSubject = r1Answers(reply([{ ...roleOk, subject_quote: null }]), prep, [role], TERM_LIST);
  assert.equal(noSubject[0].note, "unverified");
  assert.equal(r1Answers("not json", prep, [role], TERM_LIST).length, 0);
  // A subject quote whose actor is the other side refutes the answer; one
  // that is not printed leaves it unverified.
  const thermostat = packet("p6", "EH-1 SEQUENCE", [
    sp("WHEN THE ABOVE CONDITION EXISTS THE THERMOSTAT SHALL SEQUENCE THE FOLLOWING:", 100, 100),
    sp("1.", 100, 146), sp("SEND AN ENABLE COMMAND TO THE UNIT HEATER.", 130, 146),
  ], "sequence");
  const tp = r1Request({ tags: ["EH-1"], family: "UNIT_HEATER", schedule: "S" }, [bound(thermostat)], [role]);
  const item = [...tp.index.entries()].find(([, v]) => v.paragraph.text.includes("SEND AN ENABLE"))![0];
  const refuted = r1Answers(reply([{ question: "role", answer: "commands", quotes: [{ paragraph: item, text: "SEND AN ENABLE COMMAND TO THE UNIT HEATER" }], subject_quote: { paragraph: item, text: "SEND AN ENABLE COMMAND TO THE UNIT HEATER" } }]), tp, [role], TERM_LIST);
  assert.deepEqual([refuted[0].note, refuted[0].answer], ["refuted", "commands"]);
  assert.match(refuted[0].why ?? "", /THE THERMOSTAT/);
  const monitors = r1Answers(reply([{ ...roleOk, answer: "monitors_only" }]), prep, [role], TERM_LIST);
  assert.equal(monitors[0].note, "refuted", "the DDC controller is the one acting");
  // "Absent" is "not mentioned anywhere": the paragraphs mention a damper.
  const absent = r1Answers(reply([{ question: "opt.motorized_damper", answer: "absent", quotes: [], subject_quote: null }]), prep, [opt("motorized_damper")], TERM_LIST);
  assert.deepEqual([absent[0].answer, absent[0].note], ["not_shown", undefined]);
  assert.match(absent[0].why ?? "", /mention it/);
});

test("R1: text an earlier packet on the same sheet carries is sent once; each packet says why it applies", () => {
  const heading = { ...packet("h", "AHU-1 SEQUENCE OF OPERATIONS", [sp("THE BMS SHALL START THE SUPPLY FAN.", 100, 100)], "sequence"), region: [0, 0, 2000, 2000] as [number, number, number, number] };
  const sheet = { ...packet("s", "AIR HANDLING UNIT SEQUENCE OF OPERATIONS", [sp("THE BMS SHALL START THE SUPPLY FAN.", 100, 100), sp("THE ECONOMIZER SHALL BE ENABLED.", 3000, 100)], "sequence"), scope: "sheet" as const };
  const prep = r1Request({ tags: ["AHU-1"], family: "AHU", schedule: "AHU SCHEDULE" }, [bound(heading, "tag"), bound(sheet, "sibling")], [role]);
  const payload = JSON.parse(prep.req.messages[1].content as string);
  assert.deepEqual(payload.packets.map((k: { paragraphs: Array<{ text: string }> }) => k.paragraphs.map((p) => p.text)), [["THE BMS SHALL START THE SUPPLY FAN."], ["THE ECONOMIZER SHALL BE ENABLED."]]);
  assert.deepEqual(payload.packets.map((k: { applies_because: string }) => k.applies_because), ["its title names this unit", "it is about the same subject as a drawing titled for this unit, on the same sheet"]);
  const typical = r1Request({ tags: ["EH-1"], family: "UNIT_HEATER", schedule: "S" }, [bound({ ...heading, id: "t", title: "ELECTRIC UNIT HEATER SCHEMATIC", subtitle: "(EH-5)" }, "family_detail")], [role]);
  assert.match(JSON.parse(typical.req.messages[1].content as string).packets[0].applies_because, /names another unit of this kind as the example/);
});

test("R2: labels must be printed in the drawing; a low-resolution crop never reads absence; runs join over a unit's drawings", () => {
  const p = packet("p1", "EF-1 CONTROLS", [sp("BO - EXHAUST AIR DAMPER", 100, 100), sp("BI - FAN STATUS", 100, 300)]);
  const bp = bound(p);
  const q = [opt("motorized_damper"), opt("fan_status")];
  const reply = JSON.stringify({ answers: [
    { question: "opt.motorized_damper", answer: "yes", labels: ["BO - EXHAUST AIR DAMPER"] },
    { question: "opt.fan_status", answer: "yes", labels: ["DAMPER ACTUATOR DA-1"] },
  ] });
  const got = r2PacketAnswers(reply, bp, q, "a");
  assert.deepEqual(got.map((a) => a.note ?? "ok"), ["ok", "unverified"]);
  const absent = JSON.stringify({ answers: [{ question: "opt.motorized_damper", answer: "absent", labels: [] }] });
  assert.equal(r2PacketAnswers(absent, bp, q, "a", true)[0].answer, "not_shown");
  assert.equal(r2PacketAnswers(absent, bp, q, "a")[0].answer, "absent", "the term list is not asked");
  const said = r2PacketAnswers(absent, bp, q, "a", false, TERM_LIST)[0];
  assert.deepEqual([said.answer, said.why], ["not_shown", 'read as absent, but the drawing prints "BO - EXHAUST AIR DAMPER"']);
  const yes = [{ reader: "r2", run: "a", question: "opt.motorized_damper", answer: "yes", rule: "t", cites: [] }] as ReaderAnswer[];
  const abs = [{ reader: "r2", run: "a", question: "opt.motorized_damper", answer: "absent", rule: "t", cites: [] }] as ReaderAnswer[];
  assert.equal(joinRun([yes, abs], [opt("motorized_damper")], "a")[0].answer, "yes");
  assert.equal(joinRun([abs, abs], [opt("motorized_damper")], "a")[0].answer, "absent");
  assert.equal(SPAN_PX_PER_PT, RENDER_SCALE, "span space is the render scale's");
  const spec = cropSpec(bp, 200);
  assert.equal(spec.dpi <= 200, true);
  assert.ok(spec.long_edge <= 3200);
});

// ── the record, end to end ──────────────────────────────────────────────────

const row = (family: string, tag: string, table_title: string, cells: Record<string, string>): CompiledItem => ({
  family, tag, sheet_id: "set.pdf#3", table_title,
  cells: Object.fromEntries(Object.entries({ MARK: tag, ...cells }).map(([h, text], i) => [h, { text, bbox: [i, 0, i + 1, 1] }])),
});

/** A model that answers from the packet text it is given: quotes the
 * paragraph that prints the damper, and says the DDC starts the fan. */
const cannedModel: Transport = async (r) => {
  const user = r.messages.find((m) => m.role === "user")!;
  if (typeof user.content === "string") {
    const payload = JSON.parse(user.content) as { packets: Array<{ paragraphs: Array<{ id: string; text: string }> }> };
    const ps = payload.packets.flatMap((p) => p.paragraphs);
    const damper = ps.find((p) => /DAMPER/.test(p.text))!;
    const start = ps.find((p) => /START/.test(p.text))!;
    return { content: JSON.stringify({ answers: [
      { question: "role", answer: "commands", quotes: [{ paragraph: start.id, text: start.text }], subject_quote: { paragraph: start.id, text: start.text } },
      { question: "opt.motorized_damper", answer: "yes", quotes: [{ paragraph: damper.id, text: damper.text }], subject_quote: null },
    ] }) };
  }
  return { content: JSON.stringify({ answers: [
    { question: "role", answer: "commands", labels: ["BO - FAN START/STOP"] },
    { question: "opt.motorized_damper", answer: "yes", labels: ["MOTORIZED DAMPER"] },
  ] }) };
};

test("record: R0, R1 and R2 read a unit, agree and apply; replay reads the same without a model; no readings leaves apply as it was", async () => {
  const items = [row("FAN", "EF-1", "EXHAUST FAN SCHEDULE", { "SPEED CONTROL": "CONSTANT" })];
  const spans = [
    sp("MOTORIZED DAMPER", 700, 300), sp("BO - FAN START/STOP", 700, 400), sp("BI - FAN STATUS", 700, 500),
    sp("1", 651, 1020, 50), sp("EXHAUST FAN EF-1 CONTROL DIAGRAM", 734, 1000, 50), sp("SCALE: NONE", 734, 1060, 25),
    ...Array.from({ length: 12 }, (_, i) => sp("THE CONTROLLER SHALL MODULATE THE VALVE TO MAINTAIN SETPOINT", 3000, 300 + i * 23)),
  ];
  const project: CompiledProject = { items, control: { version: "control_evidence_v1", packets: findPackets("set.pdf#5", spans), sheet_numbers: {} } };
  const before = applyAssemblies({ project, library: LIB });
  assert.equal(before.applications[0].assembly?.id, "fan-constant");
  assert.equal(before.applications[0].options.motorized_damper.source, "starter_default");
  const store = memoryRunStore();
  const readings = await readControlIntent({ project, library: LIB }, { store, transport: cannedModel, render: async () => "data:image/png;base64,AAAA" });
  const u = readings.units.find((x) => x.tag === "EF-1")!;
  const damper = u.decisions.find((d) => d.question === "opt.motorized_damper")!;
  assert.equal(damper.outcome, "applied", JSON.stringify(u.answers.map((a) => [a.reader, a.run, a.question, a.answer, a.note])));
  assert.match(damper.rule, /agree\(r0,r1,r2\)/);
  const after = applyAssemblies({ project, library: LIB, readings });
  assert.deepEqual([after.applications[0].options.motorized_damper.value, after.applications[0].options.motorized_damper.source], [true, "drawing"]);
  // Replay: no transport, the same readings.
  const replay = await readControlIntent({ project, library: LIB }, { store: memoryRunStore(store.all()) });
  assert.deepEqual(replay.units, readings.units);
  assert.equal(replay.calls.r1.replayed + replay.calls.r2.replayed, readings.calls.r1.live + readings.calls.r2.live);
  // No readings, or readings that decide nothing: apply is unchanged.
  assert.deepEqual(applyAssemblies({ project, library: LIB, readings: null }), before);
  assert.deepEqual(applyAssemblies({ project, library: LIB, readings: { units: [] } }), before);
});
