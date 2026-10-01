// CONTROL INTENT Track A: the project questions (questions.ts) and the answer
// journal (journal.ts) — synthetic projects only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NoteSpan } from "../../src/lib/assemblies/scheduleNotes.ts";
import { applyAssemblies, type CompiledItem, type CompiledProject } from "../../src/lib/assemblies/apply.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { compileProjectTerms, linesChanged, projectQuestions, PROJECT_TERMS_V1, QUESTION_CAP, recordsChanged } from "../../src/lib/controlIntent/questions.ts";
import { answerSettings, appendAnswer, replayAnswers } from "../../src/lib/controlIntent/journal.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const LIB = sanitizeAssemblyDefinitions(JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies).assemblies;
const sp = (str: string, x: number, y: number, h = 19): NoteSpan => ({ str, x0: x, y0: y, x1: x + str.length * 0.55 * h, y1: y + h });
const row = (family: string, tag: string, table_title: string, cells: Record<string, string>): CompiledItem => ({
  family, tag, sheet_id: "set.pdf#3", table_title,
  cells: Object.fromEntries(Object.entries({ MARK: tag, ...cells }).map(([h, text], i) => [h, { text, bbox: [i, 0, i + 1, 1] }])),
});

/** A fan and a condensate pump whose schedules print no speed column, and an
 * exhaust fan flagged existing; `notes` are printed on the schedule page. */
function project(notes: string[]): CompiledProject {
  const items = [
    row("FAN", "EF-1", "FAN SCHEDULE", { CFM: "800", SERVICE: "TOILET EXHAUST" }),
    row("FAN", "EF-2", "FAN SCHEDULE", { CFM: "600", SERVICE: "STORAGE", REMARKS: "EXISTING TO REMAIN" }),
    row("PUMP", "CP-1", "PUMP SCHEDULE", { GPM: "5", SERVICE: "CONDENSATE" }),
  ];
  return { items, pages: { "set.pdf#3": notes.map((t, i) => sp(t, 100, 3000 + 40 * i)) } } as CompiledProject;
}

test("questions: each is applied under every choice; one no choice changes a line with is never shown; the rest rank by lines changed", () => {
  const p = project([]);
  const r = projectQuestions({ project: p, library: LIB });
  assert.ok(r.shown.length <= QUESTION_CAP);
  const ids = r.shown.map((q) => q.id);
  assert.ok(ids.includes("PQ1"), "no BAS changes every unit");
  assert.ok(ids.includes("PQ3"), "an existing unit is printed");
  assert.ok(!ids.includes("PQ2"), "no unit here has a DoD option, so owner criteria change nothing");
  assert.ok(r.zero_effect.includes("PQ2"));
  for (let i = 1; i < r.shown.length; i++) assert.ok(r.shown[i - 1].lines_changed >= r.shown[i].lines_changed, "ranked by lines changed");
  for (const q of r.shown) {
    const unknown = q.choices.find((c) => c.value === "unknown")!;
    assert.equal(unknown.lines_changed + unknown.records_changed, 0, "don't know changes nothing");
    assert.equal(q.lines_changed, Math.max(...q.choices.map((c) => c.lines_changed)));
  }
  // The count is exact: re-applying under the choice differs by that many
  // lines and records. An unresolved unit taken out of scope changes its
  // record even where it had no lines.
  const pq1 = r.shown.find((q) => q.id === "PQ1")!;
  const base = applyAssemblies({ project: p, library: LIB });
  const no = applyAssemblies({ project: p, library: LIB, settings: { answers: { PQ1: "no" } } });
  const choice = pq1.choices.find((c) => c.value === "no")!;
  assert.equal(choice.lines_changed, linesChanged(base.lines, no.lines));
  assert.equal(choice.records_changed, recordsChanged(base.applications, no.applications));
  assert.ok(choice.records_changed >= 3, "every unit's controls record leaves the scope");
  // An answer that makes the others moot hides them: with no BAS, nothing else changes a line.
  const moot = projectQuestions({ project: p, library: LIB, settings: { answers: { PQ1: "no" } } });
  assert.deepEqual(moot.shown.map((q) => [q.id, q.answer]), [["PQ1", "no"]]);
  assert.equal(projectQuestions({ project: p, library: LIB }, { cap: 1 }).over_cap.length, r.shown.length - 1);
});

test("questions: a pre-fill quotes printed text outside the schedules, is a proposal only, and a schedule's own row is never a project fact", () => {
  const p = project(["THE BMS SHALL START THE EXHAUST FANS IN THE OCCUPIED MODE.", "EXISTING CONTROLLERS TO REMAIN."]);
  const r = projectQuestions({ project: p, library: LIB });
  const pq1 = r.shown.find((q) => q.id === "PQ1")!;
  assert.equal(pq1.prefill?.value, "yes");
  assert.match(pq1.prefill!.evidence[0].text, /THE BMS SHALL START/);
  assert.equal(pq1.prefill!.evidence[0].finder, "bas_commands");
  assert.equal(pq1.answer, null, "a pre-fill answers nothing");
  assert.equal(r.shown.find((q) => q.id === "PQ3")?.prefill?.value, "keep");
  // Inside a schedule table's region, the same words are one unit's remark.
  const inTable = { ...p, tables: [{ sheet: "set.pdf#3", title: "FAN SCHEDULE", headers: ["MARK"], region: [0, 2900, 5000, 3200] as [number, number, number, number] }] };
  assert.equal(projectQuestions({ project: inTable, library: LIB }).shown.find((q) => q.id === "PQ1")?.prefill, null);
  // A pump's own row that puts it on the BAS pre-fills "as drawn".
  const base = project([]);
  const onBms = { ...base, items: [...base.items.slice(0, 2), row("PUMP", "CP-1", "PUMP SCHEDULE", { GPM: "5", SERVICE: "CONDENSATE", REMARKS: "PROVIDE WITH BMS CONTROLS" })] };
  assert.equal(projectQuestions({ project: onBms, library: LIB }).shown.find((q) => q.id === "PQ5")?.prefill?.value, "as_drawn");
});

