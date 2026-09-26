// CONTROL INTENT goal, WP3.4 — combining the readers' answers into
// decisions (decisions C8, C9, C12; LAWS CI2, CI3).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. What a reading decides is the
// takeoff's answer; every surface combines the same answers the same way.
//
// Per question, from R0 (deterministic), R1 (text model) and R2 (vision
// model, two runs):
//   · R2 counts once: its two runs agree on the value, or it says nothing
//     (a run that disagrees with the other makes R2 a disagreement). Its
//     false is an absence only when both runs read the device as not drawn.
//   · A model answer whose quote or label did not verify is UNVERIFIED: it
//     never counts, and when it says otherwise it leaves the question
//     unresolved (CI2). One its own printed quote contradicts is REFUTED: it
//     never counts and holds nothing open.
//   · APPLIED (C8): two structurally different readers agree and none
//     disagrees; or a deterministic reading alone on the whitelist: an R0
//     phrase (termlist v1: a unit stated standalone / not controlled by the
//     BAS in its own packet), or the zone plan's device symbol drawn inside
//     the zone the unit's tag labels (zonePlan.ts, geometric and exact).
//   · An absence read only through packets no title binds to the unit (a
//     family's typical detail, a shared system drawing) is no vote: a
//     typical detail need not draw a zone's own devices (R0 reads it so).
//   · ABSENT decides false only when all of C9 hold: R0 found no term for
//     the device in any of the unit's packets and a title binds the unit to
//     a packet of its own; both R2 runs say it is not drawn; R1 does not say
//     it is there; no binding of the unit is ambiguous. A false some reader
//     reads explicitly (the alternative printed, cited) is not an absence:
//     another reader finding no mention of the device agrees with it (C8).
//   · PROPOSAL: one reader alone (a model, or R0 off its whitelist), or an
//     agreement read only through bindings C5 makes proposals.
//   · UNRESOLVED (C12): readers disagree, or a reading did not verify. Both
//     sides are kept to be shown.
//   · Options of one exclusive group (a return fan or a relief fan) are one
//     choice: one applied true while a verified reader reads another of the
//     group as there too (the drawings name both) leaves them unresolved.
import type { Binding } from "./binding";
import type { IntentFact, UnitIntent } from "./intent";
import type { Cite } from "../assemblies/schema";
import type { DrawingCite, ReaderAnswer } from "./readers/r0";
import type { ReadingQuestion } from "./readers/questions";
import type { TermList } from "./readers/terms";

export const COMBINE_VERSION = "control_combine_v6";

export type Outcome = "applied" | "proposal" | "unresolved" | "none";

/** A reader answer as the combiner uses it: its reader and value. */
export interface Vote {
  reader: ReaderAnswer["reader"];
  /** Role: "out" (not commanded by the BAS) or "in"; option: true or false. */
  value: "out" | "in" | boolean;
  /** An option read false because the device is not drawn at all. */
  absence?: boolean;
}

export interface Decision {
  question: string;
  outcome: Outcome;
  /** Role: "out" puts the unit outside the BAS scope; option: its value. */
  value: "out" | "in" | boolean | null;
  /** The role answer behind an "out": monitors only, not connected or a
   * local controller runs it. */
  role?: string;
  rule: string;
  why: string;
  answers: ReaderAnswer[];
  cites: DrawingCite[];
}

/** One unit's answers and what it is bound through. */
export interface UnitAnswers {
  questions: readonly ReadingQuestion[];
  answers: readonly ReaderAnswer[];
  bindings: readonly Binding[];
}

const voteOf = (a: ReaderAnswer, q: ReadingQuestion, titled = true): Vote | null => {
  if (a.note === "unverified" || a.note === "refuted") return null;
  if (q.kind === "role") {
    if (a.answer === "not_connected" || a.answer === "monitors_only" || a.answer === "local_control") return { reader: a.reader, value: "out" };
    if (a.answer === "commands") return { reader: a.reader, value: "in" };
    return null;
  }
  if (a.answer === "yes") return { reader: a.reader, value: true };
  if (a.answer === "no") return { reader: a.reader, value: false };
  if (a.answer === "absent") return titled ? { reader: a.reader, value: false, absence: true } : null;
  return null;
};

const TITLE_KINDS = new Set(["tag", "list_range", "cross_reference"]);

const packetsOf = (as: readonly ReaderAnswer[]) => new Set(as.flatMap((a) => a.cites.map((c) => c.packet)));

