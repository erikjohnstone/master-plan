// CONTROL INTENT goal, WP2.2: binding control packets to scheduled units
// (goals/CONTROL_INTENT.md decision C5, CI1).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The packets a unit binds to are
// the only drawing text its options are ever read from; the UI, MCP and the
// evals share this one binder.
//
// Targeting is deterministic: no model decides what governs a unit. Each
// binding records its kind and the evidence it rests on. Kinds, strongest
// first:
//   tag              the packet's title names the unit's tag
//   list_range       the title's tag list or range contains it ("RTU-1, 2, 3",
//                    "AHU-4, AHU-5 & AHU-8", "VAV-1 THRU VAV-9"), expanded
//                    only across scheduled tags; numbers compare as integers
//                    ("AHU-4" is "AHU-04", never "AHU-40")
//   cross_reference  a cell of the unit's row equals a designator in the
//                    title ("FAN-A"), or the row's notes name the packet's
//                    sheet ("SEE M6.5") and the packet there is the unit's kind
//   label_list       the packet's own label lists the unit ("EXHAUST FAN
//                    (EF-1, 2, 3, 4, & 5)" over a diagram of the unit's family):
//                    the packet is the unit's, as a title list's is, but no
//                    title names the unit
//   tag_body         the unit's tag is printed inside the packet, and no title
//                    names the unit anywhere (a title that names it wins; a
//                    tag in another unit's detail is usually a reference)
//   sibling          the packet names the same subject, on the same sheet, as
//                    a packet the unit is bound to (a schematic's sequence)
//   family_detail    nothing above binds the unit to a packet of this kind by
//                    a title; the unit's family (from its schedule) is the one
//                    the title names, or its schedule prints the title's whole
//                    subject; and every qualifier in the title ("HYDRONIC",
//                    "TOILET") is printed in the unit's own row or schedule. A
//                    qualifier left unconfirmed makes the binding a proposal
//                    (C5: readings through it are proposals only); two
//                    packets of one kind left make both ambiguous; a packet
//                    other rows of the same schedule chose by reference is
//                    theirs, not every row's
//   component_of     the weakest: a unit with no packet of its own whose row
//                    names the one scheduled unit it serves or belongs to
//                    ("SERVICE: AHU-1") takes that unit's packets
//   system           a hydronic plant's drawing ("CHILLED WATER SYSTEM
//                    SEQUENCE OF OPERATION", "HEATING HOT WATER PLANT POINTS
//                    LIST") binds the plant's own equipment: its chillers,
//                    boilers or cooling towers, and the pumps and exchangers
//                    whose row says they serve that system ("SERVICE:
//                    PRIMARY - CHILLED WATER"), where no packet of that kind
//                    binds the unit already. The drawing is the plant's, not
//                    the unit's own: only its clauses that name the unit
//                    speak for it, and no absence is read through it
// A sheet whose title block names control evidence (scope "sheet") binds a
// unit by a tag in that title; as a sibling when the sheet is about the
// unit's family and the only units its titles name are those of the title
// that names the unit; or by family only when no packet binds the unit.
import type { Packet } from "./evidence";
import { pageLines, repairSpacing, SENTENCE, subjectFamily, subjectWords } from "./evidence";
import type { RowUnit } from "./rowReader";
import { frameBox } from "../assemblies/scheduleNotes";

export type BindingKind = "tag" | "list_range" | "cross_reference" | "label_list" | "tag_body" | "sibling" | "family_detail" | "component_of" | "system";

export interface Binding {
  packet: string;
  kind: BindingKind;
  /** In words, what it rests on. */
  evidence: string;
  /** A family binding whose title qualifier the unit's row does not print:
   * readings through it are proposals only. */
  proposal?: true;
  /** Another packet of the same kind binds the unit at the same strength. */
  ambiguous?: true;
}

const RANK: Record<BindingKind, number> = { tag: 1, list_range: 1, cross_reference: 2, label_list: 3, tag_body: 3, sibling: 4, family_detail: 5, system: 5, component_of: 6 };

// ── Tags ────────────────────────────────────────────────────────────────────

/** A tag's mark (its letters, its number, what follows) and the letters
 * printed before the mark, if any: a building or area ("WHSE-AHU-1") or a
 * kind of unit ("EF-B1", "AHU-A1" beside "DOAH-A1"). */
interface TagKey { prefix: string; n: number; suffix: string; qualifier?: string }

/** A tag's parts: its letters, its number as an integer, what follows, and
 * the letters printed before them. */
export function tagKey(tag: string): TagKey | null {
  const m = String(tag ?? "").toUpperCase().replace(/[‐-―−﹘﹣－]/g, "-").match(/^\s*(?:([A-Z]{1,6})-)?([A-Z]{1,6})\s*-?\s*(\d{1,4})([A-Z]{0,2})\s*(?:\([A-Z]{1,10}\))?\s*$/);
  return m ? { prefix: m[2], n: Number(m[3]), suffix: m[4], ...(m[1] ? { qualifier: m[1] } : {}) } : null;
}
/** One mark, and no two different qualifiers ("AHU-A1" is not "DOAH-A1";
 * "AHU-1" may be "WHSE-AHU-1"). */
const sameTag = (a: TagKey, b: TagKey) => a.prefix === b.prefix && a.n === b.n && a.suffix === b.suffix
  && (!a.qualifier || !b.qualifier || a.qualifier === b.qualifier);
/** The mark alone: the units a printed tag could be are those of its mark. */
const keyString = (k: TagKey) => `${k.prefix}-${k.n}${k.suffix}`;

/** The tags a title names, lists and ranges expanded over the scheduled
 * tags: "RTU-1, 2, 3" carries the prefix; "VAV-1 THRU VAV-9" and "EF-1 THRU
 * 3" take every scheduled tag of that prefix in the range. A list runs
 * only while tags and numbers follow one another with "," "&" "AND" or
 * "THRU" between; any other word ends it. A mark printed with a space
 * ("DOAS 3 P&ID", "DOAS 1&2 P&ID") is a tag when its letters and number make
 * a scheduled unit's mark: never a number or word that happens to follow
 * ("LEVEL 2", "VAV 100% OA" beside no VAV-100). */
