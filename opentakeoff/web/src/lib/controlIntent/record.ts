// CONTROL INTENT goal, WP3.6 — reading the control drawings of a project:
// the per-unit control-intent record apply consumes (decision C1).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The Takeoff panel, the MCP tools
// and the evals read a project's control drawings through this one function
// and apply what it decides through applyAssemblies(..., readings); only the
// transport (model calls) and the crop renderer are injected per surface.
//
// Steps:
//   1. apply the library without readings: each unit's record (its typical
//      and which options nobody decided) and its bound packets;
//   2. ask each unit its closed questions (readers/questions.ts);
//   3. read: R0 on every unit a packet is bound to; RP (the zone plan) on
//      every unit whose tag labels a zone; R1 once per group of units that
//      share every bound packet (and how it binds them) and question; R2
//      twice on each drawing of a group that shares every packet and question.
//      Every model call goes through the run store (runs.ts): replayed when
//      recorded, else called live when a transport is given, else skipped;
//   4. combine (combine.ts): applied, proposal, unresolved or none, per
//      question, with the readers and cites behind each.
// The result pins the runs it read (their hashes), so re-applying a saved
// project reads exactly the same (LAW CI6).
import { applyAssemblies, type CompiledProject } from "../assemblies/apply";
import type { Override, ProjectSettings } from "../assemblies/select";
import { selectAssembly } from "../assemblies/select";
import type { AssemblyDefinition } from "../assemblies/schema";
import { layersFor } from "../assemblies/select";
import { sha256Hex } from "../graphKeys.js";
import { COMBINE_VERSION, combineUnit, type Decision } from "./combine";
import { memoryRunStore, PENDING_IMAGE, recordedCall, RUNS_VERSION, type ModelRequest, type RunStore, type Transport } from "./runs";
import { QUESTIONS_VERSION, unitQuestions, type ReadingQuestion } from "./readers/questions";
import { headsOthers, namesUnit, ownPacket, R0_VERSION, readR0, TITLE_KINDS, type BoundPacket, type ReaderAnswer } from "./readers/r0";
import { R1_MODEL, R1_PROMPT_VERSION, r1Answers, r1Request, type ReadUnit } from "./readers/r1";
import { cropSpec, joinRun, R2_MODEL, R2_PROMPT_VERSION, r2PacketAnswers, r2Request, type CropRenderer } from "./readers/r2";
import { TERM_LIST, type TermList } from "./readers/terms";
import { normText, packetText, TEXT_VERSION, type PacketText } from "./readers/text";
import type { Packet } from "./evidence";
import { tagKey } from "./binding";
import type { Box } from "../assemblies/scheduleNotes";
import { ZONES_VERSION, type Zone, type ZonePlan } from "./zonePlan";

export const READING_VERSION = "control_reading_v1";

export interface UnitReading {
  item: number;
  tag: string;
  family: string;
  questions: ReadingQuestion[];
  answers: ReaderAnswer[];
  decisions: Decision[];
}

export interface CallCounts { replayed: number; live: number; not_recorded: number; failed: number; tokens: number; ms: number }

export interface ControlReadings {
  version: typeof READING_VERSION;
  versions: Record<string, string>;
  models: { r1: string | null; r2: string | null };
  units: UnitReading[];
  /** The runs read (their hashes): what a saved project pins. */
  runs: string[];
  calls: { r1: CallCounts; r2: CallCounts };
}

export interface ReadOptions {
  store?: RunStore;
  /** Live model calls; null or absent: replay recorded runs only. */
  transport?: Transport | null;
  /** Renders R2's crops; absent: R2 reads only what the store recorded. */
  render?: CropRenderer | null;
  readers?: { r1?: boolean; r2?: boolean };
  models?: { r1?: string; r2?: string };
  concurrency?: number;
  onProgress?: (msg: string) => void;
}

const counts = (): CallCounts => ({ replayed: 0, live: 0, not_recorded: 0, failed: 0, tokens: 0, ms: 0 });

async function pool<T>(items: readonly T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) { const x = items[i++]; await fn(x); }
  }));
}

const TYPE_HEADER = /\b(?:TYPE|DESCRIPTION|SERVICE|SERVES|SERVED|SERVING|UNIT\s+TYPE|EQUIPMENT|LOCATION|SYSTEM)\b/i;

