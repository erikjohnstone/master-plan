// ASSEMBLIES goal, WP2 — the numbered notes a schedule prints with its grid
// ("NOTES: 1. PROVIDE VFD FOR EACH FAN. 2. …"), and the attribute values
// they state for the rows that cite them.
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. Both surfaces hold the sheet's
// text spans (mcp/src/pdf.ts textSpans; the browser's pdf.js text layer) —
// the same spans the sheet graph is built from, in the same image-px space
// as a table's region — and what a schedule's notes say about a unit (a VFD,
// a BACnet interface, the glycol in its loop) is schedule truth.
//
// Where the notes are: a "NOTES:" label just past the table's last row, in
// the table's own reading frame (a sheet drawn at a quarter turn runs its
// text down the page, so "below" is a different device direction), then the
// lines that follow it without a gap, split at their note numbers. Nothing
// is read from a note except a small set of formulaic statements; anything
// else stays in the note.

export interface NoteSpan { str: string; x0: number; y0: number; x1: number; y1: number; rot?: number }
export type Box = [number, number, number, number];
export interface ScheduleNote { id: string; text: string }

/** Device box → reading-frame box [u0, v0, u1, v1] for text at `rot`
 * (degrees clockwise in device space, y down): u runs along the text, v down
 * the page as the text reads. */
export function frameBox([x0, y0, x1, y1]: Box, rot: number): Box {
  switch (((rot % 360) + 360) % 360) {
    case 90: return [y0, -x1, y1, -x0];
    case 180: return [-x1, -y1, -x0, -y0];
    case 270: return [-y1, x0, -y0, x1];
    default: return [x0, y0, x1, y1];
  }
}

const NOTES_LABEL = /^(?:(?:(?:GENERAL|SCHEDULE|KEYED)\s+)?NOTES?\s*:?|REMARKS\s*:)$/i;
const NOTE_NUMBER = /^\s*(?:\(?\s*(\d{1,2}|[A-Z])\s*[.)]|NOTE\s+(\d{1,2}|[A-Z])\s*[:.-])(?:\s+|$)/i;
/** The heading of a list printed beside the notes that is not notes
 * (alternate makes): a line of its own that ends in the word. A note's own
 * text that names makers ("1. APPROVED ALTERNATE MANUFACTURERS: B&G, …")
 * follows its number on the line, so it is no heading. */
const OTHER_LIST = /\bMANUFACTURERS?\s*:?\s*$/i;

interface Framed { box: Box; str: string }

/** The numbered notes printed with a table (`region`, the sheet graph's
 * table region, same space as the spans; `spans` may be the whole page's).
 * The region often contains the notes block itself. The block starts at a
 * NOTES label below the table's header band — at its left edge, or else a
 * "NOTES:" within its width — and runs until a gap; its notes may be set in
 * several columns, and neither a list of alternate manufacturers beside them
 * nor a legend to their left is part of it. Empty when the table prints none. */
