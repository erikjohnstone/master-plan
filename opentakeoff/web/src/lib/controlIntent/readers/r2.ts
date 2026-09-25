// CONTROL INTENT goal, WP3.3 — reader R2: the vision model on a crop of
// each drawing bound to a unit (decisions C7, C9, C11; LAW CI2).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The crop's spec, the request and
// the check of the reply are the same everywhere; only rendering the crop
// (the browser's canvas, MCP's PDF renderer) and the transport are injected.
//
// Per packet that is a drawing (a diagram, a detail, a points list or a
// controls sheet; a sequence is text, which R1 reads), per unit group:
//   · CROP: the packet's region, padded, at 200 dpi (run "a") and 250 dpi
//     (run "b": a second, different rendering, so the two runs are two
//     looks), turned so the packet's text reads upright. A region too large
//     for that resolution renders smaller and says so: its reading may show
//     what is drawn, never that something is not (C9).
//   · ASK: the same closed questions as R1, about the drawn unit.
//   · CHECK (CI2): every label an answer cites must be printed in the
//     packet (spacing aside); an answer resting on no printed label, other
//     than "absent" or "not shown", is UNVERIFIED. An option read as absent
//     while the drawing prints the device's name (the term list's mention,
//     traps aside) is not an absence: it reads as not_shown.
// Answers from a unit's several drawings are joined per run: an option is
// there if some drawing shows it and none shows its alternative, absent only
// if every drawing lacks it; a role is "commands" if any drawing has the BAS
// command the unit.
import type { Box } from "../../assemblies/scheduleNotes";
import type { ModelRequest } from "../runs";
import { replyJson } from "../runs";
import type { BoundPacket, DrawingCite, ReaderAnswer } from "./r0";
import type { ReadingQuestion } from "./questions";
import type { ReadUnit } from "./r1";
import { familyWords, questionTexts } from "./r1";
import type { TermList } from "./terms";
import { normText, printedIn, squeeze } from "./text";

export const R2_PROMPT_VERSION = "control_r2_v2";
export const R2_MODEL = "qwen-3.8-27b";

/** Span space is the page's viewport at sheets.ts RENDER_SCALE (2) px per
 * point, rotation applied: the sheet graph's convention (a test pins the
 * two equal; importing sheets.ts would load pdf.js into every reader). */
export const SPAN_PX_PER_PT = 2;
/** The long edge a crop may have. */
export const MAX_LONG_EDGE = 3200;

/** What to render: a region of a page (span space), at a resolution, turned
 * by `rotate` degrees counter-clockwise so its text reads upright. */
export interface CropSpec {
  sheet: string;
  region: Box;
  rotate: 0 | 90 | 180 | 270;
  dpi: number;
  /** The crop's long edge in pixels at that dpi. */
  long_edge: number;
  /** The dpi asked for, when the region was too large to reach it. */
  wanted_dpi?: number;
}

/** A packet's crop at `dpi`. */
export function cropSpec(bp: BoundPacket, dpi: number): CropSpec {
  const [x0, y0, x1, y1] = bp.packet.region;
  const pad = Math.max(6, 0.02 * Math.max(x1 - x0, y1 - y0));
  const region: Box = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  const counts = new Map<number, number>();
  for (const l of bp.text.lines) counts.set(l.rot, (counts.get(l.rot) ?? 0) + l.text.length);
  const rot = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const longPt = Math.max(region[2] - region[0], region[3] - region[1]) / SPAN_PX_PER_PT;
  const want = Math.round((longPt / 72) * dpi);
  const long_edge = Math.min(MAX_LONG_EDGE, want);
  const got = Math.round((long_edge / longPt) * 72);
  return { sheet: bp.packet.sheet, region, rotate: (((rot % 360) + 360) % 360) as CropSpec["rotate"], dpi: got, long_edge, ...(got < dpi ? { wanted_dpi: dpi } : {}) };
}

/** Renders a crop to a PNG data URL (injected per surface); null when the
 * page cannot be rendered. */
export type CropRenderer = (spec: CropSpec) => Promise<string | null>;