/** Combine one unit's answers into one decision per question. */
export function combineUnit(u: UnitAnswers, terms?: TermList): Decision[] {
  const proposalPackets = new Set(u.bindings.filter((b) => b.proposal).map((b) => b.packet));
  const ambiguous = u.bindings.some((b) => b.ambiguous);
  // Packets bound with a doubt (C5's proposals, or one of several packets of
  // a kind bound equally), and the equally bound ones.
  const doubtful = new Set(u.bindings.filter((b) => b.proposal || b.ambiguous).map((b) => b.packet));
  const equallyBound = u.bindings.filter((b) => b.ambiguous && !b.proposal).map((b) => b.packet);
  const allProposal = u.bindings.length > 0 && u.bindings.every((b) => b.proposal);
  // A title binds the unit to a packet, and nothing about it is doubtful.
  const titled = u.bindings.some((b) => TITLE_KINDS.has(b.kind) && !b.proposal && !b.ambiguous);
  const vote = (a: ReaderAnswer, q: ReadingQuestion) => voteOf(a, q, titled);
  const out: Decision[] = [];
  for (const q of u.questions) {
    const as = u.answers.filter((a) => a.question === q.id);
    const r0 = as.find((a) => a.reader === "r0");
    const r1 = as.find((a) => a.reader === "r1");
    const r2s = as.filter((a) => a.reader === "r2");
    const rp = as.find((a) => a.reader === "rp");
    const unverified = as.filter((a) => a.note === "unverified");
    const base = { question: q.id, answers: as, cites: as.flatMap((a) => a.cites) };
    // R2 counts once, when its runs agree.
    const r2votes = r2s.map((a) => vote(a, q));
    let r2: Vote | null = null;
    let r2split = false;
    if (r2s.length >= 2 && r2votes.every((v) => v)) {
      const [a, b] = r2votes as Vote[];
      if (a.value === b.value) r2 = { ...a, absence: Boolean(a.absence) && Boolean(b.absence) };
      else r2split = true;
    }
    // One run read something, the other nothing: not an agreement, and not
    // a disagreement either (R2 says nothing).
    const votes = [r0 ? vote(r0, q) : null, r1 ? vote(r1, q) : null, r2, rp ? vote(rp, q) : null].filter((v): v is Vote => Boolean(v));
    const values = new Set(votes.map((v) => String(v.value)));
    const roleOf = () => [r1, ...r2s, r0].find((a) => a && (a.answer === "monitors_only" || a.answer === "not_connected" || a.answer === "local_control"))?.answer;
    // A reading that did not verify is dropped (CI2); one that says the
    // opposite of what the verified readers say still leaves the question
    // unresolved: it may have seen what they missed.
    const unverifiedValue = (a: ReaderAnswer) => vote({ ...a, note: undefined }, q)?.value;
    const verifiedValues = new Set(votes.map((v) => String(v.value)));
    if (verifiedValues.size === 1 && unverified.some((a) => { const v = unverifiedValue(a); return v !== undefined && !verifiedValues.has(String(v)); })) {
      out.push({ ...base, outcome: "unresolved", value: null, rule: "drawing_read:unverified", why: `a ${unverified.map((a) => `${a.reader}${a.run ?? ""}`).join(", ")} reading that did not verify says otherwise` });
      continue;
    }
    if (values.size > 1 || r2split) {
      out.push({ ...base, outcome: "unresolved", value: null, rule: "drawing_read:disagreement", why: `the readers disagree: ${as.map((a) => `${a.reader}${a.run ? a.run : ""} ${a.answer}`).join(", ")}` });
      continue;
    }
    if (!votes.length) {
      out.push({ ...base, outcome: "none", value: null, rule: "drawing_read:not_shown", why: "no reader found it decided" });
      continue;
    }
    const value = votes[0].value;
    const readers = [...new Set(votes.map((v) => v.reader))];
    // Through bindings C5 makes proposals only?
    const deciding = as.filter((a) => vote(a, q));
    const citedPackets = packetsOf(deciding);
    const viaProposal = citedPackets.size ? [...citedPackets].every((p) => proposalPackets.has(p)) : allProposal;
    // Read only through doubtful packets, and not in every packet bound
    // equally: those packets may be other units' ("VAV BOX SEQUENCE OF
    // OPERATION" twice on a sheet, one for boxes with reheat and one for
    // cooling-only boxes). Every equally bound packet saying so applies.
    const viaOneOfSeveral = citedPackets.size > 0 && [...citedPackets].every((p) => doubtful.has(p)) && equallyBound.some((p) => !citedPackets.has(p));
    const doubt = viaProposal || viaOneOfSeveral;
    const role = q.kind === "role" && value === "out" ? { role: roleOf() } : {};
    // Absence (C9): a false no reader reads explicitly.
    const explicitFalse = votes.filter((v) => v.value === false && !v.absence);
    if (value === false && !explicitFalse.length && votes.some((v) => v.absence)) {
      const r0absent = r0 && vote(r0, q)?.absence;
      const r2absent = r2?.absence === true;
      const r1present = r1 && vote(r1, q)?.value === true;
      if (r0absent && r2absent && !r1present && !ambiguous && !viaProposal) {
        out.push({ ...base, outcome: "applied", value: false, rule: "drawing_read:absence", why: "not drawn: no term for it in the unit's packets, and both vision runs find none" });
      } else {
        out.push({ ...base, outcome: "proposal", value: false, rule: "drawing_read:absence_unconfirmed", why: `read as not drawn by ${readers.join(", ")}; C9 needs R0 and both vision runs, a title-bound packet and no ambiguity` });
      }
      continue;
    }
    // A whitelisted deterministic reading, alone.
    const white = [r0, rp].find((a) => a?.whitelisted && readers.length === 1 && readers[0] === a.reader);
    if (white) {
      out.push({ ...base, ...role, outcome: doubt ? "proposal" : "applied", value, rule: `drawing_read:${white.rule}`, why: white.reader === "rp" ? "a device symbol drawn inside the zone the unit's tag labels on the zone plan" : "a whitelisted phrase of the unit's own packet" });
      continue;
    }
    if (readers.length >= 2) {
      const absent = votes.filter((v) => v.absence).map((v) => v.reader);
      const agree = absent.length ? `${explicitFalse.map((v) => v.reader).join(" and ")} read it false, and ${absent.join(" and ")} ${absent.length > 1 ? "find" : "finds"} no mention of it` : `${readers.join(" and ")} agree`;
      // C5, reader by reader: a reader that read it only in packets bound to
      // the unit as proposals (another kind's detail, maybe) casts no vote
      // that applies; two readers must read it in the unit's own packets.
      const own = readers.filter((r) => deciding.some((a) => a.reader === r && !(a.cites.length > 0 && a.cites.every((c) => proposalPackets.has(c.packet)))));
      const partly = !doubt && own.length < 2;
      const why = viaProposal ? "the readers agree, but only through a family detail whose qualifier the row does not print (C5)"
        : viaOneOfSeveral ? "the readers agree, but only in one of the packets bound to the unit equally, which may be another kind of unit's"
        : partly ? `the readers agree, but only ${own.length ? own.join(" and ") : "none"} of them read it in the unit's own packets; the others only in a family detail whose qualifier the row does not print (C5)` : agree;
      out.push({ ...base, ...role, outcome: doubt || partly ? "proposal" : "applied", value, rule: `drawing_read:agree(${readers.join(",")})`, why });
      continue;
    }
    out.push({ ...base, ...role, outcome: "proposal", value, rule: `drawing_read:single(${readers[0]})`, why: `${readers[0]} alone` });
  }
  // Exclusive options: one applied true while a verified reader reads
  // another of the group as there is a conflict (C12).
  for (const g of terms?.exclusive ?? []) {
    const group = out.filter((d) => g.options.some((o) => d.question === `opt.${o}`));
    const applied = group.filter((d) => d.outcome === "applied" && d.value === true);
    if (!applied.length) continue;
    const others = group.filter((d) => !applied.includes(d) && d.answers.some((a) => a.note !== "unverified" && a.note !== "refuted" && a.answer === "yes"));
    if (applied.length < 2 && !others.length) continue;
    for (const d of [...applied, ...others]) { d.outcome = "unresolved"; d.rule = "drawing_read:exclusive"; d.why = `${g.options.join(" and ")} are one choice (${g.why}), and the drawings read as both`; d.value = null; }
  }
  return out;
}