export function titleTags(title: string, scheduled: readonly TagKey[]): Array<{ key: TagKey; how: "tag" | "list_range" }> {
  const text = repairSpacing(title).replace(/[‐-―−﹘﹣－]/g, "-");
  // A qualified mark ("EF-B1", "WHSE-AHU-1") is one tag, never its mark alone.
  const toks = text.match(/[A-Z]{1,6}-[A-Z]{1,6}-?\d{1,4}[A-Z]{0,2}(?![A-Z0-9])|[A-Z]{1,6}\s?-\s?\d{1,4}[A-Z]{0,2}(?![A-Z0-9])|\d{1,4}[A-Z]{0,2}(?![A-Z0-9])|[A-Z][A-Z0-9%'\/]*|[,&()]|\S/g) ?? [];
  const out: Array<{ key: TagKey; how: "tag" | "list_range" }> = [];
  const marks = new Set(scheduled.map(keyString));
  const add = (k: TagKey, how: "tag" | "list_range") => {
    const had = out.find((o) => sameTag(o.key, k));
    if (had) { if (how === "list_range") had.how = how; } else out.push({ key: k, how });
  };
  let last: TagKey | null = null;
  let pending: "list" | "range" | null = null;
  let word: string | null = null;
  for (const tok of toks) {
    const t = tok.replace(/\s+/g, "");
    const prev = last as TagKey | null;
    const before = word;
    word = /^[A-Z]{1,6}$/.test(t) ? t : null;
    const spaced = before && !pending && /^\d{1,4}[A-Z]{0,2}$/.test(t) ? tagKey(`${before}-${t}`) : null;
    const k: TagKey | null = /^(?:[A-Z]{1,6}-)?[A-Z]{1,6}-?\d/.test(t) ? tagKey(t)
      : spaced && marks.has(keyString(spaced)) ? spaced
      : /^\d{1,4}[A-Z]{0,2}$/.test(t) && prev && pending ? tagKey(`${prev.qualifier ? `${prev.qualifier}-` : ""}${prev.prefix}-${t}`) : null;
    if (k) {
      if (pending === "range" && last && last.prefix === k.prefix) {
        // The range's qualifier goes with every mark in it ("EF-B1 THRU EF-B3").
        for (const s of scheduled) {
          if (s.prefix === k.prefix && s.n >= last.n && s.n <= k.n && (!s.qualifier || !k.qualifier || s.qualifier === k.qualifier)) add({ ...s, ...(k.qualifier ? { qualifier: k.qualifier } : {}) }, "list_range");
        }
        add(last, "list_range");
        add(k, "list_range");
      } else if (pending === "list" && last) {
        add(last, "list_range");
        add(k, "list_range");
      } else add(k, "tag");
      last = k;
      pending = null;
      continue;
    }
    if (t === "," || t === "&" || t === "AND") { if (last) pending = "list"; continue; }
    if (t === "THRU" || t === "THROUGH") { if (last) pending = "range"; continue; }
    if (t === "(" || t === ")") continue;
    last = null;
    pending = null;
  }
  return out;
}

/** A control drawing's point designators (the I/O types readers/r0.ts reads):
 * "BO-1" printed in a diagram is a binary output, never a unit's tag. */
const IO_POINT = new Set(["AI", "AO", "BI", "BO", "DI", "DO"]);

/** The tags printed in a packet: whole tokens in its text, and tags drawn
 * in a tag symbol, the letters over the number as two spans (the letters'
 * span with a number span right under it, centred on it). */
function bodyTags(p: Packet, maxWords = Infinity): TagKey[] {
  const out: TagKey[] = [];
  const add = (k: TagKey) => { if (!out.some((o) => sameTag(o, k))) out.push(k); };
  // Whole tokens on each printed line (a label may be set in several spans:
  // "HWP" "-" "2 (STBY)").
  for (const l of pageLines(p.spans)) {
    if (l.text.split(" ").length > maxWords) continue;
    for (const m of repairSpacing(l.text).matchAll(/(?<![A-Z0-9-])([A-Z]{1,6})\s?-\s?(\d{1,4})([A-Z]{0,2})(?![A-Z0-9])/g)) {
      if (!IO_POINT.has(m[1])) add({ prefix: m[1], n: Number(m[2]), suffix: m[3] });
    }
  }
  const framed = p.spans.map((s) => {
    const rot = (((Math.round(Number(s.rot ?? 0) / 90) * 90) % 360) + 360) % 360;
    return { s, rot, b: frameBox([s.x0, s.y0, s.x1, s.y1], rot), t: String(s.str ?? "").trim().toUpperCase() };
  });
  for (const pre of framed) {
    if (!/^[A-Z]{1,5}-?$/.test(pre.t) || IO_POINT.has(pre.t.replace(/-$/, ""))) continue;
    const h = pre.b[3] - pre.b[1];
    const cx = (pre.b[0] + pre.b[2]) / 2;
    const num = framed.filter((n) => n.rot === pre.rot && /^-?\d{1,3}[A-Z]?$/.test(n.t)
      && Math.abs((n.b[0] + n.b[2]) / 2 - cx) <= Math.max(0.5 * h, (pre.b[2] - pre.b[0]) / 2)
      && n.b[1] >= pre.b[3] - 0.4 * h && n.b[1] <= pre.b[3] + 1.2 * h)
      .sort((a, b) => a.b[1] - b.b[1])[0];
    if (!num) continue;
    const k = tagKey(`${pre.t.replace(/-$/, "")}-${num.t.replace(/^-/, "")}`);
    if (k) add(k);
  }
  return out;
}

// ── Row evidence ────────────────────────────────────────────────────────────

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/** Whether a unit's row prints a drive (a VFD): the drives' detail is then
 * about a part of the unit. */
export const printsDrive = (cells: Readonly<Record<string, string>>): boolean =>
  /(?:^|[^A-Z])(?:VFD|V\.F\.D\.?|VARIABLE FREQUENCY DRIVE)(?:$|[^A-Z])/.test(Object.values(cells).map(clean).join(" | "));
const compact = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Words a title and a row may spell differently (standard HVAC
 * abbreviations and synonyms): each group is one meaning. */
const SYNONYMS: string[][] = [
  ["HYDRONIC", "HEATING HOT WATER", "HOT WATER", "HW", "HHW", "HEATING WATER", "HWS", "HWR"],
  ["CHILLED WATER", "CHW", "CHWS", "CHWR"],
  ["ELECTRIC", "ELEC", "ELECTRICAL", "KW"],
  ["STEAM", "STM", "LPS", "HPS"],
  ["GAS", "NATURAL GAS", "NG", "GAS-FIRED", "GAS FIRED"],
  ["TOILET", "TOILETS", "RESTROOM", "RESTROOMS", "TOILET ROOM", "TOILET ROOMS"],
  ["MECHANICAL ROOM", "MECH ROOM", "MECH RM", "MECHANICAL RM", "MER"],
  ["EXHAUST", "EXH", "EA"],
  ["SUPPLY", "SUP", "SA"],
  ["RETURN", "RET", "RA"],
  ["OUTSIDE AIR", "OUTDOOR AIR", "OA"],
  ["VARIABLE AIR VOLUME", "VAV"],
  ["CONSTANT VOLUME", "CV", "CONSTANT AIR VOLUME", "CAV"],
  ["VARIABLE FREQUENCY DRIVE", "VFD", "VSD", "VARIABLE SPEED"],
  ["FAN COIL", "FAN COIL UNIT", "FCU"],
  ["AIR HANDLING UNIT", "AHU", "AIR HANDLER"],
  ["UNIT HEATER", "UH"],
  ["CABINET UNIT HEATER", "CUH"],
  ["ROOFTOP UNIT", "RTU", "ROOF TOP UNIT"],
  ["DEDICATED OUTDOOR AIR", "DOAS", "DOAU"],
  ["ENERGY RECOVERY", "ERV", "ERU"],
  ["FINNED TUBE", "FIN TUBE", "FTR", "FINTUBE"],
  ["DUCTLESS", "MINI SPLIT", "MINI-SPLIT", "DUCTLESS SPLIT"],
  ["LABORATORY", "LAB"],
  ["MINIMUM", "MIN"],
  ["MAXIMUM", "MAX"],
  ["RADIATION", "RADIATOR", "RADIATORS"],
];
const expand = (w: string): string[] => SYNONYMS.find((g) => g.includes(w)) ?? [w];

/** What a standard tag prefix says a unit is (common US HVAC equipment
 * abbreviations): part of what its row prints. */
export const PREFIX_WORDS: Record<string, string> = {
  EF: "EXHAUST FAN", SF: "SUPPLY FAN", RF: "RETURN FAN", REF: "RELIEF FAN", GEF: "GENERAL EXHAUST FAN", LEF: "LAB EXHAUST FAN",
  TEF: "TOILET EXHAUST FAN", KEF: "KITCHEN EXHAUST FAN", UH: "UNIT HEATER", CUH: "CABINET UNIT HEATER", EUH: "ELECTRIC UNIT HEATER",
  HWP: "HOT WATER PUMP", CWP: "CHILLED WATER PUMP", CHWP: "CHILLED WATER PUMP", HHWP: "HEATING HOT WATER PUMP", CP: "CONDENSATE PUMP",
  ERV: "ENERGY RECOVERY VENTILATOR", FCU: "FAN COIL UNIT", AHU: "AIR HANDLING UNIT", RTU: "ROOFTOP UNIT", VAV: "VARIABLE AIR VOLUME",
  FTR: "FINNED TUBE RADIATION", ACCU: "AIR COOLED CONDENSING UNIT", CU: "CONDENSING UNIT", DOAS: "DEDICATED OUTDOOR AIR",
};

/** Words that name no qualifier: the kind of device and generic nouns. */
const DEVICE_NOUNS = new Set(["UNIT", "UNITS", "BOX", "BOXES", "TERMINAL", "TERMINALS", "SYSTEM", "SYSTEMS", "EQUIPMENT", "TYPICAL", "TYP", "DEVICE", "DEVICES",
  // How many, not what kind: "DUAL HEAT EXCHANGER", "SINGLE AIR COOLED CHILLER".
  "SINGLE", "DUAL", "TWIN", "TWO", "DUPLEX", "TRIPLEX", "MULTIPLE", "PARALLEL", "EXISTING", "NEW", "W/", "WITH"]);

/** The text of a unit's own schedule row: its cells, its schedule's title,
 * its description. */
function rowText(u: RowUnit): string {
  // Its schedule's title, its cells and the notes its row cites: never the
  // column headers (they name what every row of the schedule is asked, not
  // what this unit is: "MAXIMUM AIR FLOW" confirms no "DUAL MAXIMUM" box).
  const prefix = tagKey(u.tag)?.prefix;
  return clean([u.table_title, ...Object.values(u.cells), ...Object.values(u.attributes ?? {}).map((a) => String(a?.value ?? "")), ...(u.notes ?? []).map((n) => n.text),
    ...(prefix && PREFIX_WORDS[prefix] ? [PREFIX_WORDS[prefix]] : [])].join(" | "));
}

/** What a unit is, as its schedule says it: the schedule's title and the
 * row's type or description cells (never a value such as a volume
 * control's "CV"). */
function typeText(u: Pick<RowUnit, "table_title" | "cells">): string {
  return clean([u.table_title, ...Object.entries(u.cells).filter(([h]) => /\b(?:TYPE|DESCRIPTION|UNIT\s+TYPE|EQUIPMENT)\b/i.test(h)).map(([, v]) => v)].join(" | "));
}

/** A subject in one spelling: synonyms and abbreviations read as their
 * group's first phrase, plurals as singular ("HHW SYSTEM" and "HEATING HOT
 * WATER SYSTEM" are one subject). */
function canonSubject(title: string): string[] {
  let t = ` ${subjectWords(title).join(" ")} `;
  for (const g of [...SYNONYMS].sort((a, b) => Math.max(...b.map((x) => x.length)) - Math.max(...a.map((x) => x.length)))) {
    for (const w of [...g].sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(` ${w.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&")}(?= )`, "g"), ` ${g[0].replace(/\s+/g, "_")}`);
  }
  return t.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/(?<=[A-Z]{3})S$/, "")).filter((w) => w !== "HEATING" || !t.includes("HYDRONIC"));
}