export const R2_PROMPT = (title: string, unit: ReadUnit) => [
  `This image is one control drawing from an HVAC construction set, titled "${title}". It is about ${unit.tags.join(", ")} (${familyWords(unit.family)}; schedule: ${unit.schedule}).`,
  "Answer every question only from what is drawn and printed in this image, about that unit. Devices drawn for other equipment do not count.",
  "For every answer other than absent and not_shown, give \"labels\": the exact printed texts in the image (tags, device labels, I/O labels such as 'BO - FAN START/STOP', notes) that show it, copied character for character. absent and not_shown take no labels.",
  "absent means the device is not drawn or labelled anywhere in the image; not_shown means it may be there but the image does not decide it. Do not guess: a wrong answer costs more than not_shown.",
].join(" ");

const LABELLED = { type: "array", items: { type: "string" } };

export function r2Schema(questionIds: readonly string[]): unknown {
  return {
    type: "object", additionalProperties: false,
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          properties: {
            question: { type: "string", enum: [...questionIds] },
            answer: { type: "string", enum: ["commands", "monitors_only", "not_connected", "yes", "no", "absent", "not_shown"] },
            labels: LABELLED,
          },
          required: ["question", "answer", "labels"],
        },
      },
    },
    required: ["answers"],
  };
}

export interface R2Prepared {
  req: ModelRequest;
  summary: Record<string, unknown>;
}

/** The request for one packet's crop. */
export function r2Request(unit: ReadUnit, bp: BoundPacket, questions: readonly ReadingQuestion[], image: string, spec: CropSpec, run: string, model = R2_MODEL): R2Prepared {
  const payload = { questions: questionTexts(unit, questions) };
  const req: ModelRequest = {
    model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `${R2_PROMPT(bp.packet.title, unit)}\n\n${JSON.stringify(payload)}` },
        { type: "image_url", image_url: { url: image } },
      ],
    }],
    response_format: { type: "json_schema", json_schema: { name: "control_drawing_reading", strict: true, schema: r2Schema(questions.map((q) => q.id)) } },
    temperature: 0,
    max_completion_tokens: 16_000,
  };
  return { req, summary: { units: unit.tags, family: unit.family, packet: bp.packet.id, run, crop: spec, questions: questions.map((q) => q.id) } };
}

const ROLE = new Set(["commands", "monitors_only", "not_connected", "not_shown"]);
const OPTION = new Set(["yes", "no", "absent", "not_shown"]);

/** Check one packet's reply: per question, the answer with its printed
 * labels as cites, or UNVERIFIED. `lowRes`: the crop is below 200 dpi, so an
 * "absent" is not taken (only "not_shown"). */