/** Read a project's control drawings. */
export async function readControlIntent(input: {
  project: CompiledProject;
  library: readonly AssemblyDefinition[];
  settings?: ProjectSettings;
  overrides?: readonly Override[];
}, opts: ReadOptions = {}): Promise<ControlReadings> {
  const store = opts.store ?? memoryRunStore();
  const r1On = opts.readers?.r1 !== false;
  const r2On = opts.readers?.r2 !== false;
  const models = { r1: r1On ? opts.models?.r1 ?? R1_MODEL : null, r2: r2On ? opts.models?.r2 ?? R2_MODEL : null };
  const out: ControlReadings = {
    version: READING_VERSION,
    versions: { termlist: TERM_LIST.version, text: TEXT_VERSION, questions: QUESTIONS_VERSION, r0: R0_VERSION, r1: R1_PROMPT_VERSION, r2: R2_PROMPT_VERSION, zones: ZONES_VERSION, combine: COMBINE_VERSION, runs: RUNS_VERSION },
    models, units: [], runs: [], calls: { r1: counts(), r2: counts() },
  };
  // 1. The first apply: records and bindings.
  const first = applyAssemblies({ project: input.project, library: input.library, settings: input.settings, overrides: input.overrides });
  const packets = new Map<string, Packet>(first.control.packets.map((p) => [p.id, p]));
  // The units a title binds each packet to ("EXHAUST FAN (EF-1,2) SEQUENCE"
  // is EF-1's and EF-2's).
  const titledTo = new Map<string, Array<{ item: number; family: string }>>();
  for (const inst of first.instances) {
    for (const b of first.control.bindings[inst.item] ?? []) {
      if (TITLE_KINDS.has(b.kind) && !b.proposal) (titledTo.get(b.packet) ?? titledTo.set(b.packet, []).get(b.packet)!).push({ item: inst.item, family: inst.family });
    }
  }
  const texts = new Map<string, PacketText>();
  const textOf = (p: Packet) => texts.get(p.id) ?? texts.set(p.id, packetText(p)).get(p.id)!;
  type Unit = { reading: UnitReading; bound: BoundPacket[]; read: ReadUnit };
  const units: Unit[] = [];
  // The zones each scheduled tag labels on the set's zone plans.
  const zonesByTag = new Map<string, Array<{ plan: ZonePlan; zone: Zone }>>();
  for (const plan of input.project.control?.zones ?? []) {
    for (const zone of plan.zones) {
      const k = tagString(zone.tag);
      if (k) (zonesByTag.get(k) ?? zonesByTag.set(k, []).get(k)!).push({ plan, zone });
    }
  }
  for (const inst of first.instances) {
    const bindings = first.control.bindings[inst.item] ?? [];
    const zones = zonesByTag.get(tagString(inst.tag) ?? "") ?? [];
    if (!bindings.length && !zones.length) continue;
    const layer = layersFor(inst.family, input.library).includes("controls") ? "controls" : layersFor(inst.family, input.library)[0];
    const override = (input.overrides ?? []).find((o) => o.tag === inst.tag && (o.layer ?? layer) === layer);
    const app = selectAssembly(inst, input.library, input.settings ?? {}, override, layer);
    const questions = unitQuestions(app, input.library, TERM_LIST);
    if (!questions.length) continue;
    const bound = bindings.filter((b) => packets.has(b.packet)).map((b): BoundPacket => ({
      packet: packets.get(b.packet)!, text: textOf(packets.get(b.packet)!), binding: b,
      ...(!TITLE_KINDS.has(b.kind) && (titledTo.get(b.packet) ?? []).some((o) => o.item !== inst.item && o.family === inst.family) ? { othersTitled: true } : {}),
    }));
    const item = input.project.items[inst.item];
    const description = Object.entries(item?.cells ?? {}).filter(([h]) => TYPE_HEADER.test(h)).map(([h, c]) => [h, String(c?.text ?? "").trim()]).filter(([, v]) => v && v !== "-").map(([h, v]) => `${h}: ${v}`).join("; ");
    const answers = [...(bound.length ? readR0(inst, bound, questions, TERM_LIST) : []), ...zoneAnswers(zones, questions, TERM_LIST)];
    units.push({
      reading: { item: inst.item, tag: inst.tag, family: inst.family, questions, answers, decisions: [] },
      bound,
      read: { tags: [inst.tag], family: inst.family, schedule: item?.table_title ?? "", ...(description ? { description: description.slice(0, 200) } : {}) },
    });
  }
  // 2. Groups: units that share every bound packet and question read once;
  //    for R1 also every binding's kind (it is told why each packet applies).
  const groupsOf = (kinds: boolean): Unit[][] => {
    const groups = new Map<string, Unit[]>();
    for (const u of units) {
      const k = [u.read.family, u.read.schedule, u.bound.map((b) => (kinds ? `${b.packet.id}:${b.binding.kind}` : b.packet.id)).sort().join(","), u.reading.questions.map((q) => q.id).join(",")].join("|");
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(u);
    }
    return [...groups.values()];
  };
  const groupRead = (members: readonly Unit[]): ReadUnit => ({ ...members[0].read, tags: members.map((m) => m.reading.tag) });
  const runs = new Set<string>();
  const tally = (c: CallCounts, status: string, run: { usage?: { total_tokens?: number } | null; latency_ms?: number } | null) => {
    (c as unknown as Record<string, number>)[status] += 1;
    if (status === "live") { c.tokens += run?.usage?.total_tokens ?? 0; c.ms += run?.latency_ms ?? 0; }
  };
  const jobs: Array<() => Promise<void>> = [];
  for (const members of r1On ? groupsOf(true) : []) {
    const lead = members[0];
    if (!lead.bound.length) continue;
    const read = groupRead(members);
    const questions = lead.reading.questions;
    jobs.push(async () => {
      const prep = r1Request(read, lead.bound, questions, models.r1!);
      const res = await recordedCall(store, opts.transport ?? null, "r1", R1_PROMPT_VERSION, prep.req, prep.summary);
      tally(out.calls.r1, res.status, res.run);
      if (res.run && res.status !== "failed") runs.add(res.run.hash);
      if (res.content === null) return;
      const answers = r1Answers(res.content, prep, questions, TERM_LIST);
      for (const m of members) m.reading.answers.push(...answers.map((a) => attributed({ ...a, cites: a.cites.map((c) => ({ ...c })) }, m)));
    });
  }
  for (const members of r2On ? groupsOf(false) : []) {
    const lead = members[0];
    const read = groupRead(members);
    const questions = lead.reading.questions;
    const drawings = lead.bound.filter((b) => b.packet.kind !== "sequence");
    if (!drawings.length) continue;
    jobs.push(async () => {
      const perRun: Record<string, ReaderAnswer[][]> = { a: [], b: [] };
      for (const [run, dpi] of [["a", 200], ["b", 250]] as const) {
        for (const bp of drawings) {
          const spec = cropSpec(bp, dpi);
          const key = JSON.stringify({ spec, text: await sha256Hex(new TextEncoder().encode(bp.text.lines.map((l) => l.text).join("\n"))) });
          const prep = r2Request(read, bp, questions, PENDING_IMAGE, spec, run, models.r2!);
          const materialize = async (req: ModelRequest) => {
            const url = opts.render ? await opts.render(spec) : null;
            if (!url) return null;
            return { ...req, messages: req.messages.map((m) => (typeof m.content === "string" ? m : { ...m, content: m.content.map((p) => (p.type === "image_url" ? { type: "image_url" as const, image_url: { url } } : p)) })) } as ModelRequest;
          };
          const res = await recordedCall(store, opts.render ? opts.transport ?? null : null, "r2", R2_PROMPT_VERSION, prep.req, prep.summary, { imageKeys: [key], materialize });
          tally(out.calls.r2, res.status, res.run);
          if (res.run && res.status !== "failed") runs.add(res.run.hash);
          perRun[run].push(res.content === null ? [] : r2PacketAnswers(res.content, bp, questions, run, spec.dpi < 200, TERM_LIST));
        }
      }
      for (const run of ["a", "b"]) {
        if (perRun[run].every((xs) => !xs.length)) continue;
        const joined = joinRun(perRun[run], questions, run);
        for (const m of members) m.reading.answers.push(...joined.map((a) => attributed({ ...a }, m)));
      }
    });
  }
  // A model's evidence from drawings the unit shares with other units (a
  // system schematic its tag is printed in) speaks for it only where it
  // names it: its tag, its family's noun or its tag's words, or the heading
  // of the section it is in. Evidence that names no part of the unit is
  // about another one ("… TO THE LEAD HEATING WATER PUMP" read for a boiler
  // pump): UNVERIFIED for this unit.
  function attributed(a: ReaderAnswer, m: Unit): ReaderAnswer {
    if (a.note || !a.cites.length) return a;
    const all = m.bound.map((b) => b.binding);
    const bp = (id: string) => m.bound.find((b) => b.packet.id === id);
    // Evidence only from sections headed for other units of its kind ("…
    // (VAV-1-26 AND VAV-1-29) …") is theirs, in any packet.
    const headingOf = (c: ReaderAnswer["cites"][number]) => bp(c.packet)?.text.paragraphs.find((pg) => pg.lines.some((id) => c.lines.includes(id)))?.heading;
    const theirs = a.cites.filter((c) => { const h = headingOf(c); return Boolean(h && headsOthers(h, { tag: m.reading.tag })); });
    if (theirs.length === a.cites.length) return { ...a, note: "unverified", why: `its evidence is from a section headed for other units ("${String(headingOf(theirs[0])).slice(0, 80)}")` };
    const own = a.cites.some((c) => { const b = bp(c.packet); return Boolean(b && ownPacket(b.binding, all)); });
    if (own) return a;
    const unit = { tag: m.reading.tag, family: m.reading.family };
    const names = a.cites.some((c) => {
      const b = bp(c.packet);
      const tagOnly = Boolean(b?.othersTitled);
      if (namesUnit(normText(c.text), unit, tagOnly)) return true;
      const heading = b?.text.paragraphs.find((pg) => pg.lines.some((id) => c.lines.includes(id)))?.heading;
      return Boolean(heading && namesUnit(heading, unit, tagOnly));
    });
    return names ? a : { ...a, note: "unverified", why: `its evidence is from drawings ${m.reading.tag} shares with other units, and names no part of it` };
  }
  let done = 0;
  await pool(jobs, opts.concurrency ?? 4, async (job) => { await job(); done += 1; opts.onProgress?.(`read ${done}/${jobs.length}`); });
  // 4. Combine.
  for (const u of units) {
    u.reading.decisions = combineUnit({ questions: u.reading.questions, answers: u.reading.answers, bindings: u.bound.map((b) => b.binding) }, TERM_LIST);
    out.units.push(u.reading);
  }
  out.units.sort((a, b) => a.item - b.item);
  out.runs = [...runs].sort();
  return out;
}

