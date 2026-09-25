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
// A sheet whose title block names control evidence (scope "sheet") binds a
// unit by a tag in that title; as a sibling when the sheet is about the
// unit's family and the only units its titles name are those of the title
// that names the unit; or by family only when no packet binds the unit.
import type { Packet } from "./evidence";
import { pageLines, repairSpacing, subjectFamily, subjectWords } from "./evidence";
import type { RowUnit } from "./rowReader";
import { frameBox } from "../assemblies/scheduleNotes";

export type BindingKind = "tag" | "list_range" | "cross_reference" | "tag_body" | "sibling" | "family_detail" | "component_of";

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

const RANK: Record<BindingKind, number> = { tag: 1, list_range: 1, cross_reference: 2, tag_body: 3, sibling: 4, family_detail: 5, component_of: 6 };

// ── Tags ────────────────────────────────────────────────────────────────────

interface TagKey { prefix: string; n: number; suffix: string }

/** A tag's parts: its letters, its number as an integer, what follows. */
export function tagKey(tag: string): TagKey | null {
  const m = String(tag ?? "").toUpperCase().replace(/[‐-―−﹘﹣－]/g, "-").match(/^\s*(?:[A-Z]{1,6}-)?([A-Z]{1,6})\s*-?\s*(\d{1,4})([A-Z]{0,2})\s*(?:\([A-Z]{1,10}\))?\s*$/);
  return m ? { prefix: m[1], n: Number(m[2]), suffix: m[3] } : null;
}
const sameTag = (a: TagKey, b: TagKey) => a.prefix === b.prefix && a.n === b.n && a.suffix === b.suffix;
const keyString = (k: TagKey) => `${k.prefix}-${k.n}${k.suffix}`;

/** The tags a title names, lists and ranges expanded over the scheduled
 * tags: "RTU-1, 2, 3" carries the prefix; "VAV-1 THRU VAV-9" and "EF-1 THRU
 * 3" take every scheduled tag of that prefix in the range. A list runs
 * only while tags and numbers follow one another with "," "&" "AND" or
 * "THRU" between; any other word ends it. */
