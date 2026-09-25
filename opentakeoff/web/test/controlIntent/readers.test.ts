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
import { closeLetterSpacing, normText, packetText, printedIn } from "../../src/lib/controlIntent/readers/text.ts";
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
