// Persistent Agent run history (maturity plan Phase 2): a real, reviewable
// ledger of past Agent goals — what was asked, every tool call it made, and
// how it ended — surviving reload instead of vanishing the moment `agentLog`
// (pure React state) gets wiped. Mirrors thumbs.js/textIndex.js's own
// pattern: a persisted record per key in the shared keyPath-less `meta`
// store, this module only owning the record's SHAPE and its read/write
// primitives — debouncing and orchestration belong to the component that
// actually drives a run (TakeoffCanvas.jsx), the same split textIndex.js
// already keeps.
//
// Every competitor in this space converges on the same UX primitive this is
// modeled on: a persistent, timestamped, traceable audit trail (Bluebeam
// Revu's Markups List, Kreo's visual check mode, Provision AI's explainable
// audit trails) — and of the AI-agent-memory literature's patterns, this is
// closest to an "episodic event log" (a chronological ledger of goal → tool
// calls → outcome) combined with "execution checkpointing" (persisted
// incrementally, not only at the end, so a crash/reload mid-run doesn't
// lose the whole trace — see recordRunEvent's debounced save in
// TakeoffCanvas.jsx).
import { metaGet, metaPut, metaListPrefix } from "./store.js";

const PREFIX = "run:v1:";
const keyOf = (id) => `${PREFIX}${id}`;

/**
 * @typedef {Object} RunToolCall
 * @property {"tool_start"|"tool_end"|"text"|"error"} type
 * @property {string} [name]
 * @property {any} [args]
 * @property {any} [result]
 * @property {string} [text]
 * @property {string} [message]
 * @property {number} ts
 */
/**
 * @typedef {Object} Run
 * @property {string} id
 * @property {string} goal_text
 * @property {number} started_at
 * @property {number|null} finished_at
 * @property {"running"|"done"|"error"|"aborted"} status
 * @property {string|null} outcome_summary
 * @property {RunToolCall[]} tool_calls
 */

export function newRunId() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** A fresh, in-memory Run record. The caller owns mutating it turn by turn
 * (recordRunEvent in TakeoffCanvas.jsx) and persisting via saveRun — this
 * just gives the shape one single definition so nothing drifts.
 * @param {string} goalText @returns {Run} */
export function newRun(goalText) {
  return {
    id: newRunId(),
    goal_text: goalText,
    started_at: Date.now(),
    finished_at: null,
    status: "running",
    outcome_summary: null,
    tool_calls: [],
  };
}

/** Best-effort persist; a quota failure only costs losing this run's history,
 * never the run itself (which lives on in agentLog/agentProposals either way).
 * @param {Run} run @returns {Promise<void>} */
export function saveRun(run) {
  return metaPut(keyOf(run.id), run).catch(() => {});
}

/** @param {string} id @returns {Promise<Run|null>} */
export async function loadRun(id) {
  try { return (await metaGet(keyOf(id))) || null; } catch { return null; }
}

/** Every persisted run, most recent first. @returns {Promise<Run[]>} */
export async function listRuns() {
  try {
    const rows = await metaListPrefix(PREFIX);
    return rows.map((r) => r.value).filter(Boolean).sort((a, b) => (b.started_at || 0) - (a.started_at || 0));
  } catch { return []; }
}

/** Strip the one field genuinely too large/binary to keep in a persisted
 * audit record (a view_region PNG's base64 data URL) — everything else
 * about a tool result is kept at full fidelity, unlike agentLog's own
 * DISPLAY truncation (trimJson): this is the record for later review, not
 * a live scrolling feed, so it can afford to be richer than the UI.
 * @param {any} result @returns {any} */
export function sanitizeToolResult(result) {
  if (!result || typeof result !== "object") return result;
  if (!("image_data_url" in result)) return result;
  const { image_data_url, ...rest } = result;
  return rest;
}
