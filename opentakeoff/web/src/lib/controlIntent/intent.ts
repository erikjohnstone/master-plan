// CONTROL INTENT goal (goals/CONTROL_INTENT.md, decision C1) — what the
// project's answers and its control drawings say about one scheduled unit's
// controls, as facts the assemblies selection consumes.
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. Whether a unit is in the BAS scope,
// and the options its typical takes, are the takeoff's answer; the Takeoff
// panel, the MCP tools and the evals read the same records.
//
// A fact is never a guess:
//   · "project" facts come from an answer the estimator gave (or confirmed)
//     to a catalogue question, and name the question and the answer;
//   · "drawing" facts come from control evidence bound to the unit (the
//     readers and combine.ts), and cite the spans they read.
// A fact only fills what the schedule does not print. Where the schedule
// prints a value a fact contradicts, selection shows the conflict and leaves
// the value unresolved (decision C12); it never overrides the schedule.
import type { Value } from "../assemblies/expr";
import type { Cite } from "../assemblies/schema";

/** Where a fact came from: a project answer, or the unit's control drawings. */
export type IntentSource = "project" | "drawing";

/** One fact about a unit's controls. */
export interface IntentFact<V> {
  value: V;
  source: IntentSource;
  /** The rule that produced it, e.g. "project_answer:PQ2=dod" or
   * "drawing_read:r0.exclusion". */
  rule: string;
  /** In words, what it rests on. */
  basis: string;
  /** The drawing spans (or schedule cells) it read; empty for a project answer. */
  cites: Cite[];
}

/** What the project and the drawings say about one unit. */
export interface UnitIntent {
  /** The unit is outside the BAS scope: it takes no controls typical. */
  out_of_scope?: IntentFact<true>;
  /** Attributes its row leaves unknown, decided elsewhere (never one the row
   * prints). */
  attributes?: Record<string, IntentFact<Value>>;
  /** Options of its typical, decided elsewhere. */
  options?: Record<string, IntentFact<boolean>>;
}

/** Merge facts: the first source's facts win, and a later fact on the same
 * target is dropped (callers pass the strongest source first). */
export function mergeIntents(...intents: ReadonlyArray<UnitIntent | undefined>): UnitIntent | undefined {
  const out: UnitIntent = {};
  for (const it of intents) {
    if (!it) continue;
    if (it.out_of_scope && !out.out_of_scope) out.out_of_scope = it.out_of_scope;
    for (const [k, f] of Object.entries(it.attributes ?? {})) {
      out.attributes ??= {};
      if (!(k in out.attributes)) out.attributes[k] = f;
    }
    for (const [k, f] of Object.entries(it.options ?? {})) {
      out.options ??= {};
      if (!(k in out.options)) out.options[k] = f;
    }
  }
  return out.out_of_scope || out.attributes || out.options ? out : undefined;
}

/** A fact's short label for a record's reason and the report. */
export const factLabel = (target: string, f: IntentFact<unknown>): string => `${target} = ${JSON.stringify(f.value)} (${f.rule}: ${f.basis})`;
