// CONTROL INTENT Track A over MCP: project_questions and
// answer_project_question on a dev document (federal-mech, fixture D04), and
// their PARITY with the Takeoff panel: the same journal gives the same
// records and lines whichever surface applies it.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../server.ts";
import { Session } from "../src/session.ts";
import { loadAssemblyLibrary, sessionAssembliesProject, sessionControlReadings } from "../src/assemblies.ts";
import { applyAssemblies } from "../../web/src/lib/assemblies/apply.ts";
import { answerSettings, replayAnswers } from "../../web/src/lib/controlIntent/journal.ts";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";

// No model is ever called from the tests.
process.env.OPENTAKEOFF_CONTROL_READINGS = "deterministic";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const D04 = resolve(CORPUS, "demos/D04-vav-scope-rollup");

async function call(client, name, args) {
  const res = await client.callTool({ name, arguments: args });
  return { isError: !!res.isError, text: res.content[0].text, structured: res.structuredContent };
}

test("project questions over MCP: shown only when they change something; an answer is an agent_proposal the records disclose; the journal rides the project file; the panel applies the same journal to the same bytes (federal-mech, D04)", { timeout: 20 * 60 * 1000 }, async () => {
  const { session, source } = await loadFixtureSession(CORPUS, D04);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const server = buildServer(session);
  await server.connect(st);
  const client = new Client({ name: "questions", version: "0.0.0" });
  await client.connect(ct);

  const q = await call(client, "project_questions", {});
  assert.equal(q.isError, false, q.text);
  const qs = q.structured.questions;
  assert.ok(qs.length >= 1 && qs.length <= 6, `between one and six questions: ${qs.map((x) => x.id)}`);
  for (const x of qs) assert.ok(x.lines_changed + x.records_changed > 0, `${x.id} changes something`);
  assert.equal(q.structured.journal.head, null);
  assert.deepEqual(q.structured.journal.answers, {});
  assert.match(q.structured.next_move, /Ask the estimator/);
  const pq1 = qs.find((x) => x.id === "PQ1");
  assert.ok(pq1, "the BAS scope question changes every unit");

  // A pre-fill is never an answer: nothing is recorded until the tool is called.
  const before = await call(client, "apply_assemblies", { detail: "units" });
  assert.equal(before.structured.answers, undefined, "no journal, no answers block");

  // The estimator says the project has no BAS scope; the agent records it.
  const a = await call(client, "answer_project_question", { question: "PQ1", answer: "no", expected_head: null, reviewer: "estimator (test)", reason: "\"No DDC on this job, factory controls only.\"" });
  assert.equal(a.isError, false, a.text);
  assert.equal(a.structured.event.origin, "agent_proposal");
  assert.equal(a.structured.event.approved, false);
  assert.equal(a.structured.event.reviewer_identity, "self_declared");
  assert.equal(a.structured.journal.head, a.structured.event.event_id);
  assert.deepEqual(a.structured.journal.answers, { PQ1: "no" });
  assert.deepEqual(a.structured.journal.recorded_by, { PQ1: "agent_proposal" });
  // A stale head, an unknown choice and a repeated operation are refused.
  const stale = await call(client, "answer_project_question", { question: "PQ4", answer: "constant", expected_head: null, reviewer: "estimator (test)", reason: "x" });
  assert.equal(stale.isError, true);
  assert.match(stale.text, /read the questions again/);
  const bad = await call(client, "answer_project_question", { question: "PQ4", answer: "maybe", expected_head: a.structured.event.event_id, reviewer: "estimator (test)", reason: "x" });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /PQ4 has no choice/);
  const again = await call(client, "answer_project_question", { question: "PQ1", answer: "no", expected_head: a.structured.event.event_id, reviewer: "estimator (test)", reason: "x", operation_id: a.structured.event.operation_id });
  assert.equal(again.isError, true);
  assert.match(again.text, /already recorded/);

  // Applied: every unit with a typical leaves the BAS scope, and says who recorded the answer.
  const after = await call(client, "apply_assemblies", { detail: "lines" });
  assert.equal(after.isError, false, after.text);
  assert.deepEqual(after.structured.answers.applied, { PQ1: "no" });
  const scoped = after.structured.applications.filter((r) => r.status === "not_in_scope");
  assert.ok(scoped.length > 0, "units leave the scope");
  for (const r of scoped) {
    const use = r.intent.find((i) => i.target === "scope");
    assert.equal(use.rule, "project_answer:PQ1=no");
    assert.match(use.basis, /recorded by an agent for the estimator \(agent_proposal, not a human act\)/);
  }
  assert.ok(!after.structured.applications.some((r) => r.status === "ok" && r.layer === "controls"), "no controls typical stays in scope");
  // The questions now show the answer, and the others are moot.
  const moot = await call(client, "project_questions", {});
  assert.deepEqual(moot.structured.questions.map((x) => [x.id, x.answer]), [["PQ1", "no"]]);

  // PARITY: the panel replays the same journal and applies the wire project
  // with the same library: byte-identical records and lines.
  const project = JSON.parse(JSON.stringify(await sessionAssembliesProject(session)));
  const { library } = await loadAssemblyLibrary();
  const replayed = await replayAnswers(JSON.parse(JSON.stringify(session.answerJournal)));
  const settings = answerSettings(replayed.events);
  // The panel's readings come from the CLI: read before any setting or answer.
  const readings = await sessionControlReadings(session, { project, library }, "deterministic");
  const browser = applyAssemblies({ project, library, settings, overrides: [], readings: JSON.parse(JSON.stringify(readings)) });
  assert.equal(JSON.stringify(browser.applications), JSON.stringify(after.structured.applications), "records");
  assert.equal(JSON.stringify(browser.lines), JSON.stringify(after.structured.lines), "lines");

  // The journal rides export_takeoff and comes back through import_takeoff.
  const dir = await mkdtemp(join(tmpdir(), "ot-pq-"));
  const out = join(dir, "takeoff.json");
  const exported = await call(client, "export_takeoff", { path: out });
  assert.equal(exported.isError, false, exported.text);
  const file = JSON.parse(await readFile(out, "utf8"));
  assert.equal(file.assemblies.schema, "opentakeoff.assemblies_state.v1");
  assert.equal(file.assemblies.answer_journal.length, 1);
  const fresh = new Session();
  await fresh.loadPlan(source);
  const [ct2, st2] = InMemoryTransport.createLinkedPair();
  await buildServer(fresh).connect(st2);
  const client2 = new Client({ name: "questions-2", version: "0.0.0" });
  await client2.connect(ct2);
  const imported = await call(client2, "import_takeoff", { path: out });
  assert.equal(imported.isError, false, imported.text);
  assert.match(imported.structured.note, /1 project-question answer event\(s\) arrived/);
  assert.deepEqual((await replayAnswers(fresh.answerJournal)).answers, { PQ1: "no" });
  await client2.close();
  await client.close();
});

