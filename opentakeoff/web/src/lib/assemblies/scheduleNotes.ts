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
function frameBox([x0, y0, x1, y1]: Box, rot: number): Box {
  switch (((rot % 360) + 360) % 360) {
    case 90: return [y0, -x1, y1, -x0];
    case 180: return [-x1, -y1, -x0, -y0];
    case 270: return [-y1, x0, -y0, x1];
    default: return [x0, y0, x1, y1];
  }
}

const NOTES_LABEL = /^(?:(?:GENERAL|SCHEDULE|KEYED)\s+)?NOTES?\s*:?$/i;
const NOTE_NUMBER = /^\s*(?:\(?\s*(\d{1,2}|[A-Z])\s*[.)]|NOTE\s+(\d{1,2}|[A-Z])\s*[:.-])(?:\s+|$)/i;
/** A list printed beside the notes that is not notes (alternate makes). */
const OTHER_LIST = /\bMANUFACTURERS?\s*:?$|\bALTERNATES?\b.*\bMANUFACTURERS?\b/i;

interface Framed { box: Box; str: string }

/** The numbered notes printed with a table (`region`, the sheet graph's
 * table region, same space as the spans). The region often contains the
 * notes block itself. The block starts at a NOTES label at the table's left
 * edge, below its header band, and runs until a gap; its notes may be set in
 * several columns, and a list of alternate manufacturers beside them is not
 * part of it. Empty when the table prints none. */