/** Whether a phrase (or one of its synonyms) is printed in a text, as whole
 * words. */
function printed(phrase: string, text: string): boolean {
  return expand(phrase).some((p) => new RegExp(`(?:^|[^A-Z0-9])${p.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&").replace(/\s+/g, "[\\s-]+")}S?(?:$|[^A-Z0-9])`).test(text));
}

/** Families that are a split system's outdoor half. */
const OUTDOOR_FAMILIES = new Set(["CONDENSING_UNIT", "HEAT_PUMP", "VRF_OUTDOOR"]);
/** A split system's name in a title ("DX SPLIT SYSTEM", "DUCTLESS SPLIT",
 * "MINI SPLIT"). */
const SPLIT = /\bSPLIT\b/;

/** Words in a title that say how the work is bought or how the unit is
 * switched, never what it is: a bid alternate ("BID ALTERNATE #2",
 * "ALTERNATE 3", "BASE BID"; CSI MasterFormat 01 23 00 Alternates) and
 * two-position control ("ON/OFF", "ON OFF"). */
const NOT_SUBJECT = /\b(?:(?:BID|ADD|DEDUCT)\s+)?ALTERNATES?\s*(?:NO\.?\s*|#\s*)?\d{1,2}[A-Z]?\b|\b(?:BID|ADD|DEDUCT)\s+ALTERNATES?\b|\bBASE\s+BID\b|\bON\s?[-\/]?\s?OFF\b|\bP\s?&\s?ID\b/g;

/** An abbreviation a title defines for its own words ("HEAT PUMP TERMINAL
 * UNIT (HP)": the letters are the initials of two or more words right
 * before them) adds nothing those words do not say. */
function withoutOwnAbbreviations(title: string): string {
  return title.replace(/\b((?:[A-Z][A-Z0-9]*\s+){0,5}[A-Z][A-Z0-9]*)\s*\(([A-Z]{2,6})\)/g, (all, before: string, abbr: string) =>
    (before.split(/\s+/).map((w) => w[0]).join("").includes(abbr) ? before : all));
}

/** The families a title names as two or more subjects joined by AND or "&"
 * ("FURNACE AND CONDENSING UNIT SEQUENCE OF OPERATION", "HEAT PUMP & FAN
 * COIL UNITS"), each part of one dash-separated segment naming its own
 * family; and, per family, the words of the other subjects. Empty when the
 * title names one subject ("FAN COIL UNIT (HEATING AND COOLING)": the part
 * after AND names no family). */
export function coSubjects(title: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const segment of repairSpacing(title).split(/\s+[-–—]\s+/)) {
    const parts = segment.split(/\s+AND\s+|\s*&\s*/).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const named = parts.map((x) => ({ x, family: subjectFamily(x) }));
    if (named.some((n) => !n.family) || new Set(named.map((n) => n.family)).size < 2) continue;
    for (const n of named) {
      const others = named.filter((o) => o.family !== n.family).flatMap((o) => subjectWords(o.x));
      out.set(n.family!, [...(out.get(n.family!) ?? []), ...others]);
    }
  }
  return out;
}

/** The title's qualifiers: its subject words that are neither the unit
 * family's own words (as its schedule's title prints them, in either
 * spacing, the family name, or a standard designator of the family: "ATU"
 * is a terminal unit's), nor a device noun, nor a tag, nor another subject
 * the title joins to the unit's by AND. Multi-word synonyms ("HOT WATER")
 * are read as one qualifier; "VAV/CAV" names either, and is no qualifier
 * of a unit whose family is one of them. */
function qualifiers(title: string, u: RowUnit): string[] {
  const others = new Set(coSubjects(title).get(u.family) ?? []);
  const words = subjectWords(withoutOwnAbbreviations(repairSpacing(title).replace(NOT_SUBJECT, " "))).map((w) => w.replace(/^[(]+|[)]+$/g, ""))
    .filter((w) => w && !/^(?:[A-Z]{1,6}-)?[A-Z]{1,6}-?\d/.test(w) && !DEVICE_NOUNS.has(w) && !others.has(w));
  const own = new Set([...clean(u.table_title).split(/[^A-Z0-9]+/), ...repairSpacing(u.table_title).split(/[^A-Z0-9]+/), ...u.family.split("_"),
    ...Object.entries(HOST_PREFIX).filter(([, f]) => f === u.family).map(([k]) => k)]);
  const phrases: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const two = `${words[i]} ${words[i + 1] ?? ""}`.trim();
    const three = `${two} ${words[i + 2] ?? ""}`.trim();
    const group = SYNONYMS.find((g) => g.includes(three)) ? three : SYNONYMS.find((g) => g.includes(two)) ? two : words[i];
    i += group.split(" ").length - 1;
    const parts = group.split(" ");
    if (parts.every((p) => own.has(p) || own.has(p.replace(/S$/, "")))) continue;
    if (expand(group).some((g) => g.split(" ").every((p) => own.has(p)))) continue;
    if (/^[A-Z0-9]+(?:\/[A-Z0-9]+)+$/.test(group) && group.split("/").some((a) => own.has(a))) continue;
    phrases.push(group);
  }
  return phrases;
}

/** Whether a qualifier is printed: "VAV/CAV" when either is. A number
 * ("BOILER 3 CONTROL") names a unit by its mark: only the unit's own mark
 * confirms it, never a digit its row prints elsewhere ("460/3/60"). */
const printedQualifier = (q: string, text: string, u?: Pick<RowUnit, "tag">) => {
  const n = q.match(/^(\d{1,4})([A-Z]{0,2})$/);
  if (n) { const k = u ? tagKey(u.tag) : null; return Boolean(k && k.n === Number(n[1]) && k.suffix === n[2]); }
  return (/^[A-Z0-9]+(?:\/[A-Z0-9]+)+$/.test(q) ? q.split("/") : [q]).some((a) => printed(a, text));
};

/** What a schedule's title says its units are, one spelling per meaning: no
 * scope note in parentheses ("(AHU 2)"), device noun, tag or number. */
function kindWords(tableTitle: string): string[] {
  return [...new Set(canonSubject(String(tableTitle ?? "").replace(/\([^)]*\)/g, " ")).filter((w) => !DEVICE_NOUNS.has(w) && !/\d/.test(w)))];
}

/** A special kind of a family the project schedules apart from its plain
 * kind ("SMOKE EXHAUST FAN SCHEDULE" beside "EXHAUST FAN SCHEDULE"; "LAB
 * EXHAUST FAN", "GATEHOUSE FAN"): the words the unit's schedule adds to the
 * plain one's, and the plain schedule's title. A detail titled for the plain
 * kind is the plain schedule's; for the special kind's units it is a
 * proposal unless its title names what they add. */
function scheduledApart(u: RowUnit, titles: ReadonlySet<string>): { words: string[]; plain: string } | null {
  const own = kindWords(u.table_title);
  for (const t of titles) {
    if (t === u.table_title) continue;
    const plain = kindWords(t);
    if (!plain.length || plain.length >= own.length || !plain.every((w) => own.includes(w))) continue;
    return { words: own.filter((w) => !plain.includes(w)), plain: t };
  }
  return null;
}

/** Whether a standard designator printed before a mark ("EF" in "EF-B1")
 * says the unit is what it is: the family its words name, or its schedule
 * prints them. Null when the letters are no standard designator (a building
 * or an area: "WHSE-AHU-1"). */
function designatorFits(q: string, u: RowUnit): boolean | null {
  const words = PREFIX_WORDS[q];
  if (!words) return null;
  return subjectFamily(words) === u.family || printed(words, typeText(u));
}

/** Whether a tag printed in a title is this unit's:
 *  - "yes": its mark, with no qualifier that says the unit is something else
 *    ("EF-B1" is not the furnace "B1"), and the only kind of unit the mark
 *    could be, or the one the title's subject names;
 *  - "proposal": a mark several kinds of unit share ("B1": an outdoor air
 *    unit, a furnace and its condensing unit), and the title names none of
 *    them (C5: readings through it are proposals only);
 *  - "no". */