export function scheduleNotes(spans: readonly NoteSpan[], region: Box): ScheduleNote[] {
  // The table's reading rotation: the one most of its own text runs at.
  const inside = spans.filter((s) => s.x0 >= region[0] - 1 && s.x1 <= region[2] + 1 && s.y0 >= region[1] - 1 && s.y1 <= region[3] + 1);
  const count = new Map<number, number>();
  for (const s of inside) count.set(s.rot ?? 0, (count.get(s.rot ?? 0) ?? 0) + 1);
  const rot = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const framed: Framed[] = spans.filter((s) => (s.rot ?? 0) === rot).map((s) => ({ box: frameBox([s.x0, s.y0, s.x1, s.y1], rot), str: s.str.trim() })).filter((s) => s.str);
  const [ru0, rv0, ru1, rv1] = frameBox(region, rot);
  const heights = framed.filter((s) => s.box[0] >= ru0 && s.box[2] <= ru1 && s.box[1] >= rv0 && s.box[3] <= rv1).map((s) => s.box[3] - s.box[1]).sort((a, b) => a - b);
  const lineH = heights.length ? heights[Math.floor(heights.length / 2)] : 8;
  const width = ru1 - ru0;
  const height = rv1 - rv0;

  // The label: a NOTES word below the table's header band (a NOTES column
  // header sits in that band) and no further than a few lines past its last
  // row. One at the table's left edge is the label; failing that, one within
  // the table's width that ends in a colon (the left edge may hold a legend).
  const labels = framed.filter((s) => {
    const first = s.str.split(/\s+(?=\d{1,2}[.)]|\(\d{1,2}\))/)[0];
    return NOTES_LABEL.test(first) && s.box[0] >= ru0 - 3 * lineH && s.box[0] <= ru1 - 0.1 * width
      && s.box[1] >= rv0 + Math.min(0.2 * height, 6 * lineH) && s.box[1] <= rv1 + 6 * lineH;
  }).sort((a, b) => a.box[1] - b.box[1]);
  let label = labels.find((s) => s.box[0] <= ru0 + 0.2 * width)
    ?? labels.find((s) => /:/.test(s.str.split(/\s+(?=\d{1,2}[.)]|\(\d{1,2}\))/)[0]));
  // No label: a numbered list printed inside the table at its left edge ("1.
  // AHU TO HAVE …", "2. MOUNT AHU …" between the title and the header band) is
  // the table's notes. Its first two notes are prose on consecutive lines at
  // one indent; the list reads as if a label sat just above note 1, and a
  // wider gap than a wrapped line's ends it (the header band or the rows).
  let unlabeled = false;
  if (!label) {
    const numbered = (s: Framed, id: string) => new RegExp(`^\\s*${id}\\s*[.)]\\s+\\S+(?:\\s+\\S+){2,}`).test(s.str);
    const first = framed
      .filter((one) => numbered(one, "1") && one.box[0] >= ru0 - 3 * lineH && one.box[0] <= ru0 + 0.2 * width
        && one.box[1] >= rv0 && one.box[3] <= rv1 + 6 * lineH
        && framed.some((two) => numbered(two, "2") && Math.abs(two.box[0] - one.box[0]) <= lineH
          && two.box[1] > one.box[1] && two.box[1] - one.box[3] <= 1.6 * lineH))
      .sort((a, b) => a.box[1] - b.box[1])[0];
    if (first) {
      label = { box: [first.box[0], first.box[1] - 1.2 * lineH, first.box[0] + lineH, first.box[1] - 0.2 * lineH], str: "NOTES:" };
      unlabeled = true;
    }
  }
  if (!label) return [];

  // One list: the block under a label, its notes, and the label of a second
  // list printed directly under it.
  const listAt = (label: Framed): { notes: ScheduleNote[]; next: Framed | null } => {
    // The block: everything from the label down, from the label's column to
    // the table's right edge, until a vertical gap; a list of makers beside the
    // notes ends the block's width where its heading starts.
    const followsNumber = (s: Framed) => NOTE_NUMBER.test(s.str) || framed.some((m) => m !== s && NOTE_NUMBER.test(m.str)
      && Math.abs((m.box[1] + m.box[3]) / 2 - (s.box[1] + s.box[3]) / 2) <= 0.5 * lineH && m.box[2] <= s.box[0] + 1 && s.box[0] - m.box[2] <= 4 * lineH);
    let stopU = ru1 + 3 * lineH;
    const candidates = framed
      .filter((s) => s !== label && s.box[1] >= label.box[1] - 0.5 * lineH && s.box[0] >= label.box[0] - 3 * lineH && s.box[0] < stopU)
      .sort((a, b) => a.box[1] - b.box[1]);
    let block: Framed[] = [];
    let next: Framed | null = null;
    const labelRest = label.str.replace(/^\s*(?:(?:(?:GENERAL|SCHEDULE|KEYED)\s+)?NOTES?\s*:?|REMARKS\s*:)\s*/i, "");
    if (labelRest) block.push({ box: [label.box[0] + 1, label.box[1], label.box[2], label.box[3]], str: labelRest });
    let bottom = label.box[3];
    // Another table's title ends the block when it sits over the notes; one
    // beside them (a table to their right) is only skipped.
    const overlapsBlock = (s: Framed) => {
      const all = [label, ...block];
      return s.box[0] < Math.max(...all.map((b) => b.box[2])) && s.box[2] > Math.min(...all.map((b) => b.box[0]));
    };
    for (const s of candidates) {
      if (s.box[0] >= stopU) continue;
      // A gap ends the block; the label's own may sit a little apart from its
      // list's first line. An unlabeled list inside the table ends at any gap
      // wider than a wrapped line's.
      if (s.box[1] - bottom > (unlabeled ? 1.6 : block.length ? 2.5 : 4) * lineH) break;
      // Another notes label ends the block when it sits over the notes; one
      // beside them (the next table's REMARKS: to their right) only ends the
      // block's width where it starts.
      if (NOTES_LABEL.test(s.str)) {
        // A second list printed under this one ("GENERAL NOTES: A. B." then
        // "NOTES: 1.") is read after it.
        if (overlapsBlock(s)) { next = s; break; }
        stopU = Math.min(stopU, s.box[0] - lineH);
        block = block.filter((b) => b.box[0] < stopU);
        continue;
      }
      if (/\bSCHEDULE\s*$/i.test(s.str)) {
        if (overlapsBlock(s)) break;
        continue;
      }
      if (OTHER_LIST.test(s.str) && !followsNumber(s) && s.box[0] > label.box[0]) {
        stopU = s.box[0] - lineH;
        block = block.filter((b) => b.box[0] < stopU);
        continue;
      }
      block.push(s);
      bottom = Math.max(bottom, s.box[3]);
    }

    // The list's numbers are set in one style, the first number's ("1.",
    // "(1)", "A."); a number in another style inside a note ("(2) VARIABLE
    // FREQUENCY DRIVES" under "2.1.3.") is the note's own sub-list, not a note.
    const styleOf = (str: string) => {
      const t = str.trim();
      return /^NOTE\s/i.test(t) ? "note" : /^\(/.test(t) ? "paren" : /^\d{1,2}\s*\)/.test(t) ? "num)" : /^\d/.test(t) ? "num." : /^[A-Z]\s*\)/i.test(t) ? "letter)" : "letter.";
    };
    const firstMarker = block.filter((s) => NOTE_NUMBER.test(s.str)).sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0])[0];
    const style = firstMarker ? styleOf(firstMarker.str) : null;
    // Columns start where note numbers start; every span joins the column
    // whose start is the last one at or left of it.
    const isMarker = (s: Framed) => NOTE_NUMBER.test(s.str) && styleOf(s.str) === style;
    const starts: number[] = [];
    for (const s of block.filter(isMarker).sort((a, b) => a.box[0] - b.box[0])) {
      if (!starts.length || s.box[0] - starts[starts.length - 1] > 3 * lineH) starts.push(s.box[0]);
    }
    // An unlabeled list is one column: its first number's.
    if (unlabeled && firstMarker) starts.splice(0, starts.length, ...starts.filter((u) => Math.abs(u - firstMarker.box[0]) <= 3 * lineH).slice(0, 1));
    if (!starts.length) return { notes: [], next };
    // A span left of the first column (a legend beside the notes) is in none.
    const columnOf = (s: Framed) => {
      let c = -1;
      for (let i = 0; i < starts.length; i++) if (starts[i] <= s.box[0] + 1.5 * lineH) c = i;
      return c;
    };
    const columns: Array<Array<{ id: string; text: string }>> = starts.map(() => []);
    const byColumn = new Map<number, Framed[]>();
    for (const s of block) {
      const c = columnOf(s);
      if (c < 0) continue;
      if (!byColumn.has(c)) byColumn.set(c, []);
      byColumn.get(c)!.push(s);
    }
    const mid = (s: Framed) => (s.box[1] + s.box[3]) / 2;
    for (const [c, ss] of byColumn) {
      // Reading order within a column: line by line, left to right. A line's
      // text starts at the column's number or an indent (a sub-list's) and
      // runs without a wide gap; what sits past a gap on the same line (a
      // table beside the notes) is not note text.
      ss.sort((a, b) => mid(a) - mid(b));
      const lines: Framed[][] = [];
      for (const s of ss) {
        const line = lines[lines.length - 1];
        if (line && mid(s) - mid(line[0]) <= 0.5 * lineH) line.push(s);
        else lines.push([s]);
      }
      const read: Framed[] = [];
      for (const line of lines) {
        line.sort((a, b) => a.box[0] - b.box[0]);
        // An unlabeled list is prose at its left edge: a line that starts
        // away from it, or that is set in cells (a table's title, header or
        // row beside or below the notes), ends it.
        if (unlabeled) {
          const startsAway = line[0].box[0] > starts[c] + 3 * lineH || line[0].box[0] < starts[c] - lineH;
          const cells = line.some((s, i) => i > 0 && s.box[0] - line[i - 1].box[2] > 2.5 * lineH);
          if (startsAway || cells) break;
        }
        let edge = starts[c] + 12 * lineH;
        for (const s of line) {
          if (s.box[0] > edge) break;
          read.push(s);
          edge = s.box[2] + (unlabeled ? 2.5 : 4) * lineH;
        }
      }
      let expected = 1;
      for (const s of read) {
        const m = isMarker(s) ? s.str.match(NOTE_NUMBER) : null;
        // An unlabeled list counts up from 1: a number out of turn (another
        // list's) ends it.
        if (m && unlabeled) {
          if ((m[1] ?? m[2]) !== String(expected)) break;
          expected++;
        }
        if (m) columns[c].push({ id: (m[1] ?? m[2]).toUpperCase(), text: s.str.slice(m[0].length).trim() });
        else if (columns[c].length) {
          const last = columns[c][columns[c].length - 1];
          last.text = `${last.text} ${s.str}`.trim();
        }
      }
    }
    // One numbered list: a later column that restarts at 1 is another list.
    const notes: ScheduleNote[] = [];
    for (const col of columns) {
      if (notes.length && col[0]?.id === "1") break;
      for (const n of col) if (n.text && !notes.some((x) => x.id === n.id)) notes.push(n);
    }
    return { notes, next };
  };
  const first = listAt(label);
  const notes = first.notes;
  if (first.next) for (const n of listAt(first.next).notes) if (!notes.some((x) => x.id === n.id)) notes.push(n);
  return notes;
}

