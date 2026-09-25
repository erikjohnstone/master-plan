// CONTROL INTENT goal, WP3.1 — reader R0: the deterministic reading of a
// unit's control packets (decision C7: cheapest first; C8: R0 alone applies
// only on a whitelisted phrase).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. It reads the packets the binder
// bound (binding.ts) with the term list (termlist/v1.json); the UI, MCP and
// the evals read the same answers.
//
// What R0 reads, per unit and question:
//   · its packets' clauses (readers/text.ts). A packet is the unit's OWN when
//     the unit is bound to it by a title (tag, list or range, schedule
//     cross-reference), by its family's detail, or as the sibling of a packet
//     a title binds; any other packet (a tag printed in a system schematic,
//     an owner's packet) is SHARED, and only its clauses that name the unit
//     (its tag, its family's noun, its tag's words), or whose section's
//     heading does, speak for the unit;
//   · ROLE: a not-connected phrase ("THIS SYSTEM IS STANDALONE", "NOT
//     CONTROLLED BY THE DDC SYSTEM"), whitelisted when an own packet a title
//     binds prints it of its subject; a local-control phrase (a thermostat,
//     the manufacturer or other equipment runs the unit); else the I/O an own
//     diagram draws: outputs (AO, DO, BO) mean the BAS commands something
//     there, inputs alone that it only monitors;
//   · OPTIONS: the option's yes and no phrases, traps removed first and each
//     hit checked by the negation guard ("NO", "NOT", "WITHOUT" up to three
//     words before it, or "NOT REQUIRED" and the like right after it: a
//     negated yes is a no); "absent" when no packet mentions the device.
// R0 reports what it read; combine.ts decides what applies.
import type { Box } from "../../assemblies/scheduleNotes";
import type { Binding } from "../binding";
import { PREFIX_WORDS, tagKey } from "../binding";
import type { Packet } from "../evidence";
import type { PacketText } from "./text";
import type { ReadingQuestion, RoleAnswer, OptionAnswer } from "./questions";
import type { TermList, TermPattern } from "./terms";

export const R0_VERSION = "control_r0_v2";

/** A packet bound to the unit, read. */
export interface BoundPacket {
  packet: Packet;
  text: PacketText;
  binding: Binding;
}

/** The printed text a reading rests on. */
export interface DrawingCite {
  packet: string;
  sheet: string;
  /** The packet lines (ids in the packet's text) it read. */
  lines: string[];
  text: string;
  /** Device-space box of those lines. */
  box: Box;
}

export type ReaderAnswerValue = RoleAnswer | OptionAnswer | "local_control" | "not_shown";

export interface ReaderAnswer {
  /** r0 deterministic, r1 text model, r2 vision model, rp the zone plan
   * (zonePlan.ts: a device symbol in the zone the unit's tag labels). */
  reader: "r0" | "r1" | "r2" | "rp";
  /** Which run, for a reader asked more than once (R2: "a", "b"). */
  run?: string;
  question: string;
  answer: ReaderAnswerValue;
  /** R0's whitelisted phrase, or the zone plan's symbol in the unit's zone:
   * a deterministic reading that applies alone (C8). */
  whitelisted?: boolean;
  /** The pattern or the answer's rule. */
  rule: string;
  cites: DrawingCite[];
  /** "unverified": a model answer whose quote or label did not check out. */
  note?: string;
  /** Why it is unverified, or what else to know. */
  why?: string;
}

const OWN_KINDS = new Set(["tag", "list_range", "cross_reference", "family_detail"]);
const TITLE_KINDS = new Set(["tag", "list_range", "cross_reference"]);

/** Whether a bound packet is the unit's own (see the header). */
export function ownPacket(b: Binding, all: readonly Binding[]): boolean {
  if (OWN_KINDS.has(b.kind)) return true;
  if (b.kind === "sibling") return all.some((o) => o !== b && TITLE_KINDS.has(o.kind));
  return false;
}

/** A binding a whitelisted phrase may apply through: a title names the
 * unit, and nothing about it is doubtful. */
export const strongBinding = (b: Binding): boolean => TITLE_KINDS.has(b.kind) && !b.proposal && !b.ambiguous;

/** How a system's text names a unit of a family it has one kind of ("THE
 * BMS SHALL MODULATE BOILER ISOLATION VALVES" speaks for each boiler). */
