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

/** The registry — one entry per tool with a known real honesty risk.
 * Adding protection for a NEW tool is a one-line addition here, not a new
 * hand-written backstop wired into the loop itself. */
export const AGENT_VERIFIERS = [
  { tool: "trace_connectivity", check: checkTraceConnectivity },
  { tool: "count_marks", check: checkCountMarks },
];

/** Run every registered verifier against the full run's own call log —
 * `callLog`: Array<{ id, name, args, out }>, every tool call made this run,
 * across every loop iteration (not just the current one). Returns the
 * disclosure notes to append, in registry order; empty when nothing to
 * disclose. Pure — no I/O, easy to unit-test directly. */
export function runVerifiers(callLog) {
  const notes = [];
  for (const { tool, check } of AGENT_VERIFIERS) {
    const calls = callLog.filter((c) => c.name === tool);
    if (!calls.length) continue;
    const note = check(calls);
    if (note) notes.push(note);
  }
  return notes;
}
