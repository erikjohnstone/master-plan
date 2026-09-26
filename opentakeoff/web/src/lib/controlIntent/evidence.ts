// CONTROL INTENT goal, WP2: the control-evidence map (goals/CONTROL_INTENT.md
// decision C5, plans/05-control-intent-plan.md §5.1).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. Which printed detail governs a unit
// decides what its options are read from; the Takeoff panel, the MCP tools
// and the evals read the same map through applyAssemblies.
//
// A PACKET is one piece of control evidence as printed: a control detail or
// schematic, a sequence of operation, or a points list. It has a title, a
// region, and the text inside that region. The finder reads a page's
// positioned text only, which every surface has, and decides structure
// first (L1):
//   · A title is structural: a line set larger than the page's body text, a
//     caption marked by a scale note or a detail number, or a short heading
//     that starts a block of text.
//   · Vocabulary only confirms it. The title names control evidence
//     (CONTROL(S), SCHEMATIC, DIAGRAM, SEQUENCE, POINTS LIST …) and a subject;
//     a title naming only the discipline ("HVAC CONTROLS") names none.
//   · Its content runs above it (a caption under a drawing) or below it (a
//     heading over text or a table), read from the text around it. Its
//     region stops at the next title in its lane.
// Title-block text, legends and notes headings are never packets. Binding
// packets to scheduled units is binding.ts; nothing here reads a schedule.
import type { Box, NoteSpan } from "../assemblies/scheduleNotes";
import { frameBox } from "../assemblies/scheduleNotes";
import { HVAC_FAMILY_SPECS } from "../corpusTakeoff.mjs";
import { scheduleTitleMatches } from "../scheduleTitleMatch.mjs";

export const EVIDENCE_VERSION = "control_evidence_v1";

/** What a packet is, from its title. */
export type PacketKind = "sequence" | "points" | "diagram" | "detail";

export interface Packet {
  /** `${sheet}#p${n}`: unique in a project, stable for the same page text. */
  id: string;
  sheet: string;
  kind: PacketKind;
  /** The title as printed, its lines joined by a space. */
  title: string;
  /** The title's box, in the spans' (device) space. */
  title_box: Box;
  /** A detail, sequence or points list ("detail"); an item of a generic
   * sequence that names equipment ("section"); a sheet whose title block
   * names control evidence about something ("sheet"). */
  scope: "detail" | "section" | "sheet";
  /** Where the content runs from the title (a sheet's is the whole field). */
  direction: "above_title" | "below_title" | "sheet";
  /** The whole packet, title and content, in device space. */
  region: Box;
  /** The detail number printed beside a caption ("3"), when there is one. */
  detail_number?: string;
  /** A parenthetical line printed right under the title ("(EF-1, EF-2, &
   * EF-3)", "(AHU-1)"): part of the title, often its tag list. */
  subtitle?: string;
  /** The text inside the region (the title's own lines included), in
   * reading order. */
  spans: NoteSpan[];
}

// ── Lines ───────────────────────────────────────────────────────────────────

/** A printed line: spans on one baseline, in their reading frame. */
export interface Line {
  rot: number;
  /** Reading-frame box [u0, v0, u1, v1]: u along the text, v down the page as
   * the text reads. */
  box: Box;
  /** Device-space box. */
  dev: Box;
  /** Font height (the tallest span's). */
  h: number;
  text: string;
  spans: NoteSpan[];
}

/** The rotation of a span, when it is a quarter turn (text at other angles
 * is never a title). */
function quarterTurn(rot: unknown): number | null {
  const r = ((Number(rot ?? 0) % 360) + 360) % 360;
  for (const q of [0, 90, 180, 270, 360]) if (Math.abs(r - q) <= 2) return q % 360;
  return null;
}

const LONE_NUMBER = /^\(?[A-Z]?\d{1,3}[A-Z]?\)?\.?$/;
const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** A page's lines: spans on one baseline and of one size, joined left to
 * right while the gap between them stays under a word gap or two. */
export function pageLines(spans: readonly NoteSpan[]): Line[] {
  const byRot = new Map<number, Array<{ s: NoteSpan; box: Box }>>();
  for (const s of spans) {
    if (!clean(s.str)) continue;
    const rot = quarterTurn(s.rot);
    if (rot === null) continue;
    const box = frameBox([s.x0, s.y0, s.x1, s.y1], rot);
    if (!(box[3] > box[1]) || !(box[2] >= box[0])) continue;
    let list = byRot.get(rot);
    if (!list) byRot.set(rot, list = []);
    list.push({ s, box });
  }
  const out: Line[] = [];
  for (const [rot, items] of byRot) {
    items.sort((a, b) => a.box[0] - b.box[0] || a.box[1] - b.box[1]);
    const open: Array<Line & { vc: number }> = [];
    for (const it of items) {
      const h = it.box[3] - it.box[1];
      const vc = (it.box[1] + it.box[3]) / 2;
      let best: (Line & { vc: number }) | null = null;
      let bestD = Infinity;
      for (const l of open) {
        const lo = Math.min(h, l.h), hi = Math.max(h, l.h);
        const d = Math.abs(vc - l.vc);
        const gap = it.box[0] - l.box[2];
        // A lone number (a detail bubble's "3", a list's "A.") joins text only
        // across a word space: a caption's detail number is not its title.
        const lone = LONE_NUMBER.test(l.text) || LONE_NUMBER.test(clean(it.s.str));
        if (d <= 0.35 * lo && hi / lo <= 1.35 && gap >= -0.6 * lo && gap <= (lone ? 0.5 * lo : 1.2 * hi) && d < bestD) { best = l; bestD = d; }
      }
      if (best) {
        best.box = union(best.box, it.box);
        best.h = Math.max(best.h, h);
        best.text = `${best.text} ${clean(it.s.str)}`;
        best.spans.push(it.s);
      } else {
        open.push({ rot, box: [...it.box] as Box, dev: [0, 0, 0, 0], h, text: clean(it.s.str), spans: [it.s], vc });
      }
    }
    for (const l of open) {
      const { vc: _vc, ...line } = l;
      line.dev = line.spans.map((s) => [s.x0, s.y0, s.x1, s.y1] as Box).reduce(union);
      out.push(line);
    }
  }
  return out;
}

/** The page's body text height: the median height of its prose (lines of
 * four words or more; a big table's cells would skew a plain median), or of
 * every line when it prints no prose. */
function bodyHeight(lines: readonly Line[]): number {
  const prose = lines.filter((l) => l.text.split(" ").length >= 4);
  const hs = (prose.length >= 5 ? prose : lines).map((l) => l.h).sort((a, b) => a - b);
  return hs.length ? hs[Math.floor(hs.length / 2)] : 10;
}