/** The notes a row's own REMARKS / NOTES cell cites: named numbers ("SEE
 * NOTES 1, 2", "2,4", "1-3"), every note ("SEE NOTES", "ALL"), or null
 * when the cell cites none. */
export function citedNoteIds(text: string): { all: boolean; ids: string[] } | null {
  const t = String(text ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/^ALL(?:\s+NOTES)?$/.test(t)) return { all: true, ids: [] };
  const m = t.match(/\bNOTES?\s+((?:\d{1,2}|[A-Z])(?:\s*(?:,|&|AND|-|THRU|THROUGH)\s*(?:\d{1,2}|[A-Z]))*)\b/) ?? t.match(/^((?:\d{1,2})(?:\s*(?:,|&|-)\s*\d{1,2})*)$/);
  if (m) {
    const ids: string[] = [];
    for (const part of m[1].split(/\s*(?:,|&|AND)\s*/)) {
      const r = part.match(/^(\d{1,2})\s*(?:-|THRU|THROUGH)\s*(\d{1,2})$/);
      if (r && Number(r[1]) < Number(r[2]) && Number(r[2]) - Number(r[1]) < 20) for (let i = Number(r[1]); i <= Number(r[2]); i++) ids.push(String(i));
      else ids.push(part.trim());
    }
    return { all: false, ids: ids.filter(Boolean) };
  }
  if (/\bSEE\s+(?:ALL\s+)?NOTES?\b|\bSEE\s+SCHEDULE\s+NOTES\b/.test(t)) return { all: true, ids: [] };
  return null;
}