export function scheduleNotes(spans: readonly NoteSpan[], region: Box): ScheduleNote[] {
  // The table's reading rotation: the one most of its own text runs at.
  const inside = spans.filter((s) => s.x0 >= region[0] - 1 && s.x1 <= region[2] + 1 && s.y0 >= region[1] - 1 && s.y1 <= region[3] + 1);
  const count = new Map<number, number>();
  for (const s of inside) count.set(s.rot ?? 0, (count.get(s.rot ?? 0) ?? 0) + 1);
  const rot = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const framed: Framed[] = spans.filter((s) => (s.rot ?? 0) === rot).map((s) => ({ box: frameBox([s.x0, s.y0, s.x1, s.y1], rot), str: s.str.trim() })).filter((s) => s.str);
  const [ru0, rv0, ru1, rv1] = frameBox(region, rot);
  const heights = framed.filter((s) => s.box[1] >= rv0 && s.box[3] <= rv1).map((s) => s.box[3] - s.box[1]).sort((a, b) => a - b);
  const lineH = heights.length ? heights[Math.floor(heights.length / 2)] : 8;
  const width = ru1 - ru0;
  const height = rv1 - rv0;

  // The label: a NOTES word at the table's left edge, below its header band
  // (a NOTES column header sits in that band, and to the right).
  const label = framed
    .filter((s) => {
      const first = s.str.split(/\s+(?=\d{1,2}[.)]|\(\d{1,2}\))/)[0];
      return NOTES_LABEL.test(first) && s.box[0] >= ru0 - 0.1 * width - 3 * lineH && s.box[0] <= ru0 + 0.2 * width
        && s.box[1] >= rv0 + Math.min(0.2 * height, 6 * lineH) && s.box[1] <= rv1 + 6 * lineH;
    })
    .sort((a, b) => a.box[1] - b.box[1])[0];
  if (!label) return [];

  // The block: everything from the label down, left of any list of makers,
  // until a vertical gap.
  const stopU = Math.min(ru1 + 3 * lineH, ...framed
    .filter((s) => OTHER_LIST.test(s.str) && s.box[1] >= label.box[1] - lineH && s.box[0] > label.box[0])
    .map((s) => s.box[0] - lineH));
  const candidates = framed
    .filter((s) => s !== label && s.box[1] >= label.box[1] - 0.5 * lineH && s.box[0] >= ru0 - 0.1 * width - 3 * lineH && s.box[0] < stopU)
    .sort((a, b) => a.box[1] - b.box[1]);
  const block: Framed[] = [];
  const labelRest = label.str.replace(/^\s*(?:(?:GENERAL|SCHEDULE|KEYED)\s+)?NOTES?\s*:?\s*/i, "");
  if (labelRest) block.push({ box: [label.box[0] + 1, label.box[1], label.box[2], label.box[3]], str: labelRest });
  let bottom = label.box[3];
  for (const s of candidates) {
    if (s.box[1] - bottom > 2.5 * lineH) break;
    if (/\bSCHEDULE\s*$/i.test(s.str) || NOTES_LABEL.test(s.str)) break;
    block.push(s);
    bottom = Math.max(bottom, s.box[3]);
  }

  // Columns start where note numbers start; every span joins the column
  // whose start is the last one at or left of it.
  const isMarker = (s: Framed) => NOTE_NUMBER.test(s.str);
  const starts: number[] = [];
  for (const s of block.filter(isMarker).sort((a, b) => a.box[0] - b.box[0])) {
    if (!starts.length || s.box[0] - starts[starts.length - 1] > 3 * lineH) starts.push(s.box[0]);
  }
  if (!starts.length) return [];
  const columnOf = (s: Framed) => {
    let c = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= s.box[0] + 1.5 * lineH) c = i;
    return c;
  };
  const columns: Array<Array<{ id: string; text: string }>> = starts.map(() => []);
  const byColumn = new Map<number, Framed[]>();
  for (const s of block) {
    const c = columnOf(s);
    if (!byColumn.has(c)) byColumn.set(c, []);
    byColumn.get(c)!.push(s);
  }
  for (const [c, ss] of byColumn) {
    // Reading order within a column: line by line, left to right.
    ss.sort((a, b) => {
      const dv = (a.box[1] + a.box[3]) / 2 - (b.box[1] + b.box[3]) / 2;
      return Math.abs(dv) <= 0.5 * lineH ? a.box[0] - b.box[0] : dv;
    });
    for (const s of ss) {
      const m = s.str.match(NOTE_NUMBER);
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

/** What a note states, in the few forms that are unambiguous. `attrs` is
 * the family's attribute set; nothing is returned for an attribute outside it. */
export function noteValues(note: ScheduleNote, attrs: ReadonlySet<string>): NoteValue[] {
  const t = note.text.toUpperCase().replace(/\s+/g, " ");
  const out: NoteValue[] = [];
  const put = (attr: string, value: string | number, rule: string) => { if (attrs.has(attr)) out.push({ attr, value, noteId: note.id, rule }); };
  const negated = (word: string) => new RegExp(`\\b(?:NO|WITHOUT|NOT|NON)\\b[^.;]*${word}`).test(t);
  // A VFD the unit's fan or motor runs on: not a compressor's own drive
  // ("VARIABLE SPEED COMPRESSOR WITH FACTORY VFD"). An inverter-duty motor is
  // one built to run on a VFD.
  const drives = t.split(/[.;]/).filter((sentence) => /\b(?:VFDS?|VSDS?|VARIABLE\s+(?:FREQUENCY|SPEED)\s+DRIVES?)\b/.test(sentence));
  const fanDrive = drives.some((sentence) => !/\bCOMPRESSORS?\b/.test(sentence) || /\b(?:FANS?|BLOWERS?|MOTORS?)\b/.test(sentence));
  if (fanDrive && !negated("(?:VFD|VSD|VARIABLE)")) put("vfd", "yes", "note.vfd");
  else if (/\bINVERTER\s*-?\s*DUTY\s+MOTORS?\b/.test(t)) put("vfd", "yes", "note.inverter_duty_motor");
  if (/\bECMS?\b|\bEC\s+MOTORS?\b|\bELECTRONICALLY\s+COMMUTATED\b/.test(t) && !negated("(?:ECM|EC MOTOR)")) put("ecm", "yes", "note.ecm");
  const bas = /\bBACNET\b/.test(t) ? "BACNET" : /\bLONWORKS\b/.test(t) ? "LONWORKS" : /\bMODBUS\b/.test(t) ? "MODBUS"
    : (t.match(/\bEXISTING\s+(BMS|BAS|EMS|EMCS|DDC)\b/)?.[0] ?? (/\bHARD\s*-?\s*WIRED?\s+INTERFACE\b/.test(t) ? "HARDWIRE" : null));
  if (bas) put("bas_interface", bas, "note.bas_interface");
  const glycol = t.match(/\b(\d{1,2})\s*%\s*(?:(?:PROPYLENE|ETHYLENE)\s+)?GLYCOL\b/) ?? t.match(/\b(\d{1,2})\s*%\s*(?:PG|EG)\b/);
  if (glycol) put("glycol_pct", Number(glycol[1]), "note.glycol");
  else if (/\b100\s*%\s*WATER\b/.test(t)) put("glycol_pct", 0, "note.plain_water");
  if (/\bECONOMIZERS?\b/.test(t) && !negated("ECONOMIZER")) put("economizer", /\bWATER\s*-?\s*SIDE\b/.test(t) ? "waterside" : "airside", "note.economizer");
  if (/\bGAS[- ]FIRED\b|\b(?:NATURAL\s+)?GAS\b[^.;]*\b(?:FURNACE|BURNER|HEAT\s+EXCHANGER)\b|\bINDIRECT[- ]FIRED\b/.test(t)) put("heating_type", "gas", "note.gas_heat");
  const merv = [...t.matchAll(/\b(PRE-?\s?FILTERS?\s+)?MERV\s*-?\s*(\d{1,2})\b(\s+PRE-?\s?FILTERS?)?/g)]
    .filter((m) => !m[1] && !m[3]).map((m) => Number(m[2]));
  if (merv.length) put("filter_merv", Math.max(...merv), "note.final_filter");
  if (/\b(?:SWITCH|SPEED\s+CONTROL(?:LER)?|THERMOSTAT|TWO\s+SPEED)\b/.test(t)) {
    put("control", note.text.replace(/^\s*PROVIDE\s+/i, "").replace(/\.\s*$/, "").trim(), "note.control");
  }
  return out;
}
