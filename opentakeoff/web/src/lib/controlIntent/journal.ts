// CONTROL INTENT goal, WP1.5 — the project's answers as an append-only
// journal of fingerprinted decisions (decision C4; LAW CI4; the
// basScopeReviewContract.ts pattern).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The Takeoff panel and MCP's
// answer_project_question record answers the same way, the project file
// carries the same journal, and both replay it to the same answers.
//
// Each event is one answer to one catalogue question, made against the
// journal's head (expected_head, the last event's id): an event made against
// a stale head, or an operation replayed, is refused, never merged. The
// reviewer is self-declared; nothing here approves anything (approved is
// always false). An agent's answer is recorded as an agent_proposal, an
// estimator's as operator_input. "unknown" answers "don't know": replayed, it
// takes the question's answer away. The pre-fill shown when answering is
// kept with the event, so what was proposed and what was chosen stay apart.
import { z } from "zod";
import { canonicalBasJson } from "../basCanonical";
import { sha256Hex } from "../graphKeys.js";
import { CATALOGUE, type ProjectAnswers, type QuestionId } from "./catalogue";

export const ANSWER_JOURNAL_RULE = "control_answers_1" as const;
export const ANSWER_JOURNAL_LIMIT = 10_000;

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const evidence = z.object({
  sheet: z.string().nullable(),
  text: z.string().max(4096),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  finder: z.string().max(256),
}).strict();

export const answerRequestSchema = z.object({
  operation_id: z.string().uuid(),
  expected_head: sha.nullable(),
  reviewer: z.string().trim().min(1).max(256),
  reason: z.string().trim().min(1).max(4096),
  question: z.enum(CATALOGUE.map((q) => q.id) as [QuestionId, ...QuestionId[]]),
  answer: z.string().min(1).max(64),
  /** The pre-fill the question showed, if any: a proposal, kept apart. */
  prefill: z.object({ value: z.string(), evidence: z.array(evidence).max(12) }).strict().nullable(),
}).strict().superRefine((r, ctx) => {
  const q = CATALOGUE.find((x) => x.id === r.question)!;
  if (!q.choices.some((c) => c.value === r.answer)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${r.question} has no choice "${r.answer}"` });
});

export const answerEventSchema = z.object({
  operation_id: z.string().uuid(),
  expected_head: sha.nullable(),
  reviewer: z.string().trim().min(1).max(256),
  reason: z.string().trim().min(1).max(4096),
  question: z.enum(CATALOGUE.map((q) => q.id) as [QuestionId, ...QuestionId[]]),
  answer: z.string().min(1).max(64),
  prefill: z.object({ value: z.string(), evidence: z.array(evidence).max(12) }).strict().nullable(),
  event_id: sha,
  rule_version: z.literal(ANSWER_JOURNAL_RULE),
  origin: z.enum(["operator_input", "agent_proposal"]),
  created_at: z.string().datetime(),
  reviewer_identity: z.literal("self_declared"),
  approved: z.literal(false),
  /** The fingerprint of the answers the journal holds after this event. */
  result_fingerprint: sha,
}).strict();

export type AnswerRequest = z.infer<typeof answerRequestSchema>;
export type AnswerEvent = z.infer<typeof answerEventSchema>;

/** The answers a list of events leaves, in order: the last answer to a
 * question stands; "unknown" takes it away. */
function answersAfter(events: ReadonlyArray<Pick<AnswerEvent, "question" | "answer">>): ProjectAnswers {
  const out: ProjectAnswers = {};
  for (const e of events) {
    if (e.answer === "unknown") delete out[e.question];
    else out[e.question] = e.answer;
  }
  return out;
}

const fingerprint = async (value: unknown) => sha256Hex(new TextEncoder().encode(canonicalBasJson(value)));

/** The journal's answers and head, after checking every event: its fields,
 * its place in the chain, its id and its result. Throws on a divergent or
 * tampered history. */
export async function replayAnswers(events: readonly unknown[]): Promise<{ answers: ProjectAnswers; head: string | null; events: AnswerEvent[] }> {
  if (events.length > ANSWER_JOURNAL_LIMIT) throw new Error(`answer journal: more than ${ANSWER_JOURNAL_LIMIT} events`);
  const out: AnswerEvent[] = [];
  const operations = new Set<string>();
  let head: string | null = null;
  for (const raw of events) {
    const e = answerEventSchema.parse(raw);
    if (e.expected_head !== head) throw new Error(`answer journal: event ${e.event_id.slice(0, 12)} was made against another history`);
    if (operations.has(e.operation_id)) throw new Error(`answer journal: operation ${e.operation_id} appears twice`);
    const { event_id, ...body } = e;
    if (await fingerprint(body) !== event_id) throw new Error(`answer journal: event ${event_id.slice(0, 12)} does not match its id`);
    const answers = answersAfter([...out, e]);
    if (await fingerprint(answers) !== e.result_fingerprint) throw new Error(`answer journal: event ${event_id.slice(0, 12)} does not match its result`);
    out.push(e);
    operations.add(e.operation_id);
    head = event_id;
  }
  return { answers: answersAfter(out), head, events: out };
}

/** Record one answer: the new journal and its event. Refuses a request made
 * against a stale head or an operation the journal already holds. */
export async function appendAnswer(events: readonly unknown[], request: unknown, opts: { origin: AnswerEvent["origin"]; now?: Date }): Promise<{ events: AnswerEvent[]; event: AnswerEvent; answers: ProjectAnswers }> {
  const { events: past, head } = await replayAnswers(events);
  const r = answerRequestSchema.parse(request);
  if (r.expected_head !== head) throw new Error(`answer journal: the request was made against ${r.expected_head ? r.expected_head.slice(0, 12) : "an empty journal"}, but the journal's head is ${head ? head.slice(0, 12) : "empty"}; read the questions again`);
  if (past.some((e) => e.operation_id === r.operation_id)) throw new Error(`answer journal: operation ${r.operation_id} was already recorded`);
  const answers = answersAfter([...past, r]);
  const body = {
    ...r,
    rule_version: ANSWER_JOURNAL_RULE,
    origin: opts.origin,
    created_at: (opts.now ?? new Date()).toISOString(),
    reviewer_identity: "self_declared" as const,
    approved: false as const,
    result_fingerprint: await fingerprint(answers),
  };
  const event = answerEventSchema.parse({ ...body, event_id: await fingerprint(body) });
  return { events: [...past, event], event, answers };
}