function tagFit(k: TagKey, u: RowUnit, title: string, sharing: readonly RowUnit[]): "yes" | "proposal" | "no" {
  const could = (o: RowUnit) => {
    const ok = tagKey(o.tag);
    return Boolean(ok && sameTag(k, ok) && !(k.qualifier && !ok.qualifier && designatorFits(k.qualifier, o) === false));
  };
  if (!could(u)) return "no";
  const identity = (o: RowUnit) => `${tagKey(o.tag)?.qualifier ?? ""}|${o.family}`;
  const cands = sharing.filter(could);
  if (new Set(cands.map(identity)).size <= 1) return "yes";
  const family = subjectFamily(title);
  const named = cands.filter((o) => o.family === family || namesRow(title, o));
  if (!named.length) return "proposal";
  if (!named.includes(u)) return "no";
  return new Set(named.map(identity)).size === 1 ? "yes" : "proposal";
}

// ── What a unit carries ─────────────────────────────────────────────────────

/** Parts a unit may or may not carry, by which a detail's title names a
 * variant of its kind (ASHRAE Guideline 36 names VAV terminal units "cooling
 * only" and "with reheat"; fan coils and unit ventilators are drawn "with
 * electric heat"), and the schedule columns that describe each part. */
const PARTS: ReadonlyArray<{ has: RegExp; lacks: RegExp; header: RegExp }> = [
  { // heating: a reheat or heating coil, an electric heater
    has: /\b(?:WITH|W\/)\s+(?:(?:HOT\s+WATER|HW|HHW|HYDRONIC|ELECTRIC|ELEC\.?)\s+)?(?:RE-?HEAT(?:ING)?(?:\s+COILS?)?|HEATING(?:\s+COILS?)?|HEAT(?:ERS?)?|(?:HOT\s+WATER|HW|HHW)\s+COILS?)\b/,
    lacks: /\bCOOLING[\s-]+ONLY\b|\b(?:NO|WITHOUT|W\/O)\s+(?:RE-?HEAT|HEAT(?:ING)?)\b/,
    header: /\bRE-?HEAT|\bHEATING\s+COIL|\b(?:HOT\s+WATER|HW|HHW)\s+COIL|\bELEC(?:TRIC)?\.?\s+HEAT/,
  },
  { // cooling: a chilled water or DX coil
    has: /\b(?:WITH|W\/)\s+(?:(?:CHILLED\s+WATER|CHW|DX)\s+)?COOLING(?:\s+COILS?)?\b|\b(?:WITH|W\/)\s+(?:CHILLED\s+WATER|CHW|DX)\s+COILS?\b/,
    lacks: /\bHEATING[\s-]+ONLY\b|\b(?:NO|WITHOUT|W\/O)\s+COOLING\b/,
    header: /\bCOOLING\s+COIL|\b(?:CHILLED\s+WATER|CHW|DX)\s+COIL/,
  },
];
/** A cell that prints nothing for its column. */
const EMPTY_CELL = /^(?:|-+|—|–|N\/?A|NONE|0(?:\.0+)?)$/;

/** Whether a unit's row fills the columns its schedule gives a part: "has"
 * when it fills most of them, "lacks" when it fills at most a quarter while
 * another row of the schedule fills most (the part is real there), else
 * null. */
function carries(u: RowUnit, header: RegExp, peers: readonly RowUnit[]): "has" | "lacks" | null {
  const cols = Object.keys(u.cells).filter((h) => header.test(clean(h)));
  if (!cols.length) return null;
  const share = (x: RowUnit) => cols.filter((h) => !EMPTY_CELL.test(clean(x.cells[h]))).length / cols.length;
  const own = share(u);
  if (own > 0.5) return "has";
  return own <= 0.25 && peers.some((o) => o !== u && share(o) > 0.5) ? "lacks" : null;
}

/** The words of a title's variant ("HEATING COIL", "COOLING ONLY") that the
 * unit's row confirms; "contradicted" when the row says the unit is the
 * other variant. */
function partVariant(title: string, u: RowUnit, peers: readonly RowUnit[]): Set<string> | "contradicted" {
  const t = repairSpacing(title);
  const words = new Set<string>();
  for (const part of PARTS) {
    const has = part.has.exec(t), lacks = has ? null : part.lacks.exec(t);
    if (!has && !lacks) continue;
    const row = carries(u, part.header, peers);
    if (row === null) continue;
    if ((row === "has") !== Boolean(has)) return "contradicted";
    for (const w of subjectWords((has ?? lacks)![0])) words.add(w);
    if (lacks) for (const w of (lacks[0].match(/[A-Z]+/g) ?? [])) words.add(w);
  }
  return words;
}

/** The packets printed right under or over a packet in its column (a
 * detail's diagram over its sequence): the same sheet and reading frame,
 * overlapping across by half the narrower, at most three title heights
 * apart. */
function stackedWith(p: Packet, packets: readonly Packet[]): Packet[] {
  const rotOf = (x: Packet) => {
    const n = new Map<number, number>();
    for (const sp of x.spans) { const r = (((Math.round(Number(sp.rot ?? 0) / 90) * 90) % 360) + 360) % 360; n.set(r, (n.get(r) ?? 0) + 1); }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  };
  const rot = rotOf(p);
  const box = frameBox(p.region, rot), title = frameBox(p.title_box, rot);
  const h = Math.max(1, title[3] - title[1]);
  return packets.filter((q) => {
    if (q === p || q.sheet !== p.sheet || q.scope === "sheet" || rotOf(q) !== rot) return false;
    const b = frameBox(q.region, rot);
    const across = Math.min(box[2], b[2]) - Math.max(box[0], b[0]);
    if (across < 0.5 * Math.min(box[2] - box[0], b[2] - b[0])) return false;
    const gap = b[1] >= box[1] ? b[1] - box[3] : box[1] - b[3];
    return gap >= -0.5 * h && gap <= 3 * h;
  });
}

// ── Binding ─────────────────────────────────────────────────────────────────

export interface BindOptions {
  /** Each page's printed sheet number (for "SEE M6.5" in a row's notes). */
  sheetNumbers?: Readonly<Record<string, string>>;
  /** Units whose own row puts them outside the BAS (the row reader:
   * "STANDALONE", "NOT CONTROLLED BY DDC", "NOT USED"): a title or a tag
   * still binds them, as evidence, but nothing weaker does. */
  standalone?: ReadonlySet<number>;
}

const SHEET_REF = /\b(?:SEE|REFER\s+TO|PER|ON)\s+(?:SHEETS?\s+|DWG\.?\s+|DRAWINGS?\s+)?([A-Z]{1,3}\s?[-.]?\s?\d{1,3}(?:[.-]\d{1,3}){0,2}[A-Z]?)\b/g;
/** A designator a title ends in, or prints in parentheses ("FAN-A"): short,
 * letters with a dash, no number a tag would carry. */
const DESIGNATOR = /^[A-Z]{1,6}-[A-Z]{1,2}$|^[A-Z]{1,4}-\d{1,2}[A-Z]$|^TYPE\s?[A-Z0-9]{1,2}$/;

function designators(title: string): string[] {
  const parts = repairSpacing(title).split(/\s+[-–—]\s+|[()]/).map((p) => p.trim()).filter(Boolean);
  return parts.filter((p) => DESIGNATOR.test(p)).map(compact);
}

/** Subjects are the same when one's subject words are all the other's. */
function sameSubject(a: string, b: string): boolean {
  const sa = canonSubject(a), sb = canonSubject(b);
  return sa.length > 0 && sb.length > 0 && (sa.every((w) => sb.includes(w)) || sb.every((w) => sa.includes(w)));
}

/** Subjects that are the same, word for word once spelled one way ("HEAT
 * RELIEF FAN" is not "HEAT RELIEF FAN W/ LOUVER"). */
function equalSubject(a: string, b: string): boolean {
  const sa = [...new Set(canonSubject(a))].sort().join(" "), sb = [...new Set(canonSubject(b))].sort().join(" ");
  return sa.length > 0 && sa === sb;
}

/** A tag printed as a label: a span that is the tag and little else (a
 * tag symbol's letters and number count too), not a tag inside a sentence
 * (a sentence naming another unit is a reference, not a binding). */
function labelTags(p: Packet): TagKey[] {
  return bodyTags(p, 4);
}

/** The units a packet's own label lists ("EXHAUST FAN (EF-1, 2, 3, 4, &
 * 5)" over a diagram; "TYP. FANS EF-A1, / EF-A3, & SEF-A3" over two lines):
 * a printed line that is no sentence and names two or more scheduled tags,
 * lists and ranges expanded; a line ending in a list's joiner continues on
 * the line right under it. "TYP." on a list is typical for the units it
 * lists; a label that says "ALL" speaks for more than it lists. */
