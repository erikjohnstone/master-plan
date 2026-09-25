// CONTROL INTENT goal, WP3.2 — reader R1: the text model on a unit's
// packets (decisions C6, C7, C11; LAWS CI2, CI3).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The request and the check of its
// reply are the same on every surface; only the transport is injected
// (runs.ts), and every call is recorded and replayed.
//
// What the model sees: the unit (its tags, its kind, its schedule's title and
// type), the text of each packet bound to it as numbered paragraphs
// (readers/text.ts: sentences whole, columns apart), and closed questions:
// its BAS role, and each undecided option of its typical as the library
// defines it. What it returns: per question one answer from the closed set
// and 1–3 quotes copied from the paragraphs; for a role, also the clause
// whose subject does the controlling.
//
// The reply is checked, never trusted (basSequenceAi's pattern: a strict
// schema, then an exact-text gate):
//   · every quote must be printed in the paragraph it names (spacing aside);
//   · an option's "yes" quote must name the device (the term list's mention
//     words, traps removed); a "no" quote the device or its alternative;
//   · a role answer needs its subject quote, printed;
//   · an option read as absent while the paragraphs mention the device (the
//     term list's mention, traps aside) is not an absence: it reads as
//     not_shown;
// An answer that fails is kept as UNVERIFIED (combine.ts: it can only leave
// the question unresolved). Nothing here decides anything.
import type { ModelRequest } from "../runs";
import { replyJson } from "../runs";
import type { BoundPacket, DrawingCite, ReaderAnswer } from "./r0";
import { citeLines } from "./r0";
import type { ReadingQuestion } from "./questions";
import type { TermList } from "./terms";
import { normText, printedIn, squeeze } from "./text";

export const R1_PROMPT_VERSION = "control_r1_v3";
export const R1_MODEL = "gpt-oss-120b";

/** The unit(s) a request asks about: tags that share every bound packet. */
export interface ReadUnit {
  tags: string[];
  family: string;
  /** The schedule the unit is printed in, and what its row says it is. */
  schedule: string;
  description?: string;
}

const FAMILY_WORDS: Record<string, string> = {
  AHU: "air handling unit", RTU: "rooftop unit", DOAS: "dedicated outdoor air unit", FCU: "fan coil unit", FURNACE: "furnace",
  VAV: "VAV terminal unit", FAN: "fan", PUMP: "pump", BOILER: "boiler", AIR_COOLED_CHILLER: "air-cooled chiller",
  UNIT_HEATER: "unit heater", CABINET_UNIT_HEATER: "cabinet unit heater", HUMIDIFIER: "humidifier", ERV: "energy recovery ventilator",
  HEAT_EXCHANGER: "heat exchanger", COOLING_TOWER: "cooling tower", CONDENSING_UNIT: "condensing unit",
};
export const familyWords = (f: string): string => FAMILY_WORDS[f] ?? f.toLowerCase().replace(/_/g, " ");

export const R1_SYSTEM_PROMPT = [
  "You read the printed text of HVAC control drawings for a construction estimator.",
  "You get the text of the control drawings bound to one scheduled unit (sequences of operation, control schematics, points lists) as numbered paragraphs, and closed questions about that unit.",
  "Answer every question only from these paragraphs. Text about other equipment in the same drawing does not answer a question about this unit.",
  "Each packet says why it applies to this unit (applies_because): a typical detail drawn for one unit of this kind, its title naming that unit as the example, applies to this unit as well.",
  "Schematic labels are short texts from a drawing; their positions are not given, so never infer that two labels are connected unless the text says so.",
  "Quotes must be copied exactly, character for character, from the paragraph you name, and must show the answer. Use 1 to 3 quotes.",
  "For a role answer other than not_shown, subject_quote is the clause whose subject does the controlling (for example 'THE DDC CONTROLLER SHALL START THE FAN', 'THE LOCAL THERMOSTAT WILL CYCLE THE HEATER'), copied exactly; otherwise subject_quote is null.",
  "Answer absent only when the device is not mentioned anywhere in the paragraphs; answer not_shown when the text mentions it or related things but does not decide it for this unit. absent and not_shown take no quotes.",
  "Do not guess. A wrong answer costs more than not_shown.",
].join(" ");