export interface NoteValue { attr: string; value: string | number; noteId: string; rule: string }

/** The water system a sentence opens with ("CHILLED WATER SYSTEM IS 40%
 * PROPYLENE GLYCOL", "HOT WATER SYSTEM IS WATER ONLY"): a test on a row's
 * SERVICE / SYSTEM text, or null when it names none. */
function sentenceSystem(sentence: string): RegExp | null {
  const m = sentence.trim().match(/^(?:THE\s+)?(CHILLED\s+WATER|CHW|HOT\s+WATER|HEATING\s+WATER|HH?W|CONDENSER\s+WATER|CDW|SNOW\s*-?\s*MELT)\s+(?:SYSTEMS?|LOOPS?|PIPING)\b/);
  if (!m) return null;
  const w = m[1].replace(/\s+/g, " ");
  if (/^(?:CHILLED WATER|CHW)$/.test(w)) return /\bCHILLED\b|\bCHWS?\b/;
  if (/^(?:HOT WATER|HEATING WATER|HH?W)$/.test(w)) return /\bHOT\s+WATER\b|\bHEATING\s+WATER\b|\bHH?WS?\b/;
  if (/^(?:CONDENSER WATER|CDW)$/.test(w)) return /\bCONDENSER\b|\bCDWS?\b/;
  return /\bSNOW\s*-?\s*MELT/;
}

const DRIVE_WORDS = /\b(?:VFDS?|VSDS?|VARIABLE\s+(?:FREQUENCY|SPEED)\s+DRIVES?)\b/;
const EC_MOTOR = /\bECMS?\b|\bEC\s+MOTORS?\b|\bELECTRONICALLY\s+COMMUTATED\b/;
/** A motor rated for a drive: "VFD RATED MOTOR", "VARIABLE FREQUENCY DRIVE
 * RATED", "INVERTER DUTY MOTOR", "VFD COMPATIBLE". */
const DRIVE_RATED = /\b(?:(?:VFDS?|VSDS?|VARIABLE\s+(?:FREQUENCY|SPEED)\s+DRIVES?)\s*-?\s*(?:RATED|DUTY|COMPATIBLE|READY)|INVERTER\s*-?\s*(?:DUTY|RATED))\b/;
const DRIVE_RATED_ALL = new RegExp(DRIVE_RATED.source, "g");

/** Whether a note rates the unit's motor for a drive ("PROVIDE PUMP WITH
 * VARIABLE FREQUENCY DRIVE RATED MOTOR", "INVERTER DUTY MOTOR"): built to run
 * on a VFD, which alone does not say one runs it. */
export function motorRatedForDrive(text: string): boolean {
  return DRIVE_RATED.test(String(text ?? "").toUpperCase().replace(/\s+/g, " "));
}

/** Whether a note calls the unit's fan or pump variable speed ("VARIABLE
 * SPEED, DIRECT DRIVE SUPPLY FAN"): not a compressor, and not a drive's own
 * name. */
export function variableSpeed(text: string): boolean {
  return String(text ?? "").toUpperCase().replace(/\s+/g, " ").split(/[.;]/)
    .some((s) => /\bVARIABLE\s*-?\s*SPEED\b(?!\s+(?:DRIVES?|COMPRESSORS?|SCROLL)\b)/.test(s) && !/\bCOMPRESSORS?\b/.test(s));
}

/** Whether a sentence offers an EC motor and a drive as alternatives ("PROVIDE
 * FANS WITH EC MOTORS (MOTOR MOUNTED) OR VARIABLE FREQUENCY DRIVES"): each
 * unit has one or the other, so it states neither for a unit. */
export function ecmOrDrive(sentence: string): boolean {
  const s = String(sentence ?? "").toUpperCase().replace(/\s+/g, " ");
  const ec = s.search(EC_MOTOR);
  const drive = s.search(DRIVE_WORDS);
  if (ec < 0 || drive < 0) return false;
  return /\bOR\b/.test(s.slice(Math.min(ec, drive), Math.max(ec, drive)));
}

/** What a note states, in the few forms that are unambiguous. `attrs` is
 * the family's attribute set; nothing is returned for an attribute outside it.
 * `service` is the row's SERVICE / SYSTEM text, when it prints one: a
 * sentence that opens with a water system speaks for rows of that system
 * only. */