function labelLists(p: Packet, scheduled: readonly TagKey[]): Array<{ line: string; keys: TagKey[]; all: boolean }> {
  const out: Array<{ line: string; keys: TagKey[]; all: boolean }> = [];
  const lines = pageLines(p.spans);
  for (let i = 0; i < lines.length; i++) {
    let line = repairSpacing(lines[i].text);
    let last = lines[i];
    // A list that runs on: the next line starts right under this one.
    while (/(?:[,&]|\bAND|\bTHRU)$/.test(line) && i + 1 < lines.length) {
      const next = lines[i + 1];
      const gap = next.box[1] - last.box[3];
      if (next.rot !== last.rot || gap < -0.5 * last.h || gap > 1.2 * last.h || next.box[0] > last.box[2] || next.box[2] < last.box[0]) break;
      line = `${line} ${repairSpacing(next.text)}`;
      last = next;
      i++;
    }
    if (line.split(" ").length > 16 || SENTENCE.test(line)) continue;
    const keys = titleTags(line, scheduled).map((x) => x.key);
    if (keys.length >= 2) out.push({ line, keys, all: /\bALL\b/.test(line) });
  }
  return out;
}

/** A packet's printed lines, left to right (spans on one baseline joined). */
function groupLines(p: Packet): string[] {
  const rows: Array<{ y: number; h: number; parts: Array<{ x: number; s: string }> }> = [];
  for (const s of p.spans) {
    if ((s.rot ?? 0) !== 0) continue;
    const y = (s.y0 + s.y1) / 2, h = s.y1 - s.y0;
    const row = rows.find((r) => Math.abs(r.y - y) <= 0.35 * Math.min(r.h, h));
    if (row) row.parts.push({ x: s.x0, s: s.str }); else rows.push({ y, h, parts: [{ x: s.x0, s: s.str }] });
  }
  return rows.sort((a, b) => a.y - b.y).map((r) => r.parts.sort((a, b) => a.x - b.x).map((x) => x.s).join(" "));
}