// ── Title vocabulary ────────────────────────────────────────────────────────

const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
/** A word as printed, stray spaces between its letters allowed
 * ("CO NTROL", "W ATER": some sets print letter-spaced text). */
const loose = (w: string) => w.split("").map(esc).join(" ?");
const word = (w: string, plural = false) => `\\b${loose(w)}${plural ? "(?: ?S)?" : ""}\\b`;
const rx = (s: string) => new RegExp(s, "i");

const K_SEQUENCE = rx(word("SEQUENCE", true));
const K_POINTS = rx(`${word("POINT", true)}\\s+(?:${word("LIST")}|${word("SCHEDULE")}|${word("SUMMARY")})|${word("POINT")}\\s+${word("FUNCTION")}\\s+${word("SCHEDULE")}|\\bI\\s?\\/\\s?O\\s+(?:${word("LIST")}|${word("SCHEDULE")}|${word("SUMMARY")})`);
const K_DIAGRAM = rx(`${word("SCHEMATIC", true)}|${word("DIAGRAM", true)}`);
/** CONTROL(S) as what a detail is about ("EXHAUST FAN CONTROL"), not as part
 * of a device's name ("CONTROL VALVE", "CONTROL PANEL"). */
const K_CONTROL = rx(`${word("CONTROL", true)}(?!\\s+(?:VALVES?|DAMPERS?|PANELS?|WIRING|POWER|TRANSFORMERS?|RELAYS?|BOX(?:ES)?|CABINETS?|STATIONS?|ROOMS?|JOINTS?|DEVICES?|CONDUIT)\\b)|${word("MONITORING")}`);
/** A diagram titled without CONTROL ("HOT WATER SYSTEM DIAGRAM") may be a
 * piping or flow diagram: it is a control packet only over control content. */
const CONTROL_WORD = rx(`${word("CONTROL", true)}|${word("SEQUENCE", true)}|${word("POINT", true)}`);
/** Titles that are never control packets: legends, notes, schedules of
 * other things, title-block and index headings, piping and riser diagrams,
 * and the other trades' "control" (seismic and vibration control, noise
 * control, erosion and sediment control). */
const NOT_PACKET = rx(`${word("LEGEND", true)}|${word("SYMBOL", true)}|${word("ABBREVIATION", true)}|${word("ARCHITECTURE")}|${word("RISER", true)}|${word("NETWORK")}|${word("WIRING")}|${word("SPECIFICATION", true)}|${word("INDEX")}|${word("NOTE", true)}|${word("PIPING")}|${word("FLOW")}\\s+${word("DIAGRAM")}|${word("KEY")}\\s+${word("PLAN")}|${word("SEISMIC")}|${word("VIBRATION")}|${word("NOISE")}|${word("EROSION")}|${word("SEDIMENT")}`);
const SCHEDULE_WORD = rx(word("SCHEDULE", true));
/** A drawing of how something is built, not how it is controlled. */
const INSTALLATION = /\b(?:DETAILS?|SECTIONS?|ELEVATIONS?|PLANS?|MOUNTING|INSTALLATION|SUPPORTS?|HANGING|HANGERS?|CONNECTIONS?|PIPING|DUCTWORK|ROUGH-?IN|ENLARGED|ISOMETRIC)\b/;
/** A sentence, not a title: a verb of an instruction or a statement. */
const SENTENCE = /\b(?:SHALL|WILL|MUST|SHOULD|WHEN|WHENEVER|PROVIDE[DS]?|VERIFY|REFER|SEE|INSTALL(?:ED)?|CONNECT(?:ED)?|COORDINATE|FURNISH(?:ED)?|ENSURE|ARE|IS|BE|BEEN|THAT|WHICH|THIS|THESE|THEY|BY)\b/;
/** A row of a numbered list or table ("2. TEMPERATURE CONTROL", "6 EXHAUST
 * FAN START/STOP"): a section of something, never a packet's title. */
const ROW_NUMBER = /^\(?\d{1,3}(?:\.\d{1,2})*[.)]?\s+\S/;
/** Words that are no subject: the discipline, the kind of drawing, joiners. */
const GENERIC = new Set(("HVAC MECHANICAL MECH TEMPERATURE TEMP DDC BAS BMS EMS EMCS FMCS BUILDING AUTOMATION MANAGEMENT "
  + "SYSTEM SYSTEMS TYPICAL TYP DETAIL DETAILS SCHEDULE SCHEDULES SEQUENCE SEQUENCES OPERATION OPERATIONS OF FOR AND WITH "
  + "THE A AN TO IN ON AT BY CONTROL CONTROLS DIAGRAM DIAGRAMS SCHEMATIC SCHEMATICS POINT POINTS LIST FUNCTION SUMMARY "
  + "I/O IO MONITORING NO SCALE NTS DRAWING DRAWINGS SHEET PLAN PLANS").split(" "));
/** Words a letter-spaced line is repaired to: the title vocabulary and the
 * words of the compile's schedule-title rules. */
const VOCAB = new Set<string>([...GENERIC, ...("SECONDARY PRIMARY CHILLED HEATING COOLING WATER HOT PUMP PUMPS FAN FANS EXHAUST SUPPLY "
  + "RETURN RELIEF OUTSIDE OUTDOOR AIR UNIT UNITS HEATER HEATERS HANDLING VOLUME VARIABLE CONSTANT TERMINAL BOX BOXES COIL "
  + "VALVE DAMPER BOILER BOILERS CHILLER TOWER CONDENSER CONDENSING SPLIT DUCTLESS HUMIDIFIER ENERGY RECOVERY VENTILATOR "
  + "FREQUENCY DRIVE ROOFTOP DEDICATED MAKEUP MAKE-UP RADIATION RADIATOR FINNED TUBE CABINET ELECTRIC STEAM GAS WASHER "
  + "DISINFECTOR STAIR PRESSURIZATION SMOKE KITCHEN HOOD TOILET GENERAL LAB LABORATORY").split(" ")]);

/** A line with stray spaces inside its words closed up, where the closed-up
 * word is a vocabulary word and none of its pieces is one ("TEM PERATURE"
 * → "TEMPERATURE"; "CARTW ASHER" stays as printed). */