const QUOTE = { type: "object", additionalProperties: false, properties: { paragraph: { type: "string" }, text: { type: "string" } }, required: ["paragraph", "text"] };

/** The reply schema for a set of question ids. */
export function r1Schema(questionIds: readonly string[]): unknown {
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
            quotes: { type: "array", items: QUOTE },
            subject_quote: { anyOf: [{ type: "null" }, QUOTE] },
          },
          required: ["question", "answer", "quotes", "subject_quote"],
        },
      },
    },
    required: ["answers"],
  };
}

/** The library label's alternative: "Modulating heating valve (otherwise
 * 2-position)" → "2-position". */
const alternativeOf = (label: string | undefined) => label?.match(/\(otherwise ([^)]+)\)/i)?.[1] ?? null;

/** The questions as the model reads them. */
export function questionTexts(unit: ReadUnit, questions: readonly ReadingQuestion[]): Array<Record<string, unknown>> {
  const who = unit.tags.join(", ");
  return questions.map((q) => {
    if (q.kind === "role") {
      return {
        id: q.id,
        question: `What does the building automation system (BAS, DDC, BMS, EMCS) do with ${who}?`,
        answers: {
          commands: "the BAS (its DDC controller, the BMS, FMCS or EMCS) starts or stops, enables or disables, stages or modulates the unit or its own valve, damper or speed: its sequence has the BAS do so, or the BAS has output points on the unit (start/stop, enable, command, speed or valve signal). subject_quote: the clause in which the BAS or its controller does it",
          monitors_only: "the BAS has only inputs from the unit (its status, temperature or alarms) and no output to it; something else turns it on and off or modulates it: its own or a local thermostat or controller (even where the sequence spells out what that thermostat sends), the manufacturer's controls, a wall switch, or equipment it is interlocked with (for example a boiler that enables its own pump). subject_quote: the clause in which that other thing does it",
          not_connected: "nothing connects the unit to the BAS: the text says it is standalone or not controlled or monitored by the BAS, or its own or a local thermostat or controls run it and the text gives the BAS no point on it at all. subject_quote: the clause that says so, or in which the local control does it",
          not_shown: "the text does not say",
        },
      };
    }
    const alt = alternativeOf(q.label);
    return {
      id: q.id,
      question: `Does ${who} have this: ${q.label}? What to look for: ${q.device}.`,
      answers: {
        yes: "the text says so for this unit (quote it)",
        no: alt ? `the text prints the alternative for this unit instead: ${alt} (quote it)` : "the text says this unit does not have it (quote it)",
        absent: "the device is not mentioned anywhere in the paragraphs",
        not_shown: "it, or related things, are mentioned, but the text does not decide it for this unit",
      },
    };
  });
}

export interface R1Prepared {
  req: ModelRequest;
  summary: Record<string, unknown>;
  /** Paragraph id → the packet and paragraph it names. */
  index: Map<string, { bp: BoundPacket; paragraph: { id: string; text: string; lines: string[] } }>;
}

const EXAMPLE_TAG = /\b[A-Z]{1,5}\s?-\s?\d{1,3}[A-Z]?\b/g;

/** Why a bound packet applies to the unit, in the model's words (the
 * binding's kind; binding.ts decided it, the model is told, not asked). */
export function appliesBecause(bp: BoundPacket, unit: ReadUnit): string {
  const own = new Set(unit.tags.map((t) => squeeze(t)));
  const named = `${bp.packet.title} ${bp.packet.subtitle ?? ""}`.toUpperCase().match(EXAMPLE_TAG) ?? [];
  const example = named.some((t) => !own.has(squeeze(t)));
  switch (bp.binding.kind) {
    case "tag": case "list_range": return "its title names this unit";
    case "cross_reference": return "this unit's schedule row refers to it";
    case "tag_body": return "this unit's tag is printed in it";
    case "sibling": return "it is about the same subject as a drawing titled for this unit, on the same sheet";
    case "component_of": return "it is the drawing of the unit this one serves or belongs to";
    default: return example ? "it is the typical control detail for this unit's kind of equipment; its title names another unit of this kind as the example" : "it is the typical control detail for this unit's kind of equipment";
  }
}