/** Every unit's bindings (unit index → bindings, strongest first). */
export function bindPackets(packets: readonly Packet[], units: readonly RowUnit[], opts: BindOptions = {}): Map<number, Binding[]> {
  const out = new Map<number, Binding[]>();
  const scheduled = units.map((u) => tagKey(u.tag)).filter((k): k is TagKey => Boolean(k));
  // A title's subtitle ("(EF-1, EF-2, & EF-3)") is part of the title.
  const titled = packets.map((p) => ({ p, tags: titleTags(`${p.title} ${p.subtitle ?? ""}`, scheduled), family: subjectFamily(p.title), families: [...coSubjects(p.title).keys()], designators: designators(p.title) }));
  const bodies = new Map(packets.map((p) => [p.id, bodyTags(p)]));
  const labels = new Map(packets.map((p) => [p.id, labelTags(p)]));
  const lists = new Map(packets.map((p) => [p.id, labelLists(p, scheduled)]));
  const sheetByNumber = new Map<string, string[]>();
  for (const [sheet, no] of Object.entries(opts.sheetNumbers ?? {})) (sheetByNumber.get(compact(no)) ?? sheetByNumber.set(compact(no), []).get(compact(no))!).push(sheet);
  const byId = new Map(packets.map((p) => [p.id, p]));
  const kindOf = (b: Binding) => byId.get(b.packet)!.kind;

  // Split systems: an indoor unit whose row names its outdoor unit ("SYSTEM:
  // CU-1") is one half of a split system, and that outdoor unit the other.
  const bySchedule = new Map<string, RowUnit[]>();
  for (const u of units) { const k = `${u.cite?.sheet}|${u.table_title}`; (bySchedule.get(k) ?? bySchedule.set(k, []).get(k)!).push(u); }
  const familyTitles = new Map<string, Set<string>>();
  for (const u of units) (familyTitles.get(u.family) ?? familyTitles.set(u.family, new Set()).get(u.family)!).add(u.table_title);
  const byTag = new Map<string, RowUnit[]>();
  for (const u of units) { const k = tagKey(u.tag); if (k) (byTag.get(keyString(k)) ?? byTag.set(keyString(k), []).get(keyString(k))!).push(u); }
  const namedUnits = (v: string) => [...clean(v).matchAll(/(?<![A-Z0-9-])(?:[A-Z]{1,6}-)?[A-Z]{1,6}\s?-\s?\d{1,4}[A-Z]{0,2}(?![A-Z0-9])/g)]
    .map((m) => tagKey(m[0].replace(/\s+/g, ""))).filter((k): k is TagKey => Boolean(k))
    .flatMap((k) => (byTag.get(keyString(k)) ?? []).filter((o) => { const ok = tagKey(o.tag); return Boolean(ok && sameTag(k, ok)); }));
  /** How a tag printed in a title fits a unit (tagFit), among the units of
   * its mark. */
  const fitOf = (k: TagKey, u: RowUnit, title: string) => tagFit(k, u, title, byTag.get(keyString(k)) ?? []);
  // Or both halves are printed in one row of one schedule ("AC-1 / ACCU-1").
  const rowKey = (u: RowUnit) => `${u.cite?.sheet}|${u.table_title}|${JSON.stringify(u.cells)}`;
  const outdoorOf = new Map<number, RowUnit>();
  for (const u of units) {
    if (OUTDOOR_FAMILIES.has(u.family)) continue;
    const outs = new Set(Object.values(u.cells).flatMap(namedUnits).filter((o) => OUTDOOR_FAMILIES.has(o.family)));
    for (const o of units) if (o !== u && OUTDOOR_FAMILIES.has(o.family) && rowKey(o) === rowKey(u) && Object.keys(u.cells).length) outs.add(o);
    if (outs.size === 1) outdoorOf.set(u.index, [...outs][0]);
  }

  const direct = new Map<number, Binding[]>();
  for (const u of units) {
    const key = tagKey(u.tag);
    const found: Binding[] = [];
    const add = (b: Binding) => { if (!found.some((f) => f.packet === b.packet)) found.push(b); };
    const text = rowText(u);
    // Title tags, lists and ranges. A mark other kinds of unit share binds
    // as a proposal unless the title's subject says which unit it is.
    let namedByTitle = false;
    for (const t of titled) {
      if (!key) break;
      const fits = t.tags.map((x) => ({ x, fit: fitOf(x.key, u, t.p.title) })).filter((f) => f.fit !== "no");
      const best = fits.find((f) => f.fit === "yes") ?? fits[0];
      if (!best) continue;
      const { x, fit } = best;
      if (fit === "yes") namedByTitle = true;
      add({
        packet: t.p.id, kind: x.how,
        evidence: `${t.p.scope === "sheet" ? "the sheet's title" : "its title"} "${t.p.title}${t.p.subtitle ? ` ${t.p.subtitle}` : ""}" names ${u.tag}${x.how === "list_range" ? " in a list or range" : ""}${fit === "proposal" ? `; other kinds of unit are marked ${keyString(x.key)} too, and the title names none of them` : ""}`,
        ...(fit === "proposal" ? { proposal: true as const, ambiguous: true as const } : {}),
      });
    }
    // Cross-references: a cell equal to a title's designator.
    for (const t of titled) {
      if (!t.designators.length || t.p.scope === "sheet") continue;
      for (const [h, v] of Object.entries(u.cells)) {
        const cv = compact(v);
        if (cv && t.designators.includes(cv)) add({ packet: t.p.id, kind: "cross_reference", evidence: `its ${h} "${clean(v)}" is the designator of "${t.p.title}"` });
      }
    }
    //   A note or remark naming a sheet: that sheet's packets of the unit's kind.
    const refs = new Set<string>();
    for (const x of [...(u.notes ?? []).map((n) => n.text), ...Object.values(u.cells)]) for (const m of clean(x).matchAll(SHEET_REF)) refs.add(compact(m[1]));
    for (const ref of refs) {
      for (const sheet of sheetByNumber.get(ref) ?? []) {
        for (const t of titled) {
          if (t.p.sheet !== sheet || t.p.scope === "sheet") continue;
          if (t.family === u.family || (t.family === null && namesRow(t.p.title, u))) {
            add({ packet: t.p.id, kind: "cross_reference", evidence: `its schedule note or remark refers to sheet ${ref}, where "${t.p.title}" is its kind` });
          }
        }
      }
    }
    // Tags printed inside a packet, when no title names the unit: as a label
    // anywhere, or in the text of a packet about its family or about no one
    // family (a system).
    if (key && !namedByTitle) {
      for (const t of titled) {
        if (t.p.scope === "sheet") continue;
        const asLabel = (labels.get(t.p.id) ?? []).some((k) => sameTag(k, key));
        const inText = (t.family === null || t.family === u.family) && (bodies.get(t.p.id) ?? []).some((k) => sameTag(k, key));
        // A list in a detail about the unit's own family names its units; in
        // a system's detail (an emergency shutdown) it names what the system
        // acts on.
        const listed = t.family === u.family
          ? (lists.get(t.p.id) ?? []).find((x) => x.keys.some((k) => sameTag(k, key) && fitOf(k, u, x.line) === "yes")) : undefined;
        // A detail's own label that lists its units ("EXHAUST FAN (EF-1, 2,
        // 3, 4, & 5)") says whose it is, as a title list does.
        if (listed) add({ packet: t.p.id, kind: "label_list", evidence: `"${t.p.title}" is labelled for ${u.tag} in the list "${listed.line}"` });
        else if (asLabel || inText) add({ packet: t.p.id, kind: "tag_body", evidence: `${u.tag} is printed inside "${t.p.title}"${asLabel ? " as a label" : ""}` });
      }
    }
    direct.set(u.index, found);
  }

  // A points schedule grouped by detail ("1. EF-1,2,3" over the rows of the
  // fans in detail 1 on the same sheet): each unit a group names binds to
  // that detail, and to the schedule.
  for (const pts of packets.filter((p) => p.kind === "points" && p.scope !== "sheet")) {
    const details = packets.filter((d) => d.sheet === pts.sheet && d.detail_number && d.id !== pts.id);
    if (!details.length) continue;
    for (const line of groupLines(pts)) {
      const m = line.match(/^\s*(\d{1,2})\.\s+(.+)$/);
      if (!m) continue;
      const detail = details.filter((d) => d.detail_number === m[1]);
      if (detail.length !== 1) continue;
      for (const { key } of titleTags(m[2], scheduled)) {
        for (const u of byTag.get(keyString(key)) ?? []) {
          const fit = fitOf(key, u, `${pts.title} ${m[2]}`);
          if (fit === "no") continue;
          const doubt = fit === "proposal" ? { proposal: true as const, ambiguous: true as const } : {};
          const list = direct.get(u.index) ?? [];
          if (!list.some((b) => b.packet === detail[0].id)) list.push({ packet: detail[0].id, kind: "cross_reference", evidence: `the points schedule "${pts.title}" lists ${u.tag} under "${clean(line)}", detail ${m[1]} on its sheet`, ...doubt });
          if (!list.some((b) => b.packet === pts.id)) list.push({ packet: pts.id, kind: "cross_reference", evidence: `the points schedule "${pts.title}" lists ${u.tag} under "${clean(line)}"`, ...doubt });
          direct.set(u.index, list);
        }
      }
    }
  }

  // Explicit selections: packets some rows of a schedule reach by a cross-
  // reference are those rows' (the schedule chose them); its other rows are
  // not bound to them by family.
  const chosenBy = new Map<string, Set<string>>();
  for (const u of units) for (const b of direct.get(u.index) ?? []) {
    if (b.kind !== "cross_reference") continue;
    const k = `${u.cite?.sheet}|${u.table_title}`;
    (chosenBy.get(k) ?? chosenBy.set(k, new Set()).get(k)!).add(b.packet);
  }

  for (const u of units) {
    const found = [...(direct.get(u.index) ?? [])];
    if (opts.standalone?.has(u.index)) { out.set(u.index, found); continue; }
    const add = (b: Binding) => { if (!found.some((f) => f.packet === b.packet)) found.push(b); };
    const text = rowText(u);
    // Siblings: same subject on the same sheet as a packet already bound.
    for (const b of [...found]) {
      const bp = byId.get(b.packet)!;
      if (bp.scope === "sheet") continue;
      for (const p of packets) {
        if (p === bp || p.sheet !== bp.sheet || p.scope === "sheet" || p.kind === bp.kind) continue;
        // A sibling of a proposal is one too.
        if (equalSubject(p.title, bp.title)) add({ packet: p.id, kind: "sibling", evidence: `"${p.title}" is about the same subject as "${bp.title}" on the same sheet`, ...(b.proposal ? { proposal: true as const } : {}) });
      }
    }
    // The sheet a title naming the unit is printed on, when the sheet's own
    // title is about the unit's family and names no tag, and every tag a
    // title on the sheet names is one that title names: the whole sheet is
    // the unit's ("AHU - 1 SEQUENCE OF OPERATIONS" heading columns of text
    // on "AIR HANDLING UNIT SEQUENCE OF OPERATIONS").
    for (const b of [...found]) {
      const bp = byId.get(b.packet)!;
      if (RANK[b.kind] > 1 || b.proposal || bp.scope === "sheet") continue;
      const sheet = titled.find((t) => t.p.sheet === bp.sheet && t.p.scope === "sheet");
      if (!sheet || sheet.tags.length || sheet.family !== u.family) continue;
      const own = new Set(titled.find((t) => t.p === bp)!.tags.map((x) => keyString(x.key)));
      if (titled.some((t) => t.p.sheet === bp.sheet && t.tags.some((x) => !own.has(keyString(x.key))))) continue;
      add({ packet: sheet.p.id, kind: "sibling", evidence: `the sheet "${sheet.p.title}" is about its family, and "${bp.title}" names the only units a title on it names` });
    }
    // Family details, per packet kind, where no title binds the unit to a
    // packet of that kind. The title names the unit's family, or its subject
    // is what the unit's own schedule prints; a packet another row of the
    // same schedule chose by reference is that row's.
    // A title, a sibling, or the unit's tag inside a packet about its own
    // family binds more specifically than any family detail of that kind (a
    // tag in another system's diagram, an emergency shutdown say, does not).
    // A proposal (a mark other kinds of unit share) binds nothing more
    // specifically.
    const titleKinds = new Set(found.filter((b) => !b.proposal && (RANK[b.kind] <= 2 || b.kind === "sibling"
      || ((b.kind === "tag_body" || b.kind === "label_list") && titled.find((t) => t.p.id === b.packet)?.family === u.family))).map(kindOf));
    // A unit a title names (its tag, its list, a cross-reference) has its own
    // packets: no family detail of any kind is added to them (their sequence
    // or schematic of the same subject comes in as a sibling).
    const named = found.some((b) => RANK[b.kind] <= 2 && !b.proposal);
    const chosen = chosenBy.get(`${u.cite?.sheet}|${u.table_title}`);
    const paired = outdoorOf.has(u.index);
    // A detail shown for one unit of the family ("… CONTROL SCHEMATIC (EH-5)")
    // is typical for the others when their schedule sends them to the
    // control drawings ("SEE CONTROL DRAWINGS FOR SEQUENCE OF OPERATION").
    const sentToControls = [...(u.notes ?? []).map((n) => n.text), ...Object.values(u.cells)].some((x) => CONTROLS_REF.test(clean(x)));
    const typicalFor = (t: typeof titled[number]) => sentToControls && t.tags.length > 0
      && t.tags.every((x) => (byTag.get(keyString(x.key)) ?? []).some((o) => o.family === u.family && o !== u && fitOf(x.key, o, t.p.title) === "yes"));
    // A detail whose own label lists units of the family ("EXHAUST FAN
    // (EF-1, 2, 3, 4, & 5)") is theirs: another unit of the family does not
    // take it by family.
    const listsOthers = (t: typeof titled[number]) => {
      const own = tagKey(u.tag);
      const listed = lists.get(t.p.id) ?? [];
      if (listed.some((x) => x.all) || listed.some((x) => own && x.keys.some((k) => sameTag(k, own)))) return false;
      return listed.some((x) => x.keys.filter((k) => (byTag.get(keyString(k)) ?? []).some((o) => o.family === u.family && fitOf(k, o, x.line) === "yes")).length >= 2);
    };
    const familyCands = named ? [] : titled.filter((t) => t.p.scope !== "sheet" && !titleKinds.has(t.p.kind) && (t.tags.length === 0 || typicalFor(t)) && !listsOthers(t)
      && !(chosen?.has(t.p.id) && !found.some((b) => b.packet === t.p.id))
      && (t.family === u.family || t.families.includes(u.family) || (t.family === null && namesRow(t.p.title, u, typeText(u), paired && SPLIT.test(repairSpacing(t.p.title))))));
    const byKind = new Map<string, Array<{ t: typeof titled[number]; unconfirmed: string[]; apart: string[]; subject: boolean; qualified: number }>>();
    const peers = bySchedule.get(`${u.cite?.sheet}|${u.table_title}`) ?? [u];
    const special = scheduledApart(u, familyTitles.get(u.family) ?? new Set());
    for (const t of familyCands) {
      const split = paired && SPLIT.test(repairSpacing(t.p.title));
      const quals = qualifiers(t.p.title, u);
      // A variant the title names by a part ("WITH HEATING COIL", "COOLING
      // ONLY"): the row's columns for that part confirm it, or say the unit
      // is the other variant.
      const variant = partVariant(t.p.title, u, peers);
      if (variant === "contradicted") continue;
      const unconfirmed = quals.filter((q) => !printedQualifier(q, text, u) && !(split && q === "SPLIT") && !q.split(" ").every((w) => variant.has(w)));
      const named = canonSubject(t.p.title);
      const apart = (special?.words ?? []).filter((w) => !named.includes(w));
      (byKind.get(t.p.kind) ?? byKind.set(t.p.kind, []).get(t.p.kind)!).push({ t, unconfirmed: [...unconfirmed, ...apart], apart, subject: namesRow(t.p.title, u, typeText(u), split), qualified: quals.length - unconfirmed.length });
    }
    // Several details of one kind are left: the one printed right under or
    // over a detail that is the unit's is its, when each other one is printed
    // with a detail that is not.
    const several: Array<Array<{ t: typeof titled[number]; unconfirmed: string[] }>> = [];
    for (const cands of byKind.values()) {
      // Strongest first: the row prints the title's whole subject, then every
      // qualifier confirmed, then the rest (proposals). Of confirmed titles,
      // the most specific wins: the one whose confirmed qualifiers are most
      // ("DX SPLIT SYSTEM" over "FAN COIL UNIT" for a DX fan coil paired with
      // its condensing unit).
      const bySubject = cands.filter((c) => c.subject && !c.unconfirmed.length);
      const confirmed = cands.filter((c) => !c.unconfirmed.length);
      let pick = bySubject.length ? bySubject : confirmed.length ? confirmed : cands;
      if (pick !== cands) {
        const most = Math.max(...pick.map((c) => c.qualified));
        pick = pick.filter((c) => c.qualified === most);
      }
      if (pick.length > 1 && pick.every((c) => !c.unconfirmed.length)) { several.push(pick); continue; }
      for (const c of pick) {
        add({
          packet: c.t.p.id, kind: "family_detail",
          evidence: `"${c.t.p.title}" is a detail for ${c.t.family === u.family ? `its family (${u.family})` : "what its schedule names"}${c.unconfirmed.some((q) => !c.apart.includes(q)) ? `; its row does not print ${c.unconfirmed.filter((q) => !c.apart.includes(q)).map((q) => `"${q}"`).join(", ")}` : ""}${c.apart.length ? `; the project schedules "${u.table_title}" apart from "${special!.plain}", and the title does not name ${c.apart.map((w) => `"${w.replace(/_/g, " ")}"`).join(", ")}` : ""}`,
          ...(c.unconfirmed.length ? { proposal: true as const } : {}),
          ...(pick.length > 1 ? { ambiguous: true as const } : {}),
        });
      }
    }
    for (const pick of several) {
      const mine = new Set(found.filter((b) => !b.proposal && !b.ambiguous).map((b) => b.packet));
      const partners = pick.map((c) => stackedWith(c.t.p, packets).filter((q) => q.kind !== c.t.p.kind));
      const ours = pick.filter((_, i) => partners[i].some((q) => mine.has(q.id)));
      const theirs = pick.filter((_, i) => partners[i].length > 0 && !partners[i].some((q) => mine.has(q.id)));
      if (ours.length === 1 && ours.length + theirs.length === pick.length) {
        const c = ours[0];
        const with_ = partners[pick.indexOf(c)].find((q) => mine.has(q.id))!;
        add({ packet: c.t.p.id, kind: "family_detail", evidence: `"${c.t.p.title}" is a detail for its family (${u.family}), printed with "${with_.title}", which is its; each other one of that title is printed with a detail that is not its` });
        continue;
      }
      for (const c of pick) {
        add({ packet: c.t.p.id, kind: "family_detail", evidence: `"${c.t.p.title}" is a detail for ${c.t.family === u.family ? `its family (${u.family})` : "what its schedule names"}`, ambiguous: true });
      }
    }
    // A drive's detail ("VARIABLE FREQUENCY DRIVE CONTROL"): a unit whose
    // row prints a VFD and that no detail of its own names takes it.
    if (!found.some((b) => RANK[b.kind] <= 2) && printsDrive(u.cells)) {
      // A drive detail for other equipment ("SUPPLY FAN VFD CONTROL") is not
      // this unit's unless its row prints what the title names.
      const driveWords = new Set(["VARIABLE", "FREQUENCY", "DRIVE", "DRIVES", "VFD", "VFDS", "VSD", "SPEED"]);
      const drives = titled.filter((t) => t.p.scope !== "sheet" && t.family === "VARIABLE_FREQUENCY_DRIVE" && t.tags.length === 0
        && subjectWords(t.p.title).filter((w) => !driveWords.has(w) && !DEVICE_NOUNS.has(w)).every((w) => printed(w, text)));
      for (const t of drives) add({ packet: t.p.id, kind: "family_detail", evidence: `its row prints a VFD, and "${t.p.title}" is the drives' detail`, ...(drives.length > 1 ? { ambiguous: true as const } : {}) });
    }
    // The sheet by family, only when nothing else binds the unit.
    if (!found.length) {
      const sheets = titled.filter((t) => t.p.scope === "sheet" && t.tags.length === 0 && t.family === u.family);
      for (const t of sheets) add({ packet: t.p.id, kind: "family_detail", evidence: `the sheet "${t.p.title}" is about its family (${u.family})`, ...(sheets.length > 1 ? { ambiguous: true as const } : {}) });
    }
    out.set(u.index, found);
  }

  // Components: a unit with no packet of its own whose row puts it in
  // another scheduled unit ("LOCATION: WHSE-AHU-1"), or names that unit as
  // what it serves ("SERVICE: AHU-1") while its location names no other
  // equipment (a reheat coil "SERVICE: AHU-1, LOCATION: TU01" is the
  // terminal unit's), takes that unit's packets; so does a split system's
  // outdoor unit, its indoor unit's.
  // An outdoor unit serving two indoor units belongs to neither alone.
  const indoorOf = new Map<number, RowUnit | null>();
  for (const [i, o] of outdoorOf) {
    const indoor = units.find((x) => x.index === i)!;
    indoorOf.set(o.index, indoorOf.has(o.index) && indoorOf.get(o.index) !== indoor ? null : indoor);
  }
  for (const u of units) {
    if ((out.get(u.index) ?? []).some((b) => !b.proposal) || opts.standalone?.has(u.index)) continue;
    const at = (re: RegExp) => new Set(Object.entries(u.cells).filter(([h]) => re.test(h)).flatMap(([, v]) => namedUnits(v)).filter((o) => o !== u));
    const inside = at(LOCATION_HEADER);
    const serves = at(OWNER_HEADER);
    const elsewhere = Object.entries(u.cells).some(([h, v]) => LOCATION_HEADER.test(h) && /\b(?:TU|VAV|FCU|AHU|RTU|CUH|UH)[-\s]?\d/i.test(String(v)) && !namedUnits(v).length);
    const indoor = indoorOf.get(u.index) ?? undefined;
    const owners = inside.size ? inside : !elsewhere && serves.size ? serves : indoor ? new Set([indoor]) : new Set<RowUnit>();
    if (owners.size !== 1) {
      // Located in equipment the set does not schedule ("LOCATION: 1-1-TU01",
      // a terminal unit): that kind of equipment's detail, when the set prints
      // exactly one of each kind.
      const host = hostFamilyOf(u, byTag);
      if (!host || owners.size) continue;
      const byKind = new Map<string, typeof titled>();
      for (const t of titled) if (t.p.scope !== "sheet" && t.tags.length === 0 && t.family === host.family) (byKind.get(t.p.kind) ?? byKind.set(t.p.kind, []).get(t.p.kind)!).push(t);
      const picks = [...byKind.values()].filter((list) => list.length === 1).map((list) => list[0]);
      if (picks.length) out.set(u.index, picks.map((t) => ({ packet: t.p.id, kind: "component_of" as BindingKind, evidence: `its location "${host.loc}" is a ${host.family === "VAV" ? "terminal unit" : host.family} the set does not schedule; "${t.p.title}" is that equipment's detail` })));
      continue;
    }
    const [owner] = owners;
    const inherited = (out.get(owner.index) ?? []).filter((b) => !b.proposal && b.kind !== "component_of");
    if (!inherited.length) continue;
    out.set(u.index, inherited.map((b) => ({ packet: b.packet, kind: "component_of" as BindingKind, evidence: `its row ${inside.size ? "puts it in" : indoor === owner ? "is the outdoor unit of" : "names as what it serves"} ${owner.tag}, whose packet it is (${b.kind}: ${b.evidence})`, ...(b.ambiguous ? { ambiguous: true as const } : {}) })));
  }

  // A hydronic plant's drawings: its equipment, where no packet of the kind
  // binds the unit already. A title that lists its units is theirs.
  const plant = titled.filter((t) => t.p.scope !== "sheet" && t.tags.length === 0).map((t) => ({ t, systems: titleSystems(t.p.title) })).filter((x) => x.systems.size);
  if (plant.length) {
    for (const u of units) {
      if (!tagKey(u.tag) || opts.standalone?.has(u.index)) continue;
      const found = out.get(u.index) ?? [];
      if (found.some((b) => b.kind === "component_of")) continue;
      const member = plantMember(u);
      if (!member) continue;
      const bound = new Set(found.filter((b) => !b.proposal).map(kindOf));
      const byKind = new Map<string, typeof plant>();
      for (const x of plant) if (x.systems.has(member.system) && !bound.has(x.t.p.kind) && !found.some((b) => b.packet === x.t.p.id)) (byKind.get(x.t.p.kind) ?? byKind.set(x.t.p.kind, []).get(x.t.p.kind)!).push(x);
      for (const list of byKind.values()) {
        for (const { t } of list) found.push({ packet: t.p.id, kind: "system", evidence: `"${t.p.title}" is the ${SYSTEM_NAME[member.system]} plant's drawing, and ${member.why}`, ...(list.length > 1 ? { ambiguous: true as const } : {}) });
      }
      if (found.length) out.set(u.index, found);
    }
  }

  for (const [k, found] of out) {
    if (!found.length) { out.delete(k); continue; }
    found.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
  }
  return out;
}