const FAMILY_NOUN: Readonly<Record<string, RegExp>> = {
  BOILER: /\bBOILERS?\b/,
  AIR_COOLED_CHILLER: /\bCHILLERS?\b/,
  HEAT_RECOVERY_CHILLER: /\bCHILLERS?\b/,
  COOLING_TOWER: /\bCOOLING\s+TOWERS?\b/,
  HEAT_EXCHANGER: /\bHEAT\s+EXCHANGERS?\b/,
  // Its function names it too ("HUMIDIFICATION MODE OF OPERATION"; UFGS
  // 23 09 93 "Humidification Control", and four dev drafters).
  HUMIDIFIER: /\bHUMIDIFI(?:ERS?|CATION)\b/,
};

/** Whether a clause of a packet other units share speaks for the unit: it
 * prints the unit's tag, its family's name (a family a system has one kind
 * of), or what its tag's letters stand for ("HOT WATER PUMP" for HWP). */
export function namesUnit(text: string, unit: { tag: string; family?: string }): boolean {
  if (namesTag(text, unit.tag)) return true;
  const noun = unit.family ? FAMILY_NOUN[unit.family] : undefined;
  if (noun?.test(text)) return true;
  const words = PREFIX_WORDS[tagKey(unit.tag)?.prefix ?? ""];
  return Boolean(words && new RegExp(`\\b${words.replace(/\s+/g, "\\s+")}S?\\b`).test(text));
}

const TAG_IN_TEXT = /\b[A-Z]{1,6}\s?-\s?\d{1,4}[A-Z]{0,2}\b/g;
/** Whether a clause prints the unit's tag. */
export function namesTag(text: string, tag: string): boolean {
  const k = tagKey(tag);
  if (!k) return false;
  for (const m of text.match(TAG_IN_TEXT) ?? []) {
    const o = tagKey(m);
    if (o && o.prefix === k.prefix && o.n === k.n && o.suffix === k.suffix) return true;
  }
  return false;
}

const NEG_BEFORE = /\b(?:NO|NOT|WITHOUT|NONE|NEITHER|NOR)\b(?:\s+\S+){0,3}\s*$/;
const NEG_AFTER = /^\s*(?:IS\s+|ARE\s+|SHALL\s+BE\s+|TO\s+BE\s+)?(?:NOT\s+(?:REQUIRED|PROVIDED|USED|INCLUDED|INSTALLED|FURNISHED)|OMITTED|N\/A)\b/;

/** A clause with its trap text blanked out (offsets kept). */
function untrapped(text: string, traps: readonly TermPattern[]): string {
  let t = text;
  for (const p of traps) {
    const g = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`);
    t = t.replace(g, (m) => " ".repeat(m.length));
  }
  return t;
}

interface Hit { pattern: TermPattern; clause: number; negated: boolean }

/** Every match of a pattern list in a clause, with the negation guard. */
function hits(text: string, patterns: readonly TermPattern[]): Array<{ pattern: TermPattern; negated: boolean }> {
  const out: Array<{ pattern: TermPattern; negated: boolean }> = [];
  for (const p of patterns) {
    const g = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`);
    for (let m = g.exec(text); m; m = g.exec(text)) {
      if (!m[0]) { g.lastIndex++; continue; }
      const before = text.slice(0, m.index);
      const after = text.slice(m.index + m[0].length);
      out.push({ pattern: p, negated: NEG_BEFORE.test(before) || NEG_AFTER.test(after) });
    }
  }
  return out;
}

const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** The cite of some lines of a packet. */
export function citeLines(bp: Pick<BoundPacket, "packet" | "text">, ids: readonly string[], text?: string): DrawingCite {
  const lines = bp.text.lines.filter((l) => ids.includes(l.id));
  const box = lines.length ? lines.map((l) => l.box).reduce(union) : bp.packet.region;
  return { packet: bp.packet.id, sheet: bp.packet.sheet, lines: lines.map((l) => l.id), text: text ?? lines.map((l) => l.text).join(" "), box };
}

const IO_TOKEN = /(?<![A-Z0-9])(AI|AO|DI|DO|BI|BO)(?![A-Z0-9])/g;
const POINTS_TABLE = /\b(?:HARDWARE|SOFTWARE)\s+POINTS\b|\bPOINT\s+NAME\b|\bPOINTS?\s+(?:LIST|SCHEDULE|SUMMARY)\b/;

/** The I/O a diagram draws: the tokens printed as labels ("AI", "BO - FAN
 * START/STOP"), never a table header naming every type. Null when the
 * packet is a points table, a sequence or draws no I/O. */