export function repairSpacing(text: string): string {
  const toks = clean(text).toUpperCase().split(" ");
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    let joined = false;
    for (let k = Math.min(4, toks.length - i); k >= 2; k--) {
      const pieces = toks.slice(i, i + k);
      const whole = pieces.join("");
      const tail = whole.match(/[:.,]$/)?.[0] ?? "";
      const core = tail ? whole.slice(0, -1) : whole;
      if (!/^[A-Z]+$/.test(core) || !VOCAB.has(core)) continue;
      if (pieces.some((p) => VOCAB.has(p.replace(/[:.,]$/, "")))) continue;
      out.push(core + tail);
      i += k - 1;
      joined = true;
      break;
    }
    if (!joined) out.push(toks[i]);
  }
  return out.join(" ");
}

/** A title's subject words: what it is about, the discipline and the kind of
 * drawing left out. */
export function subjectWords(title: string): string[] {
  return repairSpacing(title).replace(/[():,;&]/g, " ").split(/\s+/)
    .map((w) => w.replace(/^[-–—.]+|[-–—.]+$/g, ""))
    .filter((w) => w && /[A-Z0-9]/.test(w) && !GENERIC.has(w));
}

/** The kind of control evidence a title names by its words, or null.
 * `titled`: the text is set as a title (big, a caption, a title block's
 * drawing title), so a closing period is punctuation, not a sentence's
 * ("LIGHTNG AND EXHAUST FAN CONTROL DIAGRAM."). */
export function packetKind(title: string, opts: { titled?: boolean } = {}): PacketKind | null {
  const t = repairSpacing(title);
  if (!t || t.length > 180 || NOT_PACKET.test(t)) return null;
  const kind: PacketKind | null = K_SEQUENCE.test(t) ? "sequence" : K_POINTS.test(t) ? "points" : K_DIAGRAM.test(t) ? "diagram" : K_CONTROL.test(t) ? "detail" : null;
  if (!kind) return null;
  if (kind !== "points" && SCHEDULE_WORD.test(t)) return null;
  if (SENTENCE.test(t) || (!opts.titled && /\.\s*$/.test(t) && t.split(" ").length >= 6)) return null;
  if (t.split(" ").length > 22) return null;
  return subjectWords(t).length ? kind : null;
}

/** A printed equipment tag: letters, an optional dash, a number ("VAV-1",
 * "EF-4", "AHU-04", "CH-1"). */
export const TAG_TOKEN = /\b[A-Z]{1,6}\s?-\s?\d{1,3}[A-Z]?\b/g;

// ── Families ────────────────────────────────────────────────────────────────

const FAMILY_SPECS = HVAC_FAMILY_SPECS as unknown as Record<string, { titleRe?: RegExp; exclude?: RegExp; keyRe?: RegExp; blankKeyRe?: RegExp }>;

/** The tag prefixes of three letters or more each family's rules name
 * ("VAV", "AHU", "FCU"): a title word equal to one names that family. */
const PREFIX_FAMILY: ReadonlyMap<string, string> = (() => {
  const seen = new Map<string, Set<string>>();
  for (const [family, spec] of Object.entries(FAMILY_SPECS)) {
    for (const re of [spec.keyRe, spec.blankKeyRe]) {
      const m = re?.source.match(/^\^\(\?:([^)]*)\)/);
      for (const alt of m?.[1].split("|") ?? []) {
        if (!/^[A-Z]{3,6}$/.test(alt)) continue;
        (seen.get(alt) ?? seen.set(alt, new Set()).get(alt)!).add(family);
      }
    }
  }
  return new Map([...seen].filter(([, fams]) => fams.size === 1).map(([p, fams]) => [p, [...fams][0]]));
})();

/** The unit family a title's subject names, read by the compile's own
 * schedule-title rules (corpusTakeoff.mjs HVAC_FAMILY_SPECS) as if the
 * subject titled a schedule, or by a family's tag prefix printed as a word
 * ("VAV"). A title's parts (split at " - ", parentheses, commas) are read
 * one by one, plural or singular, with the words that name no subject
 * dropped. English compounds are right-headed, so of two families in one
 * part the one named last wins ("VARIABLE AIR VOLUME AIR HANDLING UNIT" is
 * an air handling unit). When parts name different families, the part that
 * carries the title's control keyword names the subject ("EXHAUST FAN
 * CONTROL - AHU INTERLOCK" is a fan); otherwise the title names none. */
export function subjectFamily(title: string): string | null {
  const parts = repairSpacing(title).split(/\s+[-–—]\s+|[(),:]/).map((p) => clean(p)).filter(Boolean);
  const found: Array<{ family: string; keyword: boolean }> = [];
  for (const part of parts) {
    const subject = subjectWords(part).join(" ");
    if (!subject) continue;
    const keyword = K_CONTROL.test(part) || K_SEQUENCE.test(part) || K_DIAGRAM.test(part) || K_POINTS.test(part);
    const variants = [subject, subject.replace(/\b([A-Z]{2,}[^S\s])S\b/g, "$1")];
    let best: { family: string; end: number } | null = null;
    for (const v of variants) {
      for (const probe of [`${v} SCHEDULE`, v]) {
        for (const [family, spec] of Object.entries(FAMILY_SPECS)) {
          if (!spec.titleRe || !scheduleTitleMatches(probe, spec.titleRe, spec.exclude)) continue;
          const g = new RegExp(spec.titleRe.source, spec.titleRe.flags.includes("g") ? spec.titleRe.flags : `${spec.titleRe.flags}g`);
          let end = -1;
          for (const m of probe.toUpperCase().matchAll(g)) end = Math.max(end, (m.index ?? 0) + m[0].replace(/\s*SCHEDULE$/i, "").length);
          if (!best || end > best.end) best = { family, end };
        }
      }
    }
    if (best) { found.push({ family: best.family, keyword }); continue; }
    const byPrefix = new Set(subject.split(" ").map((w) => PREFIX_FAMILY.get(w)).filter((f): f is string => Boolean(f)));
    if (byPrefix.size === 1) found.push({ family: [...byPrefix][0], keyword });
  }
  const families = new Set(found.map((f) => f.family));
  if (families.size === 1) return [...families][0];
  const keyed = new Set(found.filter((f) => f.keyword).map((f) => f.family));
  return keyed.size === 1 ? [...keyed][0] : null;
}

// ── Page structure ──────────────────────────────────────────────────────────