/** Characters of packet text one request carries at most. */
const MAX_CHARS = 90_000;

/** The request for one group of units. */
export function r1Request(unit: ReadUnit, bound: readonly BoundPacket[], questions: readonly ReadingQuestion[], model = R1_MODEL): R1Prepared {
  const index: R1Prepared["index"] = new Map();
  const packets: Array<Record<string, unknown>> = [];
  let chars = 0;
  // Text an earlier packet on the same sheet already carries (a sequence
  // heading's block inside its sheet's own packet) is sent once.
  const sent: Array<{ sheet: string; region: readonly number[] }> = [];
  bound.forEach((bp, k) => {
    const paragraphs: Array<{ id: string; text: string }> = [];
    const earlier = sent.filter((x) => x.sheet === bp.packet.sheet);
    const boxOf = new Map(bp.text.lines.map((l) => [l.id, l.box]));
    for (const pg of bp.text.paragraphs) {
      if (squeeze(pg.text).length < 2) continue;
      const boxes = pg.lines.map((id) => boxOf.get(id)).filter((b): b is NonNullable<typeof b> => Boolean(b));
      if (boxes.length && earlier.length) {
        const cx = boxes.reduce((s, b) => s + (b[0] + b[2]) / 2, 0) / boxes.length, cy = boxes.reduce((s, b) => s + (b[1] + b[3]) / 2, 0) / boxes.length;
        if (earlier.some(({ region: r }) => cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3])) continue;
      }
      if (chars + pg.text.length > MAX_CHARS) break;
      const id = `K${k + 1}.${pg.id}`;
      index.set(id, { bp, paragraph: pg });
      paragraphs.push({ id, text: pg.text });
      chars += pg.text.length;
    }
    sent.push({ sheet: bp.packet.sheet, region: bp.packet.region });
    if (!paragraphs.length) return;
    packets.push({ id: `K${k + 1}`, title: bp.packet.title, ...(bp.packet.subtitle ? { subtitle: bp.packet.subtitle } : {}), kind: bp.packet.kind, applies_because: appliesBecause(bp, unit), paragraphs });
  });
  const payload = {
    unit: { tags: unit.tags, kind: familyWords(unit.family), schedule: unit.schedule, ...(unit.description ? { described_as: unit.description } : {}) },
    packets,
    questions: questionTexts(unit, questions),
  };
  const req: ModelRequest = {
    model,
    messages: [{ role: "system", content: R1_SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(payload) }],
    response_format: { type: "json_schema", json_schema: { name: "control_reading", strict: true, schema: r1Schema(questions.map((q) => q.id)) } },
    temperature: 0,
    max_completion_tokens: 16_000,
    reasoning_effort: "medium",
  };
  const summary = { units: unit.tags, family: unit.family, packets: bound.map((b) => b.packet.id), questions: questions.map((q) => q.id) };
  return { req, summary, index };
}

interface RawQuote { paragraph?: unknown; text?: unknown }
interface RawAnswer { question?: unknown; answer?: unknown; quotes?: unknown; subject_quote?: unknown }

const ROLE = new Set(["commands", "monitors_only", "not_connected", "not_shown"]);
const OPTION = new Set(["yes", "no", "absent", "not_shown"]);

/** Check a reply: per question, the answer with its verified quotes as cites,
 * or UNVERIFIED (note "unverified") with why. A question the reply leaves
 * out is not answered. */