export function noteValues(note: ScheduleNote, attrs: ReadonlySet<string>, service: string | null = null): NoteValue[] {
  const t = note.text.toUpperCase().replace(/\s+/g, " ");
  const out: NoteValue[] = [];
  const put = (attr: string, value: string | number, rule: string) => { if (attrs.has(attr)) out.push({ attr, value, noteId: note.id, rule }); };
  const negated = (word: string) => new RegExp(`\\b(?:NO|WITHOUT|NOT|NON)\\b[^.;]*${word}`).test(t);
  // A VFD the unit's fan or motor runs on: not a compressor's own drive
  // ("VARIABLE SPEED COMPRESSOR WITH FACTORY VFD"), not a motor rated for one
  // ("VFD RATED MOTOR", "INVERTER DUTY MOTOR": built to run on a drive, which
  // says a drive runs it only beside a variable-speed statement), and not
  // one offered as the alternative to an EC motor ("EC MOTORS OR VARIABLE
  // FREQUENCY DRIVES": each unit has one or the other, which the row names).
  const sentences = t.split(/[.;]/);
  const plain = sentences.filter((sentence) => !ecmOrDrive(sentence));
  const drives = plain.filter((sentence) => DRIVE_WORDS.test(sentence.replace(DRIVE_RATED_ALL, " ")));
  const fanDrive = drives.some((sentence) => !/\bCOMPRESSORS?\b/.test(sentence) || /\b(?:FANS?|BLOWERS?|MOTORS?)\b/.test(sentence));
  if (fanDrive && !negated("(?:VFD|VSD|VARIABLE)")) put("vfd", "yes", "note.vfd");
  else if (motorRatedForDrive(t) && variableSpeed(t)) put("vfd", "yes", "note.drive_rated_variable_speed");
  if (plain.some((sentence) => EC_MOTOR.test(sentence)) && !negated("(?:ECM|EC MOTOR)")) put("ecm", "yes", "note.ecm");
  // "PROVIDE 3-SPEED EC MOTOR", "THREE SPEED FAN SWITCH": the speeds the
  // unit's fan runs at (never a compressor's, and a speed controller is no
  // count).
  for (const sentence of sentences) {
    const sp = sentence.match(/\b(\d|TWO|THREE|FOUR)\s*-?\s*SPEED\b(?!\s+(?:DRIVES?|CONTROLL?(?:ER)?S?)\b)/);
    if (!sp || /\bCOMPRESSORS?\b/.test(sentence) || !/\b(?:MOTORS?|FANS?|BLOWERS?|SWITCH(?:ES)?)\b/.test(sentence)) continue;
    const n = ({ TWO: 2, THREE: 3, FOUR: 4 } as Record<string, number>)[sp[1]] ?? Number(sp[1]);
    if (n >= 2 && n <= 6) { put("fan_speeds", n, "note.fan_speeds"); break; }
  }
  // An existing system counts only as what the unit is connected to
  // ("CONNECT TO EXISTING BMS"), not one that merely gains points.
  // Then, in order: BACnet with the variant it names (MS/TP, IP); LonWorks;
  // Modbus; a hardwired interface; a named one ("PROVIDE BMS GATEWAY
  // INTERFACE", "PROVIDE WITH ABB INTERFACE"); an existing system the unit
  // connects to; the system its controller interfaces with ("INTERFACE WITH
  // BUILDING AUTOMATION SYSTEM"). A component connected to a BAS ("… AIR
  // PURIFICATION SYSTEM. CONNECT TO BAS") is not the unit's interface. A
  // central controller the units connect to ("CONNECT ALL INDOOR UNITS TO A
  // CENTRAL AE-200A CONTROLLER") is last. BACnet spelled BACKNET is BACnet.
  const bacnet = t.match(/\bBACK?NET\b(?:\s*[-/]?\s*(MS\s*\/\s*TP|MSTP|IP)\b)?/);
  const named = t.match(/\bPROVIDE\s+(?:WITH\s+)?(?:AN?\s+)?((?:[A-Z0-9&]+\s+){0,2}[A-Z0-9&]+)\s+INTERFACE\b/);
  const namedOk = named && !/^(?:(?:COMMUNICATIONS?|NETWORK|CONTROLS?|FACTORY|INSTALLED|MOUNTED|FIELD|UNIT|SYSTEM|THE|OPERATOR|USER)\s*)+$/.test(named[1]);
  const existing = t.match(/\b(?:CONNECT(?:ED|ION)?|INTERFACE[DS]?|INTEGRATE[DS]?|INTEGRATION|TIED?|COMMUNICATES?|COMMUNICATION)\b[^.;]*?\b(?:TO|INTO|WITH)\s+(?:THE\s+)?(EXISTING\s+(?:BMS|BAS|EMS|EMCS|DDC))\b/);
  const interfaced = t.match(/\bINTERFACE[DS]?\s+WITH\s+(?:THE\s+)?(BMS|BAS|EMS|EMCS|DDC(?:\s+SYSTEM)?|BUILDING\s+(?:AUTOMATION|MANAGEMENT)\s+SYSTEM)\b/);
  const central = t.match(/\bCONNECT(?:ED)?\b[^.;]*?\bTO\s+(?:AN?\s+|THE\s+)?(?:(?:SINGLE|COMMON|ONE)\s+)?(CENTRAL\s+(?:[A-Z0-9]+(?:\s*-\s*[A-Z0-9]+)*\s+){0,3}CONTROLLER)\b/);
  const bas = bacnet ? (bacnet[1] ? `BACNET ${bacnet[1].replace(/\s+/g, "")}` : "BACNET") : /\bLONWORKS\b/.test(t) ? "LONWORKS" : /\bMODBUS\b/.test(t) ? "MODBUS"
    : /\bHARD\s*-?\s*WIRED?\s+INTERFACE\b/.test(t) ? "HARDWIRE" : namedOk ? named![1] : existing?.[1] ?? interfaced?.[1]
    ?? (central ? central[1].replace(/\s*-\s*/g, "-").replace(/\s+/g, " ") : null);
  if (bas) put("bas_interface", bas, "note.bas_interface");
  // The loop's glycol, by sentence: one that opens with a water system
  // speaks for that system's rows only.
  const glycols: Array<{ value: number; rule: string }> = [];
  for (const sentence of t.split(/\.(?:\s+|$)|;/)) {
    const scope = sentenceSystem(sentence);
    if (scope && !(service && scope.test(service.toUpperCase()))) continue;
    const g = sentence.match(/\b(\d{1,2})\s*%\s*(?:(?:PROPYLENE|ETHYLENE)\s+)?GLYCOL\b/) ?? sentence.match(/\b(\d{1,2})\s*%\s*(?:PG|EG)\b/);
    if (g) glycols.push({ value: Number(g[1]), rule: "note.glycol" });
    else if (/\b100\s*%\s*WATER\b|\bWATER\s+ONLY\b|\bPLAIN\s+WATER\b/.test(sentence)) glycols.push({ value: 0, rule: "note.plain_water" });
  }
  if (glycols.length && new Set(glycols.map((g) => g.value)).size === 1) put("glycol_pct", glycols[0].value, glycols[0].rule);
  if (/\bECONOMIZERS?\b/.test(t) && !negated("ECONOMIZER")) put("economizer", /\bWATER\s*-?\s*SIDE\b/.test(t) ? "waterside" : "airside", "note.economizer");
  if (/\bGAS[- ]FIRED\b|\b(?:NATURAL\s+)?GAS\b[^.;]*\b(?:FURNACE|BURNER|HEAT\s+EXCHANGER)\b|\bINDIRECT[- ]FIRED\b/.test(t)) put("heating_type", "gas", "note.gas_heat");
  const merv = [...t.matchAll(/\b(PRE-?\s?FILTERS?\s+)?MERV\s*-?\s*(\d{1,2})\b(\s+PRE-?\s?FILTERS?)?/g)]
    .filter((m) => !m[1] && !m[3]).map((m) => Number(m[2]));
  if (merv.length) put("filter_merv", Math.max(...merv), "note.final_filter");
  const controls = controlItems(note.text);
  if (controls.length) put("control", controls.join("; "), "note.control");
  // "100% OSA UNIT": the outdoor air share of the supply; never a mode's
  // ("100% OUTDOOR AIR EMERGENCY EPIDEMIC MODE", a smoke purge), which is
  // not the design minimum.
  const oa = sentences.map((sentence) => ({ sentence, m: sentence.match(/\b(\d{1,3})\s*%\s*(?:OSA|OA|O\.A\.|OUTSIDE\s+AIR|OUTDOOR\s+AIR)\b/) }))
    .find((x) => x.m && !/\b(?:MODE|EMERGENCY|EPIDEMIC|PANDEMIC|SMOKE|PURGE|FLUSH|ECONOMIZER|ECONOMIZING)\b/.test(x.sentence))?.m;
  if (oa && Number(oa[1]) <= 100) put("outdoor_air_pct", Number(oa[1]), "note.outdoor_air_pct");
  // "WITH STATIC PLATE ENERGY RECOVERY", "ENTHALPY WHEEL TYPE": the type of
  // energy recovery the unit has.
  for (const sentence of t.split(/\.(?:\s+|$)|;/)) {
    if (!/\b(?:ENERGY|HEAT)\s+RECOVERY\b|\b(?:ENTHALPY|ENERGY|HEAT|TOTAL\s+ENERGY)\s+WHEEL\b/.test(sentence) || /\b(?:NO|WITHOUT|NOT)\b/.test(sentence)) continue;
    const kind = /\bWHEEL\b/.test(sentence) ? "wheel" : /\bPLATE\b/.test(sentence) ? "plate" : /\bHEAT\s+PIPE\b/.test(sentence) ? "heat_pipe" : /\bRUN\s*-?\s*AROUND\b/.test(sentence) ? "runaround" : null;
    if (kind) { put("energy_recovery", kind, "note.energy_recovery"); break; }
  }
  // "PROVIDE MINIMUM 8-ROW COOLING COILS AND 1-ROW HEATING COILS": a coil's
  // rows (the normalizer keeps them where the row prints that coil's water).
  for (const m of t.matchAll(/\b(\d{1,2})\s*-?\s*ROWS?\s+(COOLING|CHILLED\s+WATER|CHW|HEATING|HOT\s+WATER|HW|PREHEAT|REHEAT)\s+COILS?\b/g)) {
    put(/^(?:COOLING|CHILLED|CHW)/.test(m[2]) ? "chw_rows" : "hw_rows", Number(m[1]), "note.coil_rows");
  }
  return out;
}