test("questions: the project term list is gated like the option list", () => {
  assert.equal(PROJECT_TERMS_V1.version, "control_project_terms_v1");
  const raw = JSON.parse(readFileSync(new URL("../../src/lib/controlIntent/termlist/project-v1.json", import.meta.url), "utf8"));
  assert.throws(() => compileProjectTerms({ ...raw, PQ1: { yes: [{ id: "x", re: "BMS", sources: ["nowhere"] }] } }), /unknown source/);
  assert.throws(() => compileProjectTerms({ ...raw, PQ1: { maybe: [{ id: "x", re: "BMS", sources: ["goal-wp31"] }] } }), /no choice "maybe"/);
  assert.throws(() => compileProjectTerms({ ...raw, PQ1: { yes: [{ id: "x", re: "(?:)", sources: ["goal-wp31"] }] } }), /matches nothing at all/);
});

const request = (over: Record<string, unknown> = {}) => ({
  operation_id: crypto.randomUUID(), expected_head: null, reviewer: "estimator", reason: "confirmed the pre-fill",
  question: "PQ1", answer: "yes", prefill: { value: "yes", evidence: [{ sheet: "m.pdf#6", text: "THE BMS SHALL START", box: [0, 0, 1, 1], finder: "bas_commands" }] },
  ...over,
});

test("journal: answers are an append-only chain; a stale head or a replayed operation is refused; don't know takes an answer back", async () => {
  const a = await appendAnswer([], request(), { origin: "operator_input", now: new Date("2026-09-25T00:00:00Z") });
  assert.deepEqual(a.answers, { PQ1: "yes" });
  assert.equal(a.event.approved, false);
  assert.equal(a.event.origin, "operator_input");
  const b = await appendAnswer(a.events, request({ expected_head: a.event.event_id, question: "PQ2", answer: "dod", prefill: null }), { origin: "agent_proposal" });
  assert.deepEqual(b.answers, { PQ1: "yes", PQ2: "dod" });
  await assert.rejects(appendAnswer(b.events, request({ expected_head: a.event.event_id, question: "PQ4", answer: "constant", prefill: null }), { origin: "operator_input" }), /journal's head/);
  await assert.rejects(appendAnswer(b.events, { ...request({ expected_head: b.event.event_id }), operation_id: a.event.operation_id }, { origin: "operator_input" }), /already recorded/);
  await assert.rejects(appendAnswer(b.events, request({ expected_head: b.event.event_id, answer: "maybe" }), { origin: "operator_input" }), /no choice/);
  const c = await appendAnswer(b.events, request({ expected_head: b.event.event_id, answer: "unknown", prefill: null }), { origin: "operator_input" });
  assert.deepEqual(c.answers, { PQ2: "dod" });
  // Replay reads the same answers, and every event's id and result are checked.
  const replay = await replayAnswers(JSON.parse(JSON.stringify(c.events)));
  assert.deepEqual([replay.answers, replay.head], [c.answers, c.event.event_id]);
  const tampered = JSON.parse(JSON.stringify(c.events));
  tampered[1].answer = "va";
  await assert.rejects(replayAnswers(tampered), /does not match/);
  await assert.rejects(replayAnswers([c.events[1]]), /another history/);
});

test("journal: a replayed journal's answers apply, and each record they decide says who recorded the answer (the estimator, or an agent for them)", async () => {
  const p = project([]);
  const a = await appendAnswer([], request({ answer: "no", prefill: null }), { origin: "agent_proposal" });
  const s = answerSettings((await replayAnswers(a.events)).events);
  assert.deepEqual(s.answers, { PQ1: "no" });
  assert.deepEqual(s.answer_events, { PQ1: { event_id: a.event.event_id, origin: "agent_proposal" } });
  const byAgent = applyAssemblies({ project: p, library: LIB, settings: s });
  const plain = applyAssemblies({ project: p, library: LIB, settings: { answers: s.answers } });
  const basis = (r: { applications: Array<{ intent?: unknown }> }) => JSON.stringify(r.applications.map((x) => x.intent ?? null));
  assert.match(basis(byAgent), /recorded by an agent for the estimator \(agent_proposal, not a human act\), event [0-9a-f]{12}/);
  assert.doesNotMatch(basis(plain), /recorded by/, "answers passed without their journal name no one");
  assert.equal(JSON.stringify(byAgent.lines.map((l) => [l.tag, l.status, l.qty_base])), JSON.stringify(plain.lines.map((l) => [l.tag, l.status, l.qty_base])), "who recorded it changes no line");
  // The estimator's own answer, after the agent's: the latest event stands.
  const b = await appendAnswer(a.events, request({ expected_head: a.event.event_id, answer: "no", prefill: null }), { origin: "operator_input" });
  const t = answerSettings((await replayAnswers(b.events)).events);
  assert.equal(t.answer_events.PQ1.origin, "operator_input");
  assert.match(basis(applyAssemblies({ project: p, library: LIB, settings: t })), /recorded by the estimator, event/);
  // "Don't know" leaves no answer and names no event.
  const c = await appendAnswer(b.events, request({ expected_head: b.event.event_id, answer: "unknown", prefill: null }), { origin: "operator_input" });
  assert.deepEqual(answerSettings(c.events), { answers: {}, answer_events: {} });
});