const citeOf = (c: DrawingCite): Cite => ({ sheet: c.sheet, table_title: `(control packet ${c.packet})`, header: `${c.lines.join(",")}: ${c.text.slice(0, 160)}`, bbox: [...c.box] });

/** The facts the applied decisions make (the rest stay in the readings to
 * be shown, never applied). */
export function decisionIntent(ds: readonly Decision[]): UnitIntent | undefined {
  const it: UnitIntent = {};
  for (const d of ds) {
    if (d.outcome !== "applied") continue;
    const cites = d.cites.slice(0, 6).map(citeOf);
    if (d.question === "role") {
      if (d.value !== "out") continue;
      const fact: IntentFact<true> = { value: true, source: "drawing", rule: `drawing_read:role.${d.role ?? "out"}`, basis: `${d.why} (${d.rule}); v1 has no monitor-only typical`, cites };
      it.out_of_scope = fact;
      continue;
    }
    if (typeof d.value !== "boolean") continue;
    it.options ??= {};
    it.options[d.question.slice(4)] = { value: d.value, source: "drawing", rule: d.rule, basis: d.why, cites };
  }
  return it.out_of_scope || it.options ? it : undefined;
}

/** The facts a project's readings apply (item → intent). */
export function readingIntents(readings: { units: ReadonlyArray<{ item: number; decisions: readonly Decision[] }> } | null | undefined): Map<number, UnitIntent> {
  const m = new Map<number, UnitIntent>();
  for (const u of readings?.units ?? []) {
    const it = decisionIntent(u.decisions);
    if (it) m.set(u.item, it);
  }
  return m;
}