export function ioInventory(bp: BoundPacket): { outputs: string[]; inputs: string[] } | null {
  if (bp.packet.kind === "sequence" || bp.packet.kind === "points") return null;
  if (bp.text.lines.some((l) => POINTS_TABLE.test(l.norm))) return null;
  const outputs: string[] = [];
  const inputs: string[] = [];
  for (const l of bp.text.lines) {
    const toks = [...l.norm.matchAll(IO_TOKEN)].map((m) => m[1]);
    if (!toks.length || new Set(toks).size >= 3) continue;
    const words = l.norm.split(/\s+/).length;
    // A label: the token alone or leading a point name ("BO - FAN START/STOP").
    if (words > 4 && !/^(?:AI|AO|DI|DO|BI|BO)\s*[-:]/.test(l.norm)) continue;
    for (const t of toks) (t === "AO" || t === "DO" || t === "BO" ? outputs : inputs).push(l.id);
  }
  return outputs.length || inputs.length ? { outputs, inputs } : null;
}

/** R0's answers for one unit. */
export function readR0(unit: { tag: string; family?: string }, bound: readonly BoundPacket[], questions: readonly ReadingQuestion[], terms: TermList): ReaderAnswer[] {
  const all = bound.map((b) => b.binding);
  // The clauses that speak for the unit, per packet.
  const scoped = bound.map((bp) => {
    const own = ownPacket(bp.binding, all);
    // In a packet other units share, a clause speaks for the unit when it
    // names the unit, or the heading of its section does.
    const heading = new Map(bp.text.paragraphs.map((pg) => [pg.id, pg.heading]));
    const clauses = bp.text.clauses.filter((c) => own || namesUnit(c.norm, unit) || Boolean(heading.get(c.paragraph) && namesUnit(heading.get(c.paragraph)!, unit)));
    return { bp, own, clauses };
  });
  // "Absent" is read only where a title binds the unit to a packet of its
  // own: a family's typical detail need not draw a zone's own devices, and a
  // shared packet speaks for other units too.
  const titled = bound.some((bp) => ownPacket(bp.binding, all) && strongBinding(bp.binding));
  const out: ReaderAnswer[] = [];
  for (const q of questions) {
    if (q.kind === "role") {
      out.push(readRole(unit, scoped, terms));
      continue;
    }
    const t = terms.options[q.option!];
    if (!t) continue;
    const yes: Array<{ bp: BoundPacket; ids: string[]; text: string; id: string }> = [];
    const no: typeof yes = [];
    for (const { bp, clauses } of scoped) {
      for (const c of clauses) {
        const text = untrapped(c.norm, t.traps);
        for (const h of hits(text, t.yes)) (h.negated ? no : yes).push({ bp, ids: c.lines, text: c.text, id: `${h.negated ? "negated." : ""}${h.pattern.id}` });
        for (const h of hits(text, t.no)) if (!h.negated) no.push({ bp, ids: c.lines, text: c.text, id: h.pattern.id });
      }
    }
    // Callouts: in the unit's own drawings, a note printed beside a device
    // ("WIRE TO STARTER" by the freezestat) speaks for the device label
    // nearest to it, when that label is clearly the nearest.
    for (const { bp, own } of scoped) {
      if (!own || bp.packet.kind === "sequence" || !t.callouts.length) continue;
      for (const h of calloutHits(bp, t, deviceRes(terms))) (h.value === "yes" ? yes : no).push(h.hit);
    }
    // A mention anywhere in the unit's packets, whoever it speaks for.
    const mentioned = bound.some((bp) => bp.text.clauses.some((c) => t.mention.some((p) => p.re.test(untrapped(c.norm, t.traps)))));
    const cite = (xs: typeof yes) => xs.slice(0, 3).map((x) => citeLines(x.bp, x.ids, x.text));
    if (yes.length && !no.length) out.push({ reader: "r0", question: q.id, answer: "yes", rule: `r0.${q.option}.yes.${yes[0].id}`, cites: cite(yes) });
    else if (no.length && !yes.length) out.push({ reader: "r0", question: q.id, answer: "no", rule: `r0.${q.option}.no.${no[0].id}`, cites: cite(no) });
    else if (yes.length && no.length) out.push({ reader: "r0", question: q.id, answer: "not_shown", rule: `r0.${q.option}.both`, cites: [...cite(yes), ...cite(no)], note: "the packets print both the option and its alternative" });
    else if (!mentioned && titled) out.push({ reader: "r0", question: q.id, answer: "absent", rule: `r0.${q.option}.no_mention`, cites: [] });
    else out.push({ reader: "r0", question: q.id, answer: "not_shown", rule: `r0.${q.option}.mention_only`, cites: [] });
  }
  return out;
}

/** Every option's device mentions: what a device label in a drawing is. */
const DEVICE_RES = new WeakMap<TermList, RegExp[]>();
function deviceRes(terms: TermList): RegExp[] {
  let res = DEVICE_RES.get(terms);
  if (!res) DEVICE_RES.set(terms, res = Object.values(terms.options).flatMap((o) => o.mention.map((m) => m.re)));
  return res;
}