const tagString = (tag: string): string | null => { const k = tagKey(tag); return k ? `${k.prefix}-${k.n}${k.suffix}` : null; };

const unionBox = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** The zone plan's answers for one unit: an option is there when a symbol
 * inside a zone the unit's tag labels is, whole, the option's device word
 * (the term list's mention: "CO2"). Only presence is read: a zone without
 * the symbol says nothing (a sensor may be shown elsewhere). */
export function zoneAnswers(zones: ReadonlyArray<{ plan: ZonePlan; zone: Zone }>, questions: readonly ReadingQuestion[], terms: TermList): ReaderAnswer[] {
  const out: ReaderAnswer[] = [];
  for (const q of questions) {
    if (q.kind !== "option") continue;
    const t = terms.options[q.option!];
    if (!t) continue;
    const whole = (text: string) => { const n = normText(text); return t.mention.some((p) => { const m = n.match(p.re); return Boolean(m && m[0].length === n.length); }); };
    const hits = zones.flatMap(({ plan, zone }) => zone.symbols.filter((s) => whole(s.text)).map((s) => ({ plan, zone, s })));
    if (!hits.length) continue;
    out.push({
      reader: "rp", question: q.id, answer: "yes", whitelisted: true, rule: `rp.${q.option}.symbol_in_zone`,
      cites: hits.slice(0, 3).map(({ plan, zone, s }) => ({ packet: `${plan.sheet}#zones`, sheet: plan.sheet, lines: [], text: `${s.text} in the zone ${zone.tag} labels ("${plan.title}")`, box: unionBox(s.box, zone.label) })),
    });
  }
  return out;
}

export { readingIntents } from "./combine";
