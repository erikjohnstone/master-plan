// Agent-loop honesty backstop, generalized (accuracy-hardening plan,
// architecture pass): a per-tool VERIFIER REGISTRY, deterministic, code-run
// against the real tool-call transcript — not a prompt rule the model can
// choose to ignore.
//
// Real origin: `runAgentLoop`'s own connectivity backstop (a single,
// hand-written check for trace_connectivity) proved live, twice, that this
// pattern works — a model asked to trace HP-1's connectivity kept slipping a
// guessed tag name into its answer even after 3 rounds of increasingly
// forceful prompt tightening, but a code-appended note that ALWAYS fires
// when every trace_connectivity call came back dead_end/refused closed the
// gap completely, because it doesn't depend on the model cooperating at all.
// This file generalizes that ONE hand-written check into a real registry so
// future tools inherit the same guarantee by declaring a checker once,
// rather than requiring a NEW live hallucination to be caught by hand before
// each new tool gets protected.
//
// A verifier's job is narrow and honest: given every call this run made to
// ONE specific tool, decide whether the tool's own real output leaves a real
// risk that the model's free-text answer overstated what was actually
// confirmed — and if so, return a plain, factual disclosure string. It never
// tries to parse or judge the model's own prose (fragile, and this project's
// whole doctrine is deterministic tools over guessing) — it only ever states
// what the DETERMINISTIC tool itself did or didn't confirm, appended to the
// final answer unconditionally, so the true picture is always visible
// regardless of what the model wrote.

/** trace_connectivity: real, proven (see file header). A "reached" whose
 * target sits right where the seed started is the seed trivially
 * re-finding the equipment it was seeded AT, not a real connection to
 * something else — real, observed live: the model routinely seeds
 * from_norm at the equipment's own position, which the tracer trivially
 * "reaches" in 0-2 hops. Only a meaningfully distant reach counts. */
function checkTraceConnectivity(calls) {
  const everReached = calls.some(({ args, out }) => {
    if (!out || out.status !== "reached") return false;
    const fromN = Array.isArray(args?.from_norm) ? args.from_norm : null;
    const reachedAt = out?.reached_equipment?.at;
    if (!fromN || !Array.isArray(reachedAt)) return true; // can't tell — don't assume it's trivial
    return Math.hypot(reachedAt[0] - fromN[0], reachedAt[1] - fromN[1]) >= 0.02;
  });
  if (everReached) return null;
  return "[Automated check: every trace_connectivity call in this run returned dead_end or refused — no connection was confirmed by any tool. Any equipment, register, or tag name mentioned above beyond that fact is an unverified visual guess, not a tool-confirmed result.]";
}

/** count_marks: real, found live (accuracy-hardening plan, the same demo
 * session that motivated this whole file) — asked to count RG-1/CD-1
 * registers, `count_marks` honestly reported `count: 0` (real withheld
 * candidates, no confirmed geometric count) for RG-1, and the model
 * ignored that, hand-counting 6-then-9 off a view_region screenshot,
 * self-contradicting its own count mid-answer. Flags every mark with a
 * real `count: 0` result — a tool-confirmed zero is itself real, useful
 * information the final answer must not silently override with a guess. */
function checkCountMarks(calls) {
  const unconfirmed = new Set();
  for (const { out } of calls) {
    const marks = Array.isArray(out?.marks) ? out.marks : [];
    for (const m of marks) {
      if (m && typeof m.mark === "string" && m.count === 0) unconfirmed.add(m.mark);
    }
  }
  if (!unconfirmed.size) return null;
  return `[Automated check: count_marks returned a confirmed count of 0 for: ${[...unconfirmed].join(", ")}. Any specific non-zero number stated above for these is not from count_marks — treat it as an unverified visual estimate, not a tool-confirmed count.]`;
}