const CONTROL_DEVICE = /\b(?:SWITCH|SPEED\s+CONTROL(?:LER)?|THERMOSTAT|TWO\s+SPEED)\b/;

/** The control devices a note provides, each as printed: its sentences, then
 * the items of a "PROVIDE UNIT WITH A, B, C" list, keeping the ones that
 * name a switch, speed control or thermostat. A disconnect switch is power,
 * not control. */
export function controlItems(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.toUpperCase().replace(/\s+/g, " ").split(/\.(?:\s+|$)|;/)) {
    // "INTERLOCK FAN WITH SMOKE CONTROL PANEL LOCATED IN …": what the unit is
    // interlocked with, without where that is or what the interlock does.
    const lock = sentence.trim().match(/^INTERLOCK(?:ED)?\b(?:\s+[A-Z0-9'&-]+){0,3}?\s+WITH\s+(.+)$/);
    if (lock) {
      const what = lock[1].replace(/\s+(?:LOCATED|TO|UPON|FOR|SO\s+THAT|WHEN|DURING)\b.*$/, "").trim();
      if (what) out.push(`INTERLOCK WITH ${what}`);
      continue;
    }
    if (!CONTROL_DEVICE.test(sentence)) continue;
    const body = sentence.trim().replace(/^PROVIDE\s+(?:(?:EACH\s+|THE\s+)?(?:UNIT|FAN)S?\s+WITH\s+)?/, "");
    // List items: commas outside parentheses.
    const items: string[] = [];
    let depth = 0, cur = "";
    for (const ch of body) {
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) { items.push(cur); cur = ""; } else cur += ch;
    }
    items.push(cur);
    for (let item of items) {
      item = item.trim().replace(/^(?:AND|&)\s+/, "");
      // "INTEGRAL FAN SPEED CONTROLLER AND BIRD SCREEN": the list's last two
      // items, joined; the one naming no control device is another item.
      const parts = item.split(/\s+(?:AND|&)\s+/);
      if (parts.length > 1 && parts.some((p) => CONTROL_DEVICE.test(p)) && parts.some((p) => !CONTROL_DEVICE.test(p))) {
        item = parts.filter((p) => CONTROL_DEVICE.test(p)).join(" AND ");
      }
      if (!CONTROL_DEVICE.test(item) || /\bDISCONNECT\b/.test(item)) continue;
      // "UNIT SHALL TURN ON WITH LOCAL SWITCH": the device after its WITH.
      const withAt = item.lastIndexOf(" WITH ");
      if (withAt >= 0 && CONTROL_DEVICE.test(item.slice(withAt + 6)) && !CONTROL_DEVICE.test(item.slice(0, withAt))) item = item.slice(withAt + 6);
      // "SPEED CONTROLLER FOR AIR FLOW BALANCING": the device, not its purpose.
      const purpose = item.search(/\s+FOR\s/);
      if (purpose > 0 && CONTROL_DEVICE.test(item.slice(0, purpose))) item = item.slice(0, purpose);
      if (item) out.push(item.trim());
    }
  }
  return out;
}

/** The note a header cites for its codes ("CONTROLLER/ STARTER TYPE (NOTE C)"),
 * read as a legend: the sheet's note of that id ("C. CONTROLLER STARTER TYPE:"),
 * confirmed by sharing words with the header, and its "CODE = MEANING" lines
 * ("FV = FULL VOLTAGE") up to the next note. Null when the header cites no
 * note, or no note on the sheet both carries the id and names the column. */
export function citedCodeLegend(spans: readonly NoteSpan[], header: string): Record<string, string> | null {
  const cite = header.match(/\(\s*NOTE\s+([A-Z]|\d{1,2})\s*\)\s*$/i);
  if (!cite) return null;
  const id = cite[1].toUpperCase();
  // The header's own words, after its group: the leaf the note explains.
  const words = (t: string) => new Set(t.toUpperCase().replace(/\(\s*NOTE\s+\w+\s*\)/g, " ").split(/[^A-Z]+/).filter((w) => w.length >= 3));
  const leaf = words(header.slice(0, cite.index));
  const upright = spans.filter((s) => !s.rot).map((s) => ({ ...s, str: s.str.trim() })).filter((s) => s.str);
  const markerRe = new RegExp(`^${id}\\.\\s+(.*)$`, "i");
  let best: { span: NoteSpan & { str: string }; shared: number } | null = null;
  for (const s of upright) {
    const m = s.str.match(markerRe);
    if (!m) continue;
    const shared = [...words(m[1])].filter((w) => leaf.has(w)).length;
    if (shared >= 2 && (!best || shared > best.shared)) best = { span: s, shared };
  }
  if (!best) return null;
  const top = best.span;
  const lineH = Math.max(1, top.y1 - top.y0);
  // The legend's lines: below the marker, in its column, until the next
  // lettered or numbered note or a gap.
  const below = upright
    .filter((s) => s !== top && s.y0 > top.y0 + 0.5 * lineH && Math.abs(s.x0 - top.x0) <= 3 * lineH)
    .sort((a, b) => a.y0 - b.y0);
  const codes: Record<string, string> = {};
  let last: string | null = null;
  let bottom = top.y1;
  for (const s of below) {
    if (s.y0 - bottom > 2.5 * lineH) break;
    if (/^(?:[A-Z]|\d{1,2})\.\s+\S/.test(s.str)) break;
    const d = s.str.match(/^([A-Z0-9][A-Z0-9/&.-]{0,9})\s*[=:–—-]\s*(\S.*)$/i);
    if (d) {
      last = d[1].toUpperCase();
      codes[last] = d[2].replace(/\.\s*$/, "").trim();
    } else if (last) {
      // A definition wrapped onto the next line.
      codes[last] = `${codes[last]} ${s.str.replace(/\.\s*$/, "").trim()}`;
    }
    bottom = Math.max(bottom, s.y1);
  }
  return Object.keys(codes).length ? codes : null;
}

const LEGEND_LABEL = /^(?:[A-Z][A-Z.]*\s+){0,3}LEGEND\s*:?$/i;
const LEGEND_CODE = /^[A-Z0-9][A-Z0-9/&.]{0,7}$/i;

/** The legend printed with a table ("COMPONENTS LEGEND": "PF - PREFILTER",
 * "HF - ELECTRIC HUMIDIFIER SECTION"), as code → meaning. Its label sits where
 * a notes label would (below the header band, across the table's width, no
 * further than a few lines past the last row); its lines pair a short code
 * with a meaning that starts with a dash or an equals sign, in one or more
 * columns, and a meaning may wrap onto the next line of its column. Empty
 * when the table prints none. */
export function scheduleLegend(spans: readonly NoteSpan[], region: Box): Record<string, string> {
  const inside = spans.filter((s) => s.x0 >= region[0] - 1 && s.x1 <= region[2] + 1 && s.y0 >= region[1] - 1 && s.y1 <= region[3] + 1);
  const count = new Map<number, number>();
  for (const s of inside) count.set(s.rot ?? 0, (count.get(s.rot ?? 0) ?? 0) + 1);
  const rot = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const framed: Framed[] = spans.filter((s) => (s.rot ?? 0) === rot).map((s) => ({ box: frameBox([s.x0, s.y0, s.x1, s.y1], rot), str: s.str.trim() })).filter((s) => s.str);
  const [ru0, rv0, ru1, rv1] = frameBox(region, rot);
  const heights = framed.filter((s) => s.box[0] >= ru0 && s.box[2] <= ru1 && s.box[1] >= rv0 && s.box[3] <= rv1).map((s) => s.box[3] - s.box[1]).sort((a, b) => a - b);
  const lineH = heights.length ? heights[Math.floor(heights.length / 2)] : 8;
  const height = rv1 - rv0;
  const label = framed
    .filter((s) => LEGEND_LABEL.test(s.str) && s.box[0] >= ru0 - 3 * lineH && s.box[0] <= ru1
      && s.box[1] >= rv0 + Math.min(0.2 * height, 6 * lineH) && s.box[1] <= rv1 + 6 * lineH)
    .sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0])[0];
  if (!label) return {};
  // Its width: to the table's right edge, or to a NOTES label beside it.
  const mid = (s: Framed) => (s.box[1] + s.box[3]) / 2;
  const right = Math.min(ru1 + 3 * lineH, ...framed
    .filter((s) => s !== label && NOTES_LABEL.test(s.str) && Math.abs(mid(s) - mid(label)) <= lineH && s.box[0] > label.box[2])
    .map((s) => s.box[0] - lineH));
  const candidates = framed
    .filter((s) => s !== label && s.box[1] > label.box[1] + 0.5 * lineH && s.box[0] >= label.box[0] - 3 * lineH && s.box[0] < right)
    .sort((a, b) => mid(a) - mid(b));
  const lines: Framed[][] = [];
  let bottom = label.box[3];
  for (const s of candidates) {
    if (s.box[1] - bottom > 2.5 * lineH) break;
    const line = lines[lines.length - 1];
    if (line && mid(s) - mid(line[0]) <= 0.5 * lineH) line.push(s);
    else lines.push([s]);
    bottom = Math.max(bottom, s.box[3]);
  }
  const legend: Record<string, string> = {};
  // The meaning columns seen so far: where each starts, and its last code.
  const columns: Array<{ u: number; code: string }> = [];
  for (const line of lines) {
    line.sort((a, b) => a.box[0] - b.box[0]);
    for (let i = 0; i < line.length; i++) {
      const s = line[i];
      const whole = s.str.match(/^([A-Z0-9][A-Z0-9/&.]{0,7})\s+[-=–—]\s*(\S.*)$/i);
      const next = line[i + 1];
      if (whole) {
        const code = whole[1].toUpperCase();
        legend[code] = whole[2].trim();
        columns.push({ u: s.box[0], code });
      } else if (LEGEND_CODE.test(s.str) && next && /^[-=–—]\s*\S/.test(next.str) && next.box[0] - s.box[2] <= 6 * lineH) {
        const code = s.str.toUpperCase();
        legend[code] = next.str.replace(/^[-=–—]\s*/, "").trim();
        const at = columns.findIndex((c) => Math.abs(c.u - next.box[0]) <= 2 * lineH);
        if (at >= 0) columns[at].code = code; else columns.push({ u: next.box[0], code });
        i++;
      } else {
        // A wrapped meaning: the column whose meaning starts nearest at or
        // left of it.
        const col = columns.filter((c) => c.u <= s.box[0] + 2 * lineH).sort((a, b) => b.u - a.u)[0];
        if (col) legend[col.code] = `${legend[col.code]} ${s.str}`.trim();
      }
    }
  }
  return legend;
}