/** A title-block field label (US title-block conventions). */
const TITLE_BLOCK_LABEL = /^(?:(?:SHEET|DRAWING|DWG)\s*(?:TITLE|NAME|NUMBER|NO\.?|#)|PROJECT\s*(?:TITLE|NAME|NUMBER|NO\.?|#|INFORMATION)|(?:JOB|COMM(?:ISSION)?)\s*(?:NO\.?|NUMBER|#)|(?:DRAWN|CHECKED|DESIGNED|APPROVED|REVIEWED)(?:\s*BY)?|ISSUE\s*DATE|ISSUES?|REVISIONS?|CONSULTANTS?|STAMP|SEAL|KEY\s*PLAN)\s*:?$/i;
const SCALE_NOTE = /^(?:SCALE\b|NO\s+SCALE\b|N\.?\s?T\.?\s?S\.?$|NOT\s+TO\s+SCALE\b)/i;
const DETAIL_NUMBER = /^[A-Z]{0,2}\d{1,3}[A-Z]?$/;
/** Control content: a keyword-less caption is a control packet only when
 * its region reads as one (two of these kinds of evidence). */
const CONTENT: RegExp[] = [
  /^(?:AI|AO|BI|BO|DI|DO|AV|BV)$/,
  /\bSHALL\b.*\b(?:MODULATE|ENABLE|DISABLE|START|STOP|MAINTAIN|OPEN|CLOSE|CONTROL|MONITOR|CYCLE|STAGE|INDEX)/,
  /\b(?:CONTROLLER|DDC|BAS|BMS|EMS|EMCS|FMCS|THERMOSTAT|T-?STAT|SET\s?POINT)\b/,
  /\b(?:SENSOR|ACTUATOR|VFD|STATUS|ALARM|CURRENT\s+SWITCH|START\/STOP)\b/,
];

interface Strip { right?: number; bottom?: number }

/** The title block: the page strip that holds its field labels (along the
 * right edge or across the bottom), in device space. Empty when none. */
function titleBlockStrip(lines: readonly Line[], W: number, H: number): Strip {
  const anchors = lines.filter((l) => TITLE_BLOCK_LABEL.test(l.text));
  const right = anchors.filter((l) => l.dev[0] >= 0.72 * W).map((l) => l.dev[0]);
  // A bottom strip runs across the page: its labels are not the right strip's.
  const bottom = anchors.filter((l) => l.dev[1] >= 0.8 * H && l.dev[0] < 0.72 * W).map((l) => l.dev[1]);
  const strip: Strip = {};
  if (right.length >= 2) strip.right = Math.min(...right) - 0.01 * W;
  if (bottom.length >= 2) strip.bottom = Math.min(...bottom) - 0.01 * H;
  return strip;
}

const inStrip = (b: Box, s: Strip) => (s.right !== undefined && b[0] >= s.right) || (s.bottom !== undefined && b[1] >= s.bottom);
const uOverlap = (a: Box, b: Box) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
const wordCount = (s: string) => clean(s).split(" ").filter(Boolean).length;

interface Title {
  lines: Line[];
  rot: number;
  box: Box;
  dev: Box;
  h: number;
  text: string;
  /** What the title's words name, when it names control evidence. */
  kind: PacketKind | null;
  caption: boolean;
  big: boolean;
  bubble?: Line;
  scale?: Line;
  /** A parenthetical line right under the title. */
  subtitle?: Line;
  direction?: "above_title" | "below_title";
  packet?: PacketKind;
  /** A sequence heading that names nothing but itself. */
  generic?: boolean;
  /** Printed at the top of a points table (its header row right under it):
   * the title heads the table. */
  tableHead?: boolean;
  /** A heading read as starting a block right after the last sentence of
   * the text above it: its text is below it, never that text. */
  heads?: boolean;
}

/** The page's printed sheet number: the largest short code set well above
 * the body text (the title block's number), or null. */
export function sheetNumberOf(spans: readonly NoteSpan[]): string | null {
  const lines = pageLines(spans);
  const body = bodyHeight(lines);
  const cands = lines.filter((l) => /^[A-Z]{1,3}\s?[-.]?\s?\d{1,3}(?:[.-]\d{1,3}){0,2}[A-Z]?$/i.test(l.text) && l.h >= 1.4 * body)
    .sort((a, b) => b.h - a.h || b.dev[1] - a.dev[1] || b.dev[0] - a.dev[0]);
  return cands[0] ? cands[0].text.replace(/\s+/g, "").toUpperCase() : null;
}

/** A table the sheet graph extracted, as a hint for a points list's region. */
export interface TableHint { title: string; region: Box }

/** A title-block field's value, never part of the drawing title. */
const FIELD_VALUE = /^(?:NONE|AS\s+(?:NOTED|SHOWN|INDICATED)|N\.?\s?T\.?\s?S\.?|[\d\s\/.\-]+|\d{1,2}\/\d{1,2}\/\d{2,4})$/i;
const TITLE_LABEL = /^(?:(?:DRAWING|SHEET|DWG)\s*(?:TITLE|NAME)|TITLE)\s*:?$/i;
/** A sequence heading that names nothing but itself ("SEQUENCE OF
 * OPERATION:"): its items name the equipment. */
const GENERIC_SEQUENCE = rx(`^(?:${word("SEQUENCE", true)}\\s+${word("OF")}\\s+(?:${word("OPERATION", true)}|${word("CONTROL", true)})|${word("CONTROL")}\\s+${word("SEQUENCE", true)})\\s*:?$`);
const ITEM_MARK = /^(?:\(?[A-Z0-9]{1,2}[.)]|\(?[ivx]{1,4}[.)])$/i;
/** A line under a title that belongs to it: its scale note, a parenthetical
 * subtitle ("(AHU-1)", "(ROOMS 119 / 123)"). */
const SUBTITLE = /^\(.*\)$/;
/** A points table's header row: its column groups or its first column's
 * heading, or three or more I/O types in a row. */
const POINTS_HEADER = /\b(?:HARDWARE|SOFTWARE)\s+POINTS\b|\bPOINT\s+(?:NAME|DESCRIPTION)\b|^(?:AI|AO|BI|BO|DI|DO|AV|BV)(?:\s+(?:AI|AO|BI|BO|DI|DO|AV|BV)){2,}\b/;

/** The drawing title printed in the page's title block (the lines under its
 * DRAWING TITLE / SHEET TITLE label), or null. */
export function sheetTitleOf(spans: readonly NoteSpan[]): string | null {
  const lines = pageLines(spans);
  const labels = lines.filter((l) => TITLE_LABEL.test(l.text));
  for (const label of labels) {
    const col = lines.filter((l) => l.rot === label.rot && l !== label && l.box[1] >= label.box[3] - 0.2 * label.h
      && l.box[0] < label.box[2] + 8 * label.h && l.box[2] > label.box[0] - 2 * label.h).sort((a, b) => a.box[1] - b.box[1]);
    const out: Line[] = [];
    let bottom = label.box[3];
    for (const l of col) {
      if (TITLE_BLOCK_LABEL.test(l.text) || TITLE_LABEL.test(l.text) || SCALE_NOTE.test(l.text)) break;
      if (FIELD_VALUE.test(l.text)) continue;
      if (l.box[1] - bottom > 2.5 * Math.max(label.h, l.h)) break;
      out.push(l);
      bottom = Math.max(bottom, l.box[3]);
    }
    const text = clean(out.map((l) => l.text).join(" "));
    if (text) return text;
  }
  return null;
}

interface Page {
  lines: Line[];
  body: number;
  strip: Strip;
  titles: Title[];
  sheetTitle: string | null;
}

/** A page's titles, the way each one's content runs and its packet kind: the
 * finder's working, exported for its tests and diagnostics. */
export function analyzePage(spans: readonly NoteSpan[], tables: readonly TableHint[] = []): Page & { regions: Map<Title, Box> } {
  const all = pageLines(spans);
  const regions = new Map<Title, Box>();
  if (!all.length) return { lines: [], body: 10, strip: {}, titles: [], sheetTitle: null, regions };
  const body = bodyHeight(all);
  const W = Math.max(...all.map((l) => l.dev[2]));
  const H = Math.max(...all.map((l) => l.dev[3]));
  const strip = titleBlockStrip(all, W, H);
  const sheetNo = sheetNumberOf(spans);
  const tableBoxes = tables.map((t) => ({ ...t, compact: compactTitle(t.title) }));
  // Text inside an extracted table's body is table text, never a title.
  const inTable = (l: Line) => tableBoxes.some((t) => l.dev[0] >= t.region[0] - 1 && l.dev[2] <= t.region[2] + 1 && l.dev[1] >= t.region[1] - 1 && l.dev[3] <= t.region[3] + 1
    && compactTitle(l.text) !== t.compact);
  const lines = all.filter((l) => !inStrip(l.dev, strip));
  const byRot = new Map<number, Line[]>();
  for (const l of lines) (byRot.get(l.rot) ?? byRot.set(l.rot, []).get(l.rot)!).push(l);
  const sameRot = (rot: number) => byRot.get(rot) ?? [];
  const fieldOf = (rot: number) => sameRot(rot).map((l) => l.box).reduce(union);

  function titleOf(group: Line[], big: boolean): Title {
    const box = group.map((g) => g.box).reduce(union);
    const dev = group.map((g) => g.dev).reduce(union);
    const h = Math.max(...group.map((g) => g.h));
    const text = clean(group.map((g) => g.text).join(" "));
    const rows = sameRot(group[0].rot);
    // A detail number beside a caption is set at least as large as the
    // page's body text, and larger than a body-size caption.
    const bubble = rows.filter((b) => !group.includes(b) && DETAIL_NUMBER.test(b.text) && b.h >= Math.max(0.6 * h, 1.1 * body)
      && b.box[2] <= box[0] + 0.2 * h && box[0] - b.box[2] <= 3 * h
      && (b.box[1] + b.box[3]) / 2 >= box[1] - 0.6 * h && (b.box[1] + b.box[3]) / 2 <= box[3] + 0.6 * h)
      .sort((a, b) => b.box[2] - a.box[2])[0];
    const scale = rows.find((s) => !group.includes(s) && SCALE_NOTE.test(s.text) && s.box[1] - box[3] >= -0.2 * h && s.box[1] - box[3] <= 2.5 * h
      && (Math.abs(s.box[0] - box[0]) <= 3 * h || (s.box[0] >= box[0] - h && s.box[2] <= box[2] + h)));
    const subtitle = rows.filter((s) => !group.includes(s) && SUBTITLE.test(s.text) && s.box[1] - box[3] >= -0.2 * h && s.box[1] - box[3] <= 1.5 * h
      && uOverlap(s.box, box) > 0).sort((a, b) => a.box[1] - b.box[1])[0];
    return { lines: group, rot: group[0].rot, box, dev, h, text, kind: packetKind(text, { titled: big || Boolean(bubble || scale) }), caption: Boolean(bubble || scale), big, bubble, scale, subtitle };
  }

  // 1. Titles. Big lines, alone on their baseline (a table row in a large
  //    font has cells beside it), stacked when a title runs to more lines.
  const titles: Title[] = [];
  const isolated = (l: Line) => !sameRot(l.rot).some((o) => o !== l && Math.abs(o.h - l.h) <= 0.15 * l.h
    && Math.abs((o.box[1] + o.box[3]) / 2 - (l.box[1] + l.box[3]) / 2) <= 0.35 * l.h
    && !DETAIL_NUMBER.test(o.text) && !SCALE_NOTE.test(o.text)
    && ((o.box[0] >= l.box[2] && o.box[0] - l.box[2] <= 6 * l.h) || (o.box[2] <= l.box[0] && l.box[0] - o.box[2] <= 6 * l.h)));
  const hasWord = (l: Line) => /[A-Z]{3,}/i.test(l.text);
  const big = lines.filter((l) => l.h >= 1.2 * body && hasWord(l) && !ROW_NUMBER.test(l.text) && !DETAIL_NUMBER.test(l.text) && !SCALE_NOTE.test(l.text)
    && !SUBTITLE.test(l.text) && !inTable(l) && isolated(l))
    .sort((a, b) => a.rot - b.rot || a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  const used = new Set<Line>();
  for (const l of big) {
    if (used.has(l)) continue;
    const group = [l];
    used.add(l);
    while (group.length < 4) {
      const last = group[group.length - 1];
      const next = big.find((n) => !used.has(n) && n.rot === last.rot && Math.abs(n.h - last.h) <= 0.15 * last.h
        && n.box[1] - last.box[3] >= -0.2 * last.h && n.box[1] - last.box[3] <= 0.6 * last.h
        && (Math.abs(n.box[0] - last.box[0]) <= last.h || Math.abs((n.box[0] + n.box[2]) / 2 - (last.box[0] + last.box[2]) / 2) <= last.h));
      if (!next) break;
      group.push(next);
      used.add(next);
    }
    titles.push(titleOf(group, true));
  }
  //    Body-size headings over a sequence, a points list or a diagram: a
  //    short line that starts a block of text ("X CONTROL" in body type is a
  //    section of a sequence, never a packet), and generic sequence headings
  //    (their items become packets). Body-size captions: marked by a scale
  //    note or a detail number.
  //    A heading that names its equipment and what it is ("EXHAUST FAN
  //    (EF-3) SEQUENCE OF OPERATION") also starts a block one line under
  //    the last sentence of the text before it: two sequences printed one
  //    under the other are two packets.
  /** "free": nothing of its size printed right above it; "after": only
   * lines that end a sentence, and it names its equipment; with something
   * below it either way. */
  const startsBlock = (l: Line, named = false): "free" | "after" | null => {
    const rows = sameRot(l.rot);
    const above = rows.filter((o) => o !== l && Math.abs(o.h - l.h) <= 0.3 * l.h && uOverlap(o.box, l.box) > 0.3 * Math.min(o.box[2] - o.box[0], l.box[2] - l.box[0])
      && l.box[1] - o.box[3] >= -0.2 * l.h && l.box[1] - o.box[3] <= 1.2 * l.h);
    const below = rows.some((o) => o !== l && o.box[1] - l.box[3] >= -0.2 * l.h && o.box[1] - l.box[3] <= 3 * l.h
      && o.box[0] >= l.box[0] - 2 * l.h && o.box[0] <= l.box[0] + 4 * l.h);
    if (!below) return null;
    if (!above.length) return "free";
    return named && above.every((o) => /[.:;]\s*$/.test(o.text)) ? "after" : null;
  };
  for (const l of lines) {
    if (used.has(l) || l.h >= 1.2 * body || ROW_NUMBER.test(l.text) || wordCount(l.text) > 14 || inTable(l)) continue;
    const t = titleOf([l], false);
    // A caption that names control evidence keeps its period ("… CONTROL
    // DIAGRAM."); any other line ending in one is a sentence or an
    // abbreviated label ("DIFF. PRESS.").
    const period = /[.,]\s*$/.test(l.text);
    if (t.caption && (!period || t.kind)) { titles.push(t); continue; }
    if (period) continue;
    const generic = GENERIC_SEQUENCE.test(repairSpacing(l.text));
    if (!generic && t.kind !== "sequence" && t.kind !== "points" && t.kind !== "diagram") continue;
    const named = !generic && (t.kind === "sequence" || t.kind === "points")
      && ((repairSpacing(l.text).match(TAG_TOKEN) ?? []).length > 0 || Boolean(subjectFamily(l.text)));
    const starts = startsBlock(l, named);
    if (starts) titles.push(generic ? { ...t, kind: null, generic: true } as Title : starts === "after" ? { ...t, heads: true } : t);
  }

  // 2. Which way each title's content runs. A caption has its drawing or
  //    text above; a heading has a block of text or a table below. A
  //    drawing's title (a diagram, a detail, a keyword-less title) is its
  //    caption whenever something is printed right above it in its lane:
  //    prose right under it is the next packet's. A sequence's or a points
  //    list's title goes with the nearer block of body text (a line of six
  //    words or more; a scale note or a parenthetical subtitle belongs to the
  //    title), failing that the nearer line of any kind.
  const isBody = (o: Line) => (wordCount(o.text) >= 6 || (wordCount(o.text) >= 4 && /[.:;]\s*$/.test(o.text))) && !SCALE_NOTE.test(o.text) && !SUBTITLE.test(o.text);
  const owned = (o: Line) => SCALE_NOTE.test(o.text) || SUBTITLE.test(o.text) || DETAIL_NUMBER.test(o.text);
  /** How far below (or above) a text title its block may start. */
  const textWindow = (t: Title) => Math.max(3 * body, 2.5 * t.h);
  for (const t of titles) {
    if (t.caption) { t.direction = "above_title"; continue; }
    if (t.heads) { t.direction = "below_title"; continue; }
    // A title printed at the top of a points table, inside its border, has
    // the table's header row right under it: it heads the table, whatever
    // is printed above (often the table before it).
    const w = t.box[2] - t.box[0];
    if (sameRot(t.rot).some((o) => !t.lines.includes(o) && POINTS_HEADER.test(repairSpacing(o.text))
      && o.box[1] - t.box[3] >= -0.2 * t.h && o.box[1] - t.box[3] <= 2.5 * Math.max(t.h, body)
      && o.box[2] > t.box[0] - w && o.box[0] < t.box[2] + w)) {
      t.direction = "below_title";
      t.tableHead = true;
      continue;
    }
    const near = sameRot(t.rot).filter((o) => !t.lines.includes(o) && !owned(o) && o.box[0] < t.box[2] + 2 * t.h && o.box[2] > t.box[0] - 2 * t.h);
    const gap = (pred: (o: Line) => boolean, dir: 1 | -1, limit: number) => {
      const gs = near.filter(pred).map((o) => dir > 0 ? o.box[1] - t.box[3] : t.box[1] - o.box[3]).filter((g) => g >= -0.2 * t.h && g <= limit);
      return gs.length ? Math.min(...gs) : Infinity;
    };
    const textKind = t.kind === "sequence" || t.kind === "points" || t.generic;
    if (!textKind) {
      t.direction = gap(() => true, -1, Math.max(8 * t.h, 6 * body)) < Infinity ? "above_title" : "below_title";
      continue;
    }
    const win = textWindow(t);
    let below = gap(isBody, 1, win), above = gap(isBody, -1, win);
    if (below === above) { below = gap(() => true, 1, 8 * t.h); above = gap(() => true, -1, 8 * t.h); }
    t.direction = below < above ? "below_title" : above < below ? "above_title" : "below_title";
  }

  // 3. Regions. A title ends below its scale note and its subtitle.
  const bottomOf = (t: Title) => Math.max(t.box[3], t.scale?.box[3] ?? -Infinity, t.subtitle?.box[3] ?? -Infinity);
  const sameSubject = (a: Title, b: Title) => {
    const sa = subjectWords(a.text), sb = subjectWords(b.text);
    return sa.length > 0 && sb.length > 0 && (sb.every((w) => sa.includes(w)) || sa.every((w) => sb.includes(w)));
  };
  /** A caption's region: its lane, from the title above it in the lane (a
   * heading over the same subject, or a section heading, inside the lane is
   * part of the detail) down to the caption and its scale note. The lane is
   * the band above the caption, widened from the caption until a gutter
   * with another detail's title beyond it: a gutter is a run of the band's
   * width at least three body lines wide that at most one line crosses, so
   * the columns of one sequence stay together. */
  function captionRegion(t: Title): Box {
    const field = fieldOf(t.rot);
    const rows = sameRot(t.rot);
    const others = titles.filter((o) => o !== t && o.rot === t.rot);
    const bounding = others.filter((o) => o.caption || o.big);
    const tBox: Box = t.bubble ? union(t.box, t.bubble.box) : t.box;
    const lane = (top: number): [number, number] => {
      const band = rows.filter((l) => !t.lines.includes(l) && l.box[3] > top && l.box[1] < t.box[1]);
      const step = Math.max(1, body / 2);
      const n = Math.ceil((field[2] - field[0]) / step) + 1;
      const cover = new Array<number>(n).fill(0);
      for (const l of band) for (let i = Math.max(0, Math.floor((l.box[0] - field[0]) / step)); i <= Math.min(n - 1, Math.floor((l.box[2] - field[0]) / step)); i++) cover[i]++;
      const at = (u: number) => Math.min(n - 1, Math.max(0, Math.floor((u - field[0]) / step)));
      const uOf = (i: number) => field[0] + i * step;
      // Gutters: runs of open bins, three body lines wide or more.
      const gutters: Array<[number, number]> = [];
      for (let i = 0; i < n;) {
        if (cover[i] > 1) { i++; continue; }
        let j = i;
        while (j + 1 < n && cover[j + 1] <= 1) j++;
        if ((j - i + 1) * step >= 3 * body) gutters.push([uOf(i), uOf(j + 1)]);
        i = j + 1;
      }
      // Another detail beside this one: a caption whose content (above it)
      // reaches into the band, or a heading whose content (below it) does.
      const inBand = bounding.filter((o) => o.direction === "above_title" ? o.box[3] > top : o.box[1] < t.box[1]);
      // Walking out from the caption, the lane stops at the first gutter
      // whose far segment (up to the next gutter) holds another detail's
      // title; a title reached before any gutter stops it halfway.
      const hits = (lo: number, hi: number) => inBand.some((o) => o.box[2] > lo && o.box[0] < hi);
      let u1 = field[2];
      const right = gutters.filter((g) => g[0] >= tBox[2]).sort((a, b) => a[0] - b[0]);
      const nearRight = inBand.filter((o) => o.box[0] >= tBox[2] && o.box[0] < (right[0]?.[0] ?? Infinity)).sort((a, b) => a.box[0] - b.box[0])[0];
      if (nearRight) u1 = (tBox[2] + nearRight.box[0]) / 2;
      else for (let k = 0; k < right.length; k++) {
        if (hits(right[k][1], right[k + 1]?.[0] ?? field[2])) { u1 = right[k][0]; break; }
      }
      let u0 = field[0];
      const left = gutters.filter((g) => g[1] <= tBox[0]).sort((a, b) => b[1] - a[1]);
      const nearLeft = inBand.filter((o) => o.box[2] <= tBox[0] && o.box[2] > (left[0]?.[1] ?? -Infinity)).sort((a, b) => b.box[2] - a.box[2])[0];
      if (nearLeft) u0 = (tBox[0] + nearLeft.box[2]) / 2;
      else for (let k = 0; k < left.length; k++) {
        if (hits(left[k + 1]?.[1] ?? field[0], left[k][0])) { u0 = left[k][1]; break; }
      }
      void at;
      return [u0, u1];
    };
    const topWithin = (u0: number, u1: number) => {
      const above = others.filter((o) => o.box[3] <= t.box[1] + 0.2 * t.h && (o.box[0] + o.box[2]) / 2 >= u0 && (o.box[0] + o.box[2]) / 2 <= u1)
        .sort((a, b) => b.box[3] - a.box[3]);
      for (const o of above) {
        const partOf = o.direction === "below_title" && o.box[0] >= u0 - t.h && o.box[2] <= u1 + t.h && (!o.big || sameSubject(o, t));
        if (!partOf) return bottomOf(o);
      }
      return field[1];
    };
    let top = topWithin(tBox[0], tBox[2]);
    let [u0, u1] = lane(top);
    const top2 = topWithin(u0, u1);
    if (top2 !== top) { top = top2; [u0, u1] = lane(top); }
    return [Math.min(u0, tBox[0]), top, Math.max(u1, tBox[2]), bottomOf(t)];
  }
  /** A heading's block: the lines below it, joined while they touch the
   * block so far (a table grows to its full width row by row), until a gap
   * or the next title. The first line may be as far below as the window its
   * direction was read in (step 2): a heading read as heading the text
   * under it owns that text. A points list over an extracted table takes
   * the table's region. */
  function headingRegion(t: Title): Box {
    const hint = t.kind === "points" && t.rot === 0 ? tableBoxes.find((tb) => tb.compact === compactTitle(t.text) && uOverlap(tb.region, t.dev) > -4 * t.h && tb.region[1] >= t.dev[1] - 4 * t.h) : undefined;
    if (hint) return union(t.box, hint.region);
    let box: Box = [...t.box] as Box;
    const stops = new Set(titles.filter((o) => o !== t && o.rot === t.rot).flatMap((o) => [...o.lines, ...(o.subtitle ? [o.subtitle] : [])]));
    const below = sameRot(t.rot).filter((l) => !t.lines.includes(l) && l !== t.subtitle && l.box[1] >= t.box[3] - 0.2 * t.h).sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
    let bottom = bottomOf(t);
    if (t.subtitle) box = union(box, t.subtitle.box);
    let first = true;
    for (const l of below) {
      if (uOverlap(l.box, box) <= -2 * body) continue;
      if (l.box[1] - bottom > (first ? textWindow(t) : 2.5 * body)) break;
      if (stops.has(l)) break;
      box = union(box, l.box);
      bottom = Math.max(bottom, l.box[3]);
      first = false;
    }
    return box;
  }

  // 4. Packets: titles that name control evidence, and keyword-less
  //    captions of two words or more that name equipment over control content.
  const contentHits = (r: Box, rot: number) => {
    const text = sameRot(rot).filter((l) => l.box[0] >= r[0] - 1 && l.box[2] <= r[2] + 1 && l.box[1] >= r[1] - 1 && l.box[3] <= r[3] + 1).map((l) => repairSpacing(l.text));
    return CONTENT.filter((c) => text.some((s) => c.test(s) || s.split(" ").some((w) => c.test(w)))).length;
  };
  for (const t of titles) {
    if (inStrip(t.dev, strip)) continue;
    const region = t.direction === "above_title" ? captionRegion(t) : headingRegion(t);
    regions.set(t, region);
    const text = repairSpacing(t.text);
    if (t.kind && (t.kind !== "diagram" || CONTROL_WORD.test(text) || contentHits(region, t.rot) >= 2)) {
      t.packet = t.kind;
    } else if (!t.kind && !t.generic && (t.caption || t.big) && wordCount(text) >= 2 && text.replace(/\s+/g, "") !== sheetNo
      && !NOT_PACKET.test(text) && !INSTALLATION.test(text) && !SENTENCE.test(text) && !SCHEDULE_WORD.test(text)
      && ((text.match(TAG_TOKEN) ?? []).length > 0 || subjectFamily(text)) && contentHits(region, t.rot) >= 2) {
      t.packet = t.tableHead ? "points" : "diagram";
    }
  }
  return { lines, body, strip, titles, sheetTitle: sheetTitleOf(spans), regions };
}

const compactTitle = (s: string) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Every control packet printed on one page: its details, sequences and
 * points lists; the items of a generic sequence that name equipment; and
 * the sheet itself when its title block names control evidence about
 * something. `tables` are the sheet graph's tables on the page (a points
 * list takes its table's region). */
export function findPackets(sheet: string, spans: readonly NoteSpan[], tables: readonly TableHint[] = []): Packet[] {
  const page = analyzePage(spans, tables);
  const { titles, regions, body } = page;
  if (!titles.length && !page.sheetTitle) return [];
  const sameSubject = (a: Title, b: Title) => {
    const sa = subjectWords(a.text), sb = subjectWords(b.text);
    return sa.length > 0 && sb.length > 0 && (sb.every((w) => sa.includes(w)) || sa.every((w) => sb.includes(w)));
  };
  const entries = [...regions.entries()].filter(([t]) => t.packet);
  // A heading inside a caption's detail is part of it: a body-size heading
  // always (a section), a big one when it names the same subject.
  const inside = (t: Title, r: Box) => t.box[0] >= r[0] - t.h && t.box[2] <= r[2] + t.h && t.box[1] >= r[1] - 0.2 * t.h && t.box[3] <= r[3] + 0.2 * t.h;
  const partOfCaption = (t: Title) => t.direction === "below_title" && entries.some(([o, r]) => o !== t && o.rot === t.rot && o.direction === "above_title"
    && inside(t, r) && (!t.big || sameSubject(t, o)));
  const kept: Array<{ t: Title | null; rot: number; box: Box; title: string; kind: PacketKind; direction: Packet["direction"]; scope: Packet["scope"]; detail?: string; subtitle?: string }> = [];
  for (const [t, r] of entries) {
    if (partOfCaption(t)) continue;
    kept.push({ t, rot: t.rot, box: r, title: t.text, kind: t.packet!, direction: t.direction!, scope: "detail", detail: t.bubble?.text.toUpperCase(), subtitle: t.subtitle?.text });
  }
  // Items of a generic sequence that name equipment ("A. DUAL DUCT VAV
  // TERMINAL UNIT:"): each runs to the next item at its indent.
  for (const [t, r] of regions) {
    if (!t.generic || t.direction !== "below_title" || partOfCaption(t)) continue;
    const block = page.lines.filter((l) => l.rot === t.rot && !t.lines.includes(l) && l.box[1] >= t.box[3] - 0.2 * t.h && l.box[3] <= r[3] + 0.2 * t.h && l.box[0] >= r[0] - body && l.box[2] <= r[2] + body)
      .sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
    const heads = block.filter((l) => !ITEM_MARK.test(l.text) && wordCount(l.text) <= 8 && /:\s*$/.test(l.text) && !SENTENCE.test(repairSpacing(l.text))
      && ((repairSpacing(l.text).match(TAG_TOKEN) ?? []).length > 0 || subjectFamily(l.text)));
    for (const hd of heads) {
      const next = block.find((l) => l !== hd && l.box[1] > hd.box[3] && Math.abs(l.box[0] - hd.box[0]) <= body && /:\s*$/.test(l.text) && wordCount(l.text) <= 8 && !ITEM_MARK.test(l.text));
      const end = next ? next.box[1] : r[3];
      const box: Box = [Math.min(hd.box[0] - 4 * body, r[0]), hd.box[1], r[2], end];
      kept.push({ t: null, rot: t.rot, box, title: hd.text, kind: "sequence", direction: "below_title", scope: "section" });
    }
  }
  kept.sort((a, b) => a.rot - b.rot || a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  const packets: Packet[] = [];
  const push = (k: { rot: number; box: Box; title: string; kind: PacketKind; direction: Packet["direction"]; scope: Packet["scope"]; detail?: string; subtitle?: string; titleDev: Box }, region: Box) => {
    const inRegion = spans.filter((s) => {
      const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
      return clean(s.str) && cx >= region[0] && cx <= region[2] && cy >= region[1] && cy <= region[3];
    });
    packets.push({
      id: `${sheet}#p${packets.length + 1}`,
      sheet,
      kind: k.kind,
      scope: k.scope,
      title: k.title,
      title_box: k.titleDev,
      direction: k.direction,
      region,
      ...(k.detail ? { detail_number: k.detail } : {}),
      ...(k.subtitle ? { subtitle: k.subtitle } : {}),
      spans: readingOrder(inRegion, k.rot),
    });
  };
  for (const k of kept) {
    const titleDev = k.t ? k.t.dev : deviceBox([k.box[0], k.box[1], k.box[2], k.box[1] + body], k.rot);
    push({ ...k, titleDev }, deviceBox(k.box, k.rot));
  }
  // The sheet itself, when its title block names control evidence about
  // something ("AHU-1 DIAGRAM AND POINT LIST"): the drawing field.
  const kind = page.sheetTitle ? packetKind(page.sheetTitle, { titled: true }) : null;
  if (kind && page.lines.length) {
    const field = page.lines.map((l) => l.dev).reduce(union);
    push({ rot: 0, box: field, title: page.sheetTitle!, kind, direction: "sheet", scope: "sheet", titleDev: field }, field);
  }
  return packets;
}

/** A reading-frame box back in device space. */
function deviceBox([u0, v0, u1, v1]: Box, rot: number): Box {
  switch (rot) {
    case 90: return [-v1, u0, -v0, u1];
    case 180: return [-u1, -v1, -u0, -v0];
    case 270: return [v0, -u1, v1, -u0];
    default: return [u0, v0, u1, v1];
  }
}

/** Spans in reading order for text at `rot`: line by line, left to right. */
function readingOrder(spans: NoteSpan[], rot: number): NoteSpan[] {
  const framed = spans.map((s) => ({ s, b: frameBox([s.x0, s.y0, s.x1, s.y1], rot) }));
  framed.sort((a, b) => {
    const ha = a.b[3] - a.b[1], hb = b.b[3] - b.b[1];
    const dv = (a.b[1] + a.b[3]) / 2 - (b.b[1] + b.b[3]) / 2;
    return Math.abs(dv) <= 0.35 * Math.min(ha, hb) ? a.b[0] - b.b[0] : dv;
  });
  return framed.map((f) => f.s);
}