test("the Session keeps a project file's assemblies block verbatim; its own journal wins; a tampered journal is reported, never applied", async () => {
  const { appendAnswer } = await import("../../web/src/lib/controlIntent/journal.ts");
  const { sessionAnswers } = await import("../src/assemblies.ts");
  const request = (over = {}) => ({ operation_id: crypto.randomUUID(), expected_head: null, reviewer: "estimator", reason: "said so", question: "PQ1", answer: "no", prefill: null, ...over });
  const a = await appendAnswer([], request(), { origin: "operator_input" });
  const block = { schema: "opentakeoff.assemblies_state.v1", pinned: [], settings: { variables: { spare_pct: 10 } }, overrides: [], answer_journal: a.events, canvas_note: "kept" };
  const s = new Session();
  assert.deepEqual(s.adoptAssembliesBlock(structuredClone(block)), { answers_adopted: 1, dropped: [] });
  assert.deepEqual(s.assembliesPayload(), block, "nothing the canvas saved is lost, unknown fields included");
  // The Session's own journal wins over a later file's.
  const b = await appendAnswer([], request({ answer: "yes" }), { origin: "agent_proposal" });
  assert.deepEqual(s.adoptAssembliesBlock({ ...block, answer_journal: b.events }), { answers_adopted: 0, dropped: [] });
  assert.equal(s.answerJournal[0].answer, "no");
  assert.deepEqual((await sessionAnswers(s)).answers, { PQ1: "no" });
  // A journal whose chain does not check out gives no answers and says why.
  s.answerJournal = [{ ...s.answerJournal[0], answer: "yes" }];
  const broken = await sessionAnswers(s);
  assert.deepEqual([broken.answers, broken.events], [{}, 0]);
  assert.match(broken.error, /does not check out.*none of its answers applies/);
  // A block its gate rejects is not adopted.
  const t = new Session();
  assert.equal(t.adoptAssembliesBlock({ schema: "something.else" }).answers_adopted, 0);
  assert.equal(t.assembliesBlock, null);
});