export function r2PacketAnswers(content: string | null, bp: BoundPacket, questions: readonly ReadingQuestion[], run: string, lowRes = false, terms?: TermList): ReaderAnswer[] {
  const json = replyJson(content) as { answers?: Array<{ question?: unknown; answer?: unknown; labels?: unknown }> } | null;
  const out: ReaderAnswer[] = [];
  const seen = new Set<string>();
  const texts = [...bp.text.paragraphs.map((p) => p.text), ...bp.text.lines.map((l) => l.text)];
  for (const a of Array.isArray(json?.answers) ? json!.answers : []) {
    const q = questions.find((x) => x.id === a.question);
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);
    let answer = String(a.answer ?? "");
    const base = { reader: "r2" as const, run, question: q.id, rule: `r2.${R2_PROMPT_VERSION}` };
    if (q.kind === "role" ? !ROLE.has(answer) : !OPTION.has(answer)) { out.push({ ...base, answer: "not_shown", cites: [], note: "unverified", why: `"${answer}" is not an answer to this question` }); continue; }
    if (answer === "absent" && lowRes) answer = "not_shown";
    if (answer === "absent" && q.kind === "option" && terms?.options[q.option!]) {
      const t = terms.options[q.option!];
      const label = bp.text.lines.find((l) => t.mention.some((p) => p.re.test(untrap(normText(l.text), t.traps))));
      if (label) { out.push({ ...base, answer: "not_shown", cites: [], why: `read as absent, but the drawing prints "${label.text.slice(0, 80)}"` }); continue; }
    }
    if (answer === "not_shown" || answer === "absent") { out.push({ ...base, answer: answer as ReaderAnswer["answer"], cites: [] }); continue; }
    const labels = (Array.isArray(a.labels) ? a.labels : []).map((x) => String(x ?? "")).filter((x) => squeeze(x).length >= 2).slice(0, 8);
    const cites: DrawingCite[] = [];
    for (const label of labels) {
      const line = bp.text.lines.find((l) => printedIn(label, l.text));
      const pg = line ? null : bp.text.paragraphs.find((p) => printedIn(label, p.text));
      const ids = line ? [line.id] : pg ? pg.lines : null;
      if (!ids) continue;
      const ls = bp.text.lines.filter((l) => ids.includes(l.id));
      const box = ls.map((l) => l.box).reduce((m, b) => [Math.min(m[0], b[0]), Math.min(m[1], b[1]), Math.max(m[2], b[2]), Math.max(m[3], b[3])] as Box);
      cites.push({ packet: bp.packet.id, sheet: bp.packet.sheet, lines: ids, text: label, box });
    }
    if (!cites.length || cites.length < Math.ceil(labels.length / 2)) {
      out.push({ ...base, answer: answer as ReaderAnswer["answer"], cites, note: "unverified", why: labels.length ? `labels not printed in the drawing: ${labels.filter((l) => !texts.some((t) => printedIn(l, t))).slice(0, 4).join(" | ")}` : "no label given" });
      continue;
    }
    out.push({ ...base, answer: answer as ReaderAnswer["answer"], cites });
  }
  return out;
}

const untrap = (text: string, traps: ReadonlyArray<{ re: RegExp }>) => {
  let t = text;
  for (const p of traps) t = t.replace(new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`), (m) => " ".repeat(m.length));
  return t;
};

/** Join one run's answers over a unit's drawings (see the header). */
export function joinRun(perPacket: ReadonlyArray<readonly ReaderAnswer[]>, questions: readonly ReadingQuestion[], run: string): ReaderAnswer[] {
  const out: ReaderAnswer[] = [];
  for (const q of questions) {
    const as = perPacket.map((xs) => xs.find((a) => a.question === q.id)).filter((a): a is ReaderAnswer => Boolean(a));
    if (!as.length) continue;
    const base = { reader: "r2" as const, run, question: q.id, rule: `r2.${R2_PROMPT_VERSION}` };
    const unverified = as.filter((a) => a.note === "unverified");
    if (unverified.length) { out.push({ ...base, answer: unverified[0].answer, cites: unverified.flatMap((a) => a.cites), note: "unverified", why: unverified[0].why }); continue; }
    const has = (v: string) => as.filter((a) => a.answer === v);
    const cites = (xs: readonly ReaderAnswer[]) => xs.flatMap((a) => a.cites);
    if (q.kind === "role") {
      const cmd = has("commands"), off = [...has("monitors_only"), ...has("not_connected")];
      if (cmd.length && off.length) out.push({ ...base, answer: "not_shown", cites: [...cites(cmd), ...cites(off)], why: "its drawings disagree" });
      else if (cmd.length) out.push({ ...base, answer: "commands", cites: cites(cmd) });
      else if (off.length) out.push({ ...base, answer: off[0].answer, cites: cites(off) });
      else out.push({ ...base, answer: "not_shown", cites: [] });
      continue;
    }
    const yes = has("yes"), no = has("no");
    if (yes.length && no.length) out.push({ ...base, answer: "not_shown", cites: [...cites(yes), ...cites(no)], why: "its drawings disagree" });
    else if (yes.length) out.push({ ...base, answer: "yes", cites: cites(yes) });
    else if (no.length) out.push({ ...base, answer: "no", cites: cites(no) });
    else if (as.length === perPacket.length && as.every((a) => a.answer === "absent")) out.push({ ...base, answer: "absent", cites: [] });
    else out.push({ ...base, answer: "not_shown", cites: [] });
  }
  return out;
}