export function titleTags(title: string, scheduled: readonly TagKey[]): Array<{ key: TagKey; how: "tag" | "list_range" }> {
  const text = repairSpacing(title).replace(/[‐-―−﹘﹣－]/g, "-");
  const toks = text.match(/[A-Z]{1,6}\s?-\s?\d{1,4}[A-Z]{0,2}(?![A-Z0-9])|\d{1,4}[A-Z]{0,2}(?![A-Z0-9])|[A-Z][A-Z0-9%'\/]*|[,&()]|\S/g) ?? [];
  const out: Array<{ key: TagKey; how: "tag" | "list_range" }> = [];
  const add = (k: TagKey, how: "tag" | "list_range") => {
    const had = out.find((o) => sameTag(o.key, k));
    if (had) { if (how === "list_range") had.how = how; } else out.push({ key: k, how });
  };
  let last: TagKey | null = null;
  let pending: "list" | "range" | null = null;
  for (const tok of toks) {
    const t = tok.replace(/\s+/g, "");
    const k: TagKey | null = /^[A-Z]{1,6}-?\d/.test(t) ? tagKey(t) : /^\d{1,4}[A-Z]{0,2}$/.test(t) && last && pending ? tagKey(`${(last as TagKey).prefix}-${t}`) : null;
    if (k) {
      if (pending === "range" && last && last.prefix === k.prefix) {
        for (const s of scheduled) if (s.prefix === k.prefix && s.n >= last.n && s.n <= k.n) add(s, "list_range");
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
    for (const m of repairSpacing(l.text).matchAll(/(?<![A-Z0-9-])([A-Z]{1,6})\s?-\s?(\d{1,4})([A-Z]{0,2})(?![A-Z0-9])/g)) add({ prefix: m[1], n: Number(m[2]), suffix: m[3] });
  }
  const framed = p.spans.map((s) => {
    const rot = (((Math.round(Number(s.rot ?? 0) / 90) * 90) % 360) + 360) % 360;
    return { s, rot, b: frameBox([s.x0, s.y0, s.x1, s.y1], rot), t: String(s.str ?? "").trim().toUpperCase() };
  });
  for (const pre of framed) {
    if (!/^[A-Z]{1,5}-?$/.test(pre.t)) continue;
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
function typeText(u: RowUnit): string {
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

/** The title's qualifiers: its subject words that are neither the unit
 * family's own words (as its schedule's title prints them, or the family
 * name), nor a device noun, nor a tag. Multi-word synonyms ("HOT WATER")
 * are read as one qualifier. */
function qualifiers(title: string, u: RowUnit): string[] {
  const words = subjectWords(title).map((w) => w.replace(/^[(]+|[)]+$/g, "")).filter((w) => w && !/^[A-Z]{1,6}-?\d/.test(w) && !DEVICE_NOUNS.has(w));
  const own = new Set([...clean(u.table_title).split(/[^A-Z0-9]+/), ...u.family.split("_")]);
  const phrases: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const two = `${words[i]} ${words[i + 1] ?? ""}`.trim();
    const three = `${two} ${words[i + 2] ?? ""}`.trim();
    const group = SYNONYMS.find((g) => g.includes(three)) ? three : SYNONYMS.find((g) => g.includes(two)) ? two : words[i];
    i += group.split(" ").length - 1;
    const parts = group.split(" ");
    if (parts.every((p) => own.has(p) || own.has(p.replace(/S$/, "")))) continue;
    if (expand(group).some((g) => g.split(" ").every((p) => own.has(p)))) continue;
    phrases.push(group);
  }
  return phrases;
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
  const titled = packets.map((p) => ({ p, tags: titleTags(`${p.title} ${p.subtitle ?? ""}`, scheduled), family: subjectFamily(p.title), designators: designators(p.title) }));
  const bodies = new Map(packets.map((p) => [p.id, bodyTags(p)]));
  const labels = new Map(packets.map((p) => [p.id, labelTags(p)]));
  // A tag a title names anywhere in the set.
  const namedInTitle = new Set(titled.flatMap((t) => t.tags.map((x) => keyString(x.key))));
  const sheetByNumber = new Map<string, string[]>();
  for (const [sheet, no] of Object.entries(opts.sheetNumbers ?? {})) (sheetByNumber.get(compact(no)) ?? sheetByNumber.set(compact(no), []).get(compact(no))!).push(sheet);
  const byId = new Map(packets.map((p) => [p.id, p]));
  const kindOf = (b: Binding) => byId.get(b.packet)!.kind;

  // Split systems: an indoor unit whose row names its outdoor unit ("SYSTEM:
  // CU-1") is one half of a split system, and that outdoor unit the other.
  const byTag = new Map<string, RowUnit[]>();
  for (const u of units) { const k = tagKey(u.tag); if (k) (byTag.get(keyString(k)) ?? byTag.set(keyString(k), []).get(keyString(k))!).push(u); }
  const namedUnits = (v: string) => [...clean(v).matchAll(/(?<![A-Z0-9-])(?:[A-Z]{1,6}-)?[A-Z]{1,6}\s?-\s?\d{1,4}[A-Z]{0,2}(?![A-Z0-9])/g)]
    .map((m) => tagKey(m[0].replace(/\s+/g, ""))).filter((k): k is TagKey => Boolean(k)).flatMap((k) => byTag.get(keyString(k)) ?? []);
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
    // Title tags, lists and ranges.
    for (const t of titled) {
      const hit = key && t.tags.find((x) => sameTag(x.key, key));
      if (hit) add({ packet: t.p.id, kind: hit.how, evidence: `${t.p.scope === "sheet" ? "the sheet's title" : "its title"} "${t.p.title}${t.p.subtitle ? ` ${t.p.subtitle}` : ""}" names ${u.tag}${hit.how === "list_range" ? " in a list or range" : ""}` });
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
    if (key && !namedInTitle.has(keyString(key))) {
      for (const t of titled) {
        if (t.p.scope === "sheet") continue;
        const asLabel = (labels.get(t.p.id) ?? []).some((k) => sameTag(k, key));
        const inText = (t.family === null || t.family === u.family) && (bodies.get(t.p.id) ?? []).some((k) => sameTag(k, key));
        if (asLabel || inText) add({ packet: t.p.id, kind: "tag_body", evidence: `${u.tag} is printed inside "${t.p.title}"${asLabel ? " as a label" : ""}` });
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
          const list = direct.get(u.index) ?? [];
          if (!list.some((b) => b.packet === detail[0].id)) list.push({ packet: detail[0].id, kind: "cross_reference", evidence: `the points schedule "${pts.title}" lists ${u.tag} under "${clean(line)}", detail ${m[1]} on its sheet` });
          if (!list.some((b) => b.packet === pts.id)) list.push({ packet: pts.id, kind: "cross_reference", evidence: `the points schedule "${pts.title}" lists ${u.tag} under "${clean(line)}"` });
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
        if (equalSubject(p.title, bp.title)) add({ packet: p.id, kind: "sibling", evidence: `"${p.title}" is about the same subject as "${bp.title}" on the same sheet` });
      }
    }
    // The sheet a title naming the unit is printed on, when the sheet's own
    // title is about the unit's family and names no tag, and every tag a
    // title on the sheet names is one that title names: the whole sheet is
    // the unit's ("AHU - 1 SEQUENCE OF OPERATIONS" heading columns of text
    // on "AIR HANDLING UNIT SEQUENCE OF OPERATIONS").
    for (const b of [...found]) {
      const bp = byId.get(b.packet)!;
      if (RANK[b.kind] > 1 || bp.scope === "sheet") continue;
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
    const titleKinds = new Set(found.filter((b) => RANK[b.kind] <= 2 || b.kind === "sibling"
      || (b.kind === "tag_body" && titled.find((t) => t.p.id === b.packet)?.family === u.family)).map(kindOf));
    // A unit a title names (its tag, its list, a cross-reference) has its own
    // packets: no family detail of any kind is added to them (their sequence
    // or schematic of the same subject comes in as a sibling).
    const named = found.some((b) => RANK[b.kind] <= 2);
    const chosen = chosenBy.get(`${u.cite?.sheet}|${u.table_title}`);
    const paired = outdoorOf.has(u.index);
    // A detail shown for one unit of the family ("… CONTROL SCHEMATIC (EH-5)")
    // is typical for the others when their schedule sends them to the
    // control drawings ("SEE CONTROL DRAWINGS FOR SEQUENCE OF OPERATION").
    const sentToControls = [...(u.notes ?? []).map((n) => n.text), ...Object.values(u.cells)].some((x) => CONTROLS_REF.test(clean(x)));
    const typicalFor = (t: typeof titled[number]) => sentToControls && t.tags.length > 0
      && t.tags.every((x) => (byTag.get(keyString(x.key)) ?? []).some((o) => o.family === u.family && o !== u));
    const familyCands = named ? [] : titled.filter((t) => t.p.scope !== "sheet" && !titleKinds.has(t.p.kind) && (t.tags.length === 0 || typicalFor(t))
      && !(chosen?.has(t.p.id) && !found.some((b) => b.packet === t.p.id))
      && (t.family === u.family || (t.family === null && namesRow(t.p.title, u, typeText(u), paired && SPLIT.test(repairSpacing(t.p.title))))));
    const byKind = new Map<string, Array<{ t: typeof titled[number]; unconfirmed: string[]; subject: boolean; qualified: number }>>();
    for (const t of familyCands) {
      const split = paired && SPLIT.test(repairSpacing(t.p.title));
      const quals = qualifiers(t.p.title, u);
      const unconfirmed = quals.filter((q) => !printed(q, text) && !(split && q === "SPLIT"));
      (byKind.get(t.p.kind) ?? byKind.set(t.p.kind, []).get(t.p.kind)!).push({ t, unconfirmed, subject: namesRow(t.p.title, u, typeText(u), split), qualified: quals.length - unconfirmed.length });
    }
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
      for (const c of pick) {
        add({
          packet: c.t.p.id, kind: "family_detail",
          evidence: `"${c.t.p.title}" is a detail for ${c.t.family === u.family ? `its family (${u.family})` : "what its schedule names"}${c.unconfirmed.length ? `; its row does not print ${c.unconfirmed.map((q) => `"${q}"`).join(", ")}` : ""}`,
          ...(c.unconfirmed.length ? { proposal: true as const } : {}),
          ...(pick.length > 1 ? { ambiguous: true as const } : {}),
        });
      }
    }
    // A drive's detail ("VARIABLE FREQUENCY DRIVE CONTROL"): a unit whose
    // row prints a VFD and that no detail of its own names takes it.
    if (!found.some((b) => RANK[b.kind] <= 2) && /(?:^|[^A-Z])(?:VFD|V\.F\.D\.?|VARIABLE FREQUENCY DRIVE)(?:$|[^A-Z])/.test(Object.values(u.cells).map(clean).join(" | "))) {
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

  for (const [k, found] of out) {
    if (!found.length) { out.delete(k); continue; }
    found.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
  }
  return out;
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

function namesRow(title: string, u: RowUnit, text = typeText(u), paired = false): boolean {
  const words = canonSubject(title).filter((w) => !DEVICE_NOUNS.has(w) && !MEDIA.has(w) && !/^[A-Z]{1,6}-?\d/.test(w) && !(paired && w === "SPLIT"));
  if (!words.length) return false;
  const row = ` ${canonSubject(text).join(" ")} `;
  return words.every((w) => row.includes(` ${w} `));
}