/** A hydronic plant, as a title or a row names it. */
type PlantSystem = "chilled_water" | "heating_water" | "condenser_water";
const SYSTEM_NAME: Record<PlantSystem, string> = { chilled_water: "chilled water", heating_water: "heating water", condenser_water: "condenser water" };

/** Words a title about a hydronic plant, and nothing else, is made of. */
const PLANT_WORDS = new Set(["CHILLED", "CHILLER", "CHW", "HOT", "HEATING", "HW", "HHW", "CONDENSER", "WATER", "PLANT", "PLANTS", "LOOP", "LOOPS", "PRIMARY", "SECONDARY", "AND", "&"]);

/** The hydronic plants a title is about, when its subject is a plant and not
 * a unit or a part: "CHILLED WATER SYSTEM SEQUENCE OF OPERATION", "HEATING
 * HOT WATER PLANT POINTS LIST", "HOT WATER DDC CONTROL DIAGRAM", "CHILLER
 * AND HOT WATER PLANTS CONTROLS SCHEMATIC". None for "CHILLED WATER PUMP
 * SEQUENCE" (a pump's), "DOMESTIC HOT WATER …" or "… HOT WATER COIL
 * CONNECTION DIAGRAM". */
export function titleSystems(title: string): Set<PlantSystem> {
  const out = new Set<PlantSystem>();
  if (subjectFamily(title) !== null) return out;
  const words = subjectWords(title).flatMap((w) => w.split("/")).filter((w) => w && !/\d/.test(w));
  if (!words.length || words.some((w) => !PLANT_WORDS.has(w))) return out;
  if (words.some((w) => w === "CHILLED" || w === "CHILLER" || w === "CHW")) out.add("chilled_water");
  if (words.some((w) => w === "HOT" || w === "HEATING" || w === "HW" || w === "HHW")) out.add("heating_water");
  if (words.includes("CONDENSER")) out.add("condenser_water");
  return out;
}