/** read_schedule: real, found live (accuracy-hardening plan, this same demo
 * session) — asked "does this schedule contain a ROW keyed 'REMARKS' or
 * 'SYMBOL'?" (both real COLUMN headers on the real AIR COMPRESSOR SCHEDULE,
 * itd-d1-lab-mechanical.pdf#28, which has exactly one real row, keyed
 * "AC-1"), the model answered "yes" — reasoning that the row-KEY COLUMN is
 * itself named "SYMBOL", therefore a row must be KEYED "SYMBOL". `headers`
 * (column names) and `rows[].key` (one specific row's own key) are two
 * different real fields in the SAME tool result; a prompt rule alone
 * (agentSystemPrompt) narrowed but did not close this — the model still
 * slipped on the harder, unhinted phrasing. Same doctrine as every other
 * verifier here: don't try to parse or catch the specific wrong sentence,
 * just always disclose the real, tool-confirmed row keys so a false claim
 * about row-key membership sits right next to the deterministic truth. */
function checkScheduleRowKeys(calls) {
  const tables = calls.map((c) => c.out?.table).filter((t) => t && Array.isArray(t.rows));
  if (!tables.length) return null;
  const keys = [...new Set(tables.flatMap((t) => t.rows.map((r) => r?.key).filter((k) => typeof k === "string")))];
  if (!keys.length) return null;
  return `[Automated check: read_schedule's own real row keys this run were: ${keys.join(", ")}. A column HEADER name (e.g. "SYMBOL", "REMARKS") is not a row key — only the keys listed here identify an actual row.]`;
}

/** sweep_schedule_row: real, found live (accuracy-hardening plan, this same
 * demo session) — asked to sweep EBB-1 (a real, corroborated bessemer
 * device already proven live in an earlier demo this session), the model's
 * own final answer claimed "found = 0 real matches... no confirmed
 * instances", directly contradicting the tool's own returned
 * `total_found: 1` with a real, concrete anchor `at` position in the SAME
 * tool result it had just received — a real misreading, not a tool defect
 * (re-running the identical call moments later, with no code change,
 * correctly summarized the same real data). The same "never parse the
 * model's prose, just always state ground truth" doctrine as every other
 * verifier here: discloses the tool's own real `total_found`/anchor
 * whenever it's non-zero, so a false "not found" claim sits right next to
 * the deterministic fact that contradicts it. */
function checkSweepScheduleRow(calls) {
  // Real, found live the SAME session as the fix above, stress-testing the
  // fix itself: asked to find/cite/count a whole real family ("every EBB
  // heater"), the model called sweep_schedule_row for only 2 of 8 real
  // schedule rows (EBB-1, EBB-2), then wrote a table CLAIMING all 8 were
  // "located on the plan sheet... via sweep" — a real, unambiguous
  // fabrication for the other 6, which a fresh call in the SAME session
  // moments later correctly refused (genuinely not drawn on any plan
  // sheet, exactly matching this project's own real, previously-
  // established finding for this exact device family). Disclosing only
  // the CONFIRMED tags (the original version of this check) leaves the
  // false "all N located" framing sitting right next to a note that's
  // easy to read as additive rather than exhaustive — so this now names
  // the FULL set of tags actually swept this run, split confirmed vs.
  // not, with an explicit "no other tag was checked" line, so a claim
  // about ANY tag outside that set is unmistakably unverified this run.
  const confirmed = [];
  const notConfirmed = [];
  const seen = new Set();
  for (const { args, out } of calls) {
    const tag = args?.tag || out?.tag;
    if (typeof tag !== "string" || seen.has(tag)) continue;
    seen.add(tag);
    const n = out?.total_found;
    if (typeof n === "number" && n > 0) {
      const at = Array.isArray(out?.anchor?.at) ? ` at ${JSON.stringify(out.anchor.at)}` : "";
      confirmed.push(`${tag} (total_found=${n}${at})`);
    } else {
      notConfirmed.push(tag);
    }
  }
  if (!seen.size) return null;
  const parts = [`[Automated check: sweep_schedule_row was called this run for exactly these tags, and no others: ${[...seen].join(", ")}.`];
  if (confirmed.length) parts.push(` Confirmed with a real match: ${confirmed.join("; ")}.`);
  if (notConfirmed.length) parts.push(` NOT confirmed (refused, errored, or a real 0 total_found): ${notConfirmed.join(", ")} — do not report these as located/found.`);
  parts.push(` Any tag from the same family not listed here was never checked by this tool this run — its plan-sheet placement is unverified, regardless of what the answer above claims.]`);
  return parts.join("");
}