const paragraphBox = (bp: BoundPacket, ids: readonly string[]): Box => bp.text.lines.filter((l) => ids.includes(l.id)).map((l) => l.box).reduce(union);
/** The gap between two boxes (0 when they touch or overlap). */
const boxGap = (a: Box, b: Box) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));

/** A drawing's callouts for one option: the paragraph that prints the
 * callout, its nearest device label, when that label names this option's
 * device and every other device label is at least twice as far. */
function calloutHits(bp: BoundPacket, t: TermList["options"][string], devices: readonly RegExp[]): Array<{ value: "yes" | "no"; hit: { bp: BoundPacket; ids: string[]; text: string; id: string } }> {
  const out: Array<{ value: "yes" | "no"; hit: { bp: BoundPacket; ids: string[]; text: string; id: string } }> = [];
  const labels = bp.text.paragraphs.filter((p) => devices.some((re) => re.test(p.norm)));
  for (const pg of bp.text.paragraphs) {
    for (const c of t.callouts) {
      if (!c.re.test(pg.norm)) continue;
      const box = paragraphBox(bp, pg.lines);
      const h = Math.max(...bp.text.lines.filter((l) => pg.lines.includes(l.id)).map((l) => l.h));
      const near = labels.filter((l) => l !== pg).map((l) => ({ l, d: boxGap(box, paragraphBox(bp, l.lines)) })).sort((a, b) => a.d - b.d);
      const [first, second] = near;
      if (!first || first.d > 8 * h || (second && second.d < 2 * Math.max(first.d, h))) continue;
      if (!t.mention.some((m) => m.re.test(first.l.norm))) continue;
      out.push({ value: c.value, hit: { bp, ids: [...pg.lines, ...first.l.lines], text: `${pg.text} … ${first.l.text}`, id: `callout.${c.id}` } });
    }
  }
  return out;
}

function readRole(unit: { tag: string; family?: string }, scoped: ReadonlyArray<{ bp: BoundPacket; own: boolean; clauses: PacketText["clauses"] }>, terms: TermList): ReaderAnswer {
  // Not connected: a phrase that puts the unit off the BAS.
  for (const { bp, own, clauses } of scoped) {
    for (const c of clauses) {
      for (const p of terms.role.not_connected) {
        if (!p.re.test(c.norm)) continue;
        const subjectOk = namesTag(c.norm, unit.tag) || (own && (!p.subject || p.subject.test(c.norm)));
        const whitelisted = Boolean(p.whitelist) && own && strongBinding(bp.binding) && subjectOk;
        return { reader: "r0", question: "role", answer: "not_connected", ...(whitelisted ? { whitelisted: true } : {}), rule: `r0.role.not_connected.${p.id}`, cites: [citeLines(bp, c.lines, c.text)] };
      }
    }
  }
  // Something other than the BAS runs the unit.
  const local: Array<{ bp: BoundPacket; ids: string[]; text: string; id: string }> = [];
  for (const { bp, clauses } of scoped) {
    for (const c of clauses) {
      for (const p of terms.role.local_control) if (p.re.test(c.norm)) local.push({ bp, ids: c.lines, text: c.text, id: p.id });
    }
  }
  // What the unit's own diagrams draw.
  const outputs: DrawingCite[] = [];
  const inputs: DrawingCite[] = [];
  for (const { bp, own } of scoped) {
    if (!own) continue;
    const io = ioInventory(bp);
    if (!io) continue;
    if (io.outputs.length) outputs.push(citeLines(bp, io.outputs));
    if (io.inputs.length) inputs.push(citeLines(bp, io.inputs));
  }
  if (local.length && outputs.length) {
    return { reader: "r0", question: "role", answer: "not_shown", rule: "r0.role.local_and_outputs", cites: [citeLines(local[0].bp, local[0].ids, local[0].text), ...outputs], note: "a local controller runs the unit, yet its diagram draws BAS outputs" };
  }
  if (local.length) return { reader: "r0", question: "role", answer: "local_control", rule: `r0.role.local_control.${local[0].id}`, cites: local.slice(0, 3).map((x) => citeLines(x.bp, x.ids, x.text)) };
  // Outputs say the BAS commands something the unit's own diagram draws. A
  // diagram of inputs alone is not read as "monitors only": it may draw a
  // part of the unit's points (its outputs elsewhere, or on a drive).
  if (outputs.length) return { reader: "r0", question: "role", answer: "commands", rule: "r0.role.io_outputs", cites: outputs };
  return { reader: "r0", question: "role", answer: "not_shown", rule: inputs.length ? "r0.role.io_inputs_only" : "r0.role.none", cites: inputs };
}