export function r1Answers(content: string | null, prepared: R1Prepared, questions: readonly ReadingQuestion[], terms: TermList): ReaderAnswer[] {
  const json = replyJson(content) as { answers?: RawAnswer[] } | null;
  const out: ReaderAnswer[] = [];
  const seen = new Set<string>();
  for (const a of Array.isArray(json?.answers) ? json!.answers : []) {
    const q = questions.find((x) => x.id === a.question);
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);
    const answer = String(a.answer ?? "");
    const fail = (why: string): ReaderAnswer => ({ reader: "r1", question: q.id, answer: (ROLE.has(answer) || OPTION.has(answer) ? answer : "not_shown") as ReaderAnswer["answer"], rule: `r1.${R1_PROMPT_VERSION}`, cites: [], note: "unverified", why });
    if (q.kind === "role" ? !ROLE.has(answer) : !OPTION.has(answer)) { out.push(fail(`"${answer}" is not an answer to this question`)); continue; }
    if (answer === "absent" && q.kind === "option") {
      // "Absent" is "not mentioned anywhere in the paragraphs": a mention of
      // the device in them (the term list's, traps aside) says otherwise.
      const t = terms.options[q.option!];
      const hit = t ? [...prepared.index.values()].find(({ paragraph }) => t.mention.some((p) => p.re.test(untrap(normText(paragraph.text), t.traps)))) : undefined;
      if (hit) { out.push({ reader: "r1", question: q.id, answer: "not_shown", rule: `r1.${R1_PROMPT_VERSION}`, cites: [], why: `read as absent, but the paragraphs mention it: "${hit.paragraph.text.slice(0, 120)}"` }); continue; }
    }
    if (answer === "not_shown" || answer === "absent") { out.push({ reader: "r1", question: q.id, answer: answer as ReaderAnswer["answer"], rule: `r1.${R1_PROMPT_VERSION}`, cites: [] }); continue; }
    const verify = (x: RawQuote): DrawingCite | null => {
      const hit = prepared.index.get(String(x?.paragraph ?? ""));
      const text = String(x?.text ?? "");
      if (!hit || squeeze(text).length < 6 || !printedIn(text, hit.paragraph.text)) return null;
      return citeLines(hit.bp, hit.paragraph.lines, text);
    };
    const quotes = (Array.isArray(a.quotes) ? a.quotes : []).slice(0, 3) as RawQuote[];
    const cites = quotes.map(verify).filter((c): c is DrawingCite => Boolean(c));
    if (!cites.length) { out.push(fail("no quote is printed in the paragraph it names")); continue; }
    if (q.kind === "option") {
      const t = terms.options[q.option!];
      const said = (re: RegExp) => cites.some((c) => re.test(untrap(normText(c.text), t?.traps ?? [])));
      const namesDevice = t ? t.mention.some((p) => said(p.re)) : true;
      const namesAlternative = t ? t.no.some((p) => said(p.re)) : false;
      if (answer === "yes" && !namesDevice) { out.push(fail("the quotes do not name the device")); continue; }
      if (answer === "no" && !namesDevice && !namesAlternative) { out.push(fail("the quotes name neither the device nor its alternative")); continue; }
    } else {
      const subject = a.subject_quote ? verify(a.subject_quote as RawQuote) : null;
      if (!subject) { out.push(fail("the role's subject quote is missing or not printed")); continue; }
      // "commands" is the BAS's own act: its subject clause names the BAS or
      // its controller, never the unit's own thermostat or controls.
      if (answer === "commands" && (!BAS_SUBJECT.test(normText(subject.text)) || LOCAL_SUBJECT.test(normText(subject.text)))) { out.push(fail("the subject quote does not make the BAS the one commanding")); continue; }
      if (!cites.some((c) => c.packet === subject.packet && c.text === subject.text)) cites.push(subject);
    }
    out.push({ reader: "r1", question: q.id, answer: answer as ReaderAnswer["answer"], rule: `r1.${R1_PROMPT_VERSION}`, cites });
  }
  return out;
}

/** The BAS or its controller as a clause's subject. */
const BAS_SUBJECT = /\b(?:BAS|BMS|DDC|EMCS|EMS|FMCS|UMCS|BUILDING\s+(?:AUTOMATION|MANAGEMENT)|(?:UNIT\s+)?CONTROLLER|CONTROL\s+SYSTEM|OPERATOR'?S?\s+WORKSTATION)\b/;
/** A local actor: the unit's own thermostat or controls, its manufacturer. */
const LOCAL_SUBJECT = /\b(?:THERMOSTAT|T-?STAT|MANUFACTURER|WALL\s+SWITCH|INTEGRAL|LOCAL|PACKAGED|FACTORY)\b/;

const untrap = (text: string, traps: ReadonlyArray<{ re: RegExp }>) => {
  let t = text;
  for (const p of traps) t = t.replace(new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`), (m) => " ".repeat(m.length));
  return t;
};