/** The registry — one entry per tool with a known real honesty risk.
 * Adding protection for a NEW tool is a one-line addition here, not a new
 * hand-written backstop wired into the loop itself. */
export const AGENT_VERIFIERS = [
  { tool: "trace_connectivity", check: checkTraceConnectivity },
  { tool: "count_marks", check: checkCountMarks },
  { tool: "read_schedule", check: checkScheduleRowKeys },
  { tool: "sweep_schedule_row", check: checkSweepScheduleRow },
];

/** A real word for "the estimator is asking for a whole-set/whole-building
 * number", not exhaustive — deliberately narrow, common real phrasings
 * ("total", "how many", "every", "all", "sum", "combined") rather than an
 * attempt at full natural-language intent detection. False negatives (a
 * real aggregate goal phrased unusually) just mean no extra caveat fires —
 * safe by construction, never a false claim of completeness either way. */
const AGGREGATE_GOAL_RE = /\btotal(s)?\b|\bhow many\b|\bevery\b|\ball\b|\bsum\b|\bcombined\b|\baggregate\b|\bentire\b/i;

/** Completeness gate for aggregate-shaped goals (real, live-observed:
 * asked for "the total installed cooling capacity for the entire
 * building", the model checked exactly ONE piece of equipment (correctly
 * grounded, correctly cited) but presented that single value AS the
 * building-wide total with no disclosure it hadn't verified there weren't
 * others — the honest-sounding "1.95 tons" hid a real, unstated scope gap).
 * Deliberately conservative: only fires when the goal LOOKS aggregate-
 * shaped AND `sheet_graph` was actually called (so we know the real
 * candidate sheet count) AND fewer than 2 distinct sheets were ever queried
 * by a schedule/count-reading tool — a real single-sheet answer to a
 * whole-building question is exactly the shape that needs a caveat; a
 * goal that never looked aggregate-shaped, or one where multiple sheets
 * were genuinely checked, is left alone rather than over-warned. */
function checkAggregateCompleteness(callLog, goal) {
  if (!AGGREGATE_GOAL_RE.test(goal || "")) return null;
  const graphCall = callLog.find((c) => c.name === "sheet_graph" && c.out && Array.isArray(c.out.sheets));
  if (!graphCall) return null; // no real sheet inventory to compare against — nothing safe to say
  const scheduleSheets = new Set(graphCall.out.sheets.filter((s) => s?.role === "schedule").map((s) => s.sheet));
  const readerTools = new Set(["read_schedule", "find_schedule", "sweep_schedule_row", "count_marks"]);
  const sheetsQueried = new Set();
  for (const c of callLog) {
    if (!readerTools.has(c.name)) continue;
    const sheet = c.args?.sheet || c.out?.table?.sheet || c.out?.row?.sheet;
    if (sheet) sheetsQueried.add(sheet);
  }
  if (scheduleSheets.size <= 1) return null; // only one real schedule sheet exists — nothing to miss
  if (sheetsQueried.size >= 2) return null; // genuinely checked more than one sheet — not the observed failure shape
  return `[Automated check: this goal looks like it's asking for a total/aggregate, sheet_graph reported ${scheduleSheets.size} real schedule sheets in this set, but only ${sheetsQueried.size} was queried by a schedule-reading tool this run. Any total stated above may not reflect the whole set — confirm what was actually checked before treating it as complete.]`;
}

/** Run every registered verifier against the full run's own call log —
 * `callLog`: Array<{ id, name, args, out }>, every tool call made this run,
 * across every loop iteration (not just the current one). `goal` is the
 * estimator's own original goal text, needed only by the completeness
 * gate above. Returns the disclosure notes to append, in registry order;
 * empty when nothing to disclose. Pure — no I/O, easy to unit-test
 * directly. */
export function runVerifiers(callLog, goal) {
  const notes = [];
  for (const { tool, check } of AGENT_VERIFIERS) {
    const calls = callLog.filter((c) => c.name === tool);
    if (!calls.length) continue;
    const note = check(calls);
    if (note) notes.push(note);
  }
  const completeness = checkAggregateCompleteness(callLog, goal);
  if (completeness) notes.push(completeness);
  return notes;
}