/** Plant equipment by kind: a chiller is the chilled water plant's, a boiler
 * the heating water plant's, a cooling tower the condenser water plant's. */
const PLANT_FAMILY: Record<string, PlantSystem> = { AIR_COOLED_CHILLER: "chilled_water", HEAT_RECOVERY_CHILLER: "chilled_water", BOILER: "heating_water", COOLING_TOWER: "condenser_water" };
/** Columns that say what a pump or an exchanger serves. */
const SERVICE_HEADER = /\b(?:SERVICE|SEVICE|SYSTEM|FUNCTION|FLUID|APPLICATION)\b/i;
/** What a service says, per plant (standard piping abbreviations: CHWS,
 * CHS, HWS, HHWR, CWS). */
const SERVES: Record<PlantSystem, RegExp> = {
  chilled_water: /\bCHILLED\b|\b[PS]?CHW[SR]?\b|\b[PS]?CH[SR]\b/,
  heating_water: /\bHEATING\b|\bHOT\s+WATER\b|\b[PS]?HH?W[SR]?\b|\bBOILERS?\b/,
  condenser_water: /\bCONDENSER\b|\bCW[SR]\b/,
};
/** A service that is not a plant's: domestic water, a unit's own coil or
 * equipment ("HEATING HOT WATER - AHU COIL"), heat recovery. */
const NOT_PLANT_SERVICE = /\bDOMESTIC\b|\bDHW\b|\bPOTABLE\b|\bCOILS?\b|\bHEAT\s+RECOVERY\b|\b[A-Z]{1,6}\s?-\s?\d/;

/** The hydronic plant a scheduled unit is part of, and why: its kind, or
 * for a pump or an exchanger the one plant its service or schedule names. */
function plantMember(u: RowUnit): { system: PlantSystem; why: string } | null {
  const byFamily = PLANT_FAMILY[u.family];
  if (byFamily) {
    // A steam boiler is no heating water plant's.
    if (byFamily === "heating_water" && /\bSTEAM\b/.test(clean(u.table_title)) && !/\bWATER\b/.test(clean(u.table_title))) return null;
    return { system: byFamily, why: `it is ${u.family === "BOILER" ? "a boiler" : u.family === "COOLING_TOWER" ? "a cooling tower" : "a chiller"}` };
  }
  if (u.family !== "PUMP" && u.family !== "HEAT_EXCHANGER") return null;
  const said = [...Object.entries(u.cells).filter(([h]) => SERVICE_HEADER.test(h)).map(([h, v]) => ({ where: `its ${clean(h)} is`, text: clean(v) })), { where: "its schedule is", text: clean(u.table_title) }].filter((x) => x.text);
  const hits = said.flatMap((x) => (Object.keys(SERVES) as PlantSystem[]).filter((sys) => SERVES[sys].test(x.text)).map((sys) => ({ sys, x })));
  const systems = new Set(hits.map((h) => h.sys));
  if (systems.size !== 1 || said.some((x) => NOT_PLANT_SERVICE.test(x.text))) return null;
  const [h] = hits;
  return { system: h.sys, why: `${h.x.where} "${h.x.text}"` };
}

/** Whether a unit's schedule (its title and type columns) prints the whole
 * subject of a title that names no family, a split system's SPLIT aside:
 * what makes such a detail a family detail of the unit (readers/r0.ts
 * aboutOthers checks the binder's claim with it). */
export function scheduleNamesSubject(title: string, row: Pick<RowUnit, "table_title" | "cells">): boolean {
  return namesRow(title, row, typeText(row), true);
}

/** A schedule note or remark that sends a unit to the control drawings. */
const CONTROLS_REF = /\b(?:SEE|REFER\s+TO|PER)\s+(?:THE\s+)?(?:(?:TEMPERATURE\s+)?CONTROLS?|DDC|BAS|BMS|ATC)\s+(?:DRAWINGS?|SHEETS?|DIAGRAMS?|DETAILS?|SCHEMATICS?|SEQUENCES?)\b|\b(?:SEE|REFER\s+TO)\s+(?:THE\s+)?SEQUENCES?\s+OF\s+(?:OPERATIONS?|CONTROLS?)\b/;

/** A column that names what a unit serves or belongs to. */
const OWNER_HEADER = /\b(?:SERVICE|SEVICE|SERVES|SERVING|SERVED|SYSTEM|ASSOCIATED|CONNECTED|MATCHING|PAIRED)\b/i;
/** Equipment a location names by its standard designator ("TU01", "VAV-3"),
 * as a family: TU / ATU are terminal units. */
const HOST_PREFIX: Record<string, string> = { TU: "VAV", ATU: "VAV", VAV: "VAV", VAVB: "VAV", AHU: "AHU", RTU: "RTU", FCU: "FCU" };

/** The family of unscheduled equipment a unit's location puts it in. */
function hostFamilyOf(u: RowUnit, byTag: ReadonlyMap<string, readonly RowUnit[]>): { family: string; loc: string } | null {
  for (const [h, v] of Object.entries(u.cells)) {
    if (!LOCATION_HEADER.test(h)) continue;
    const m = clean(v).match(/(?:^|[^A-Z])(TU|ATU|VAVB?|AHU|RTU|FCU)[-\s]?(\d{1,4})(?![0-9])/);
    if (!m) continue;
    const k = tagKey(`${m[1]}-${m[2]}`);
    if (k && byTag.has(keyString(k))) return null;
    return { family: HOST_PREFIX[m[1]], loc: clean(v) };
  }
  return null;
}

/** A column that says where a unit is. */
const LOCATION_HEADER = /\b(?:LOCATION|MOUNTED|INSTALLED)\b/i;

/** Whether a unit's own schedule row (its title, headers or cells) prints
 * the title's whole subject, qualifiers included. */
/** What a system carries, not what a unit is: a title about the hot water
 * system names no unit a hot-water unit heater's row could print. */
const MEDIA = new Set(["HYDRONIC", "CHILLED_WATER", "STEAM", "CONDENSER", "CONDENSER_WATER", "GLYCOL", "ELECTRIC", "GAS", "REFRIGERANT", "DOMESTIC", "HEATING", "COOLING", "EXISTING"]);

function namesRow(title: string, u: Pick<RowUnit, "table_title" | "cells">, text = typeText(u), paired = false): boolean {
  const words = canonSubject(title).filter((w) => !DEVICE_NOUNS.has(w) && !MEDIA.has(w) && !/^(?:[A-Z]{1,6}-)?[A-Z]{1,6}-?\d/.test(w) && !(paired && w === "SPLIT"));
  if (!words.length) return false;
  const row = ` ${canonSubject(text).join(" ")} `;
  return words.every((w) => row.includes(` ${w} `));
}
