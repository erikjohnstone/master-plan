// CONTROL INTENT goal, WP3.1: the option term list (termlist/v1.json),
// loaded and checked.
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. R0 reads every surface's packets
// with these words, and R1/R2 are asked about the same devices, so a term
// list change changes readings everywhere at once (and is versioned: a
// saved project's pinned readings name the version they were read with,
// LAW CI6).
//
// The list is data. Loading it refuses an entry without a source, a source
// the list does not define, and a pattern that does not compile, so a bad
// edit fails at load (and in the tests), never silently at read time.
import TERMS from "../termlist/v1.json" with { type: "json" };

export interface TermPattern {
  id: string;
  re: RegExp;
  sources: readonly string[];
  /** A role phrase R0 may apply alone (decision C8), where its clause's
   * subject is the unit. */
  whitelist?: boolean;
  /** For a whitelisted phrase: the clause must name its subject this way
   * (or name the unit's tag). */
  subject?: RegExp;
}

export interface OptionTerms {
  option: string;
  /** In words, what the readers look for (the questions R1 and R2 ask). */
  device: string;
  /** Any mention of the device: none in a unit's packets supports "absent". */
  mention: readonly TermPattern[];
  /** Text that looks like the device and is not it, removed before matching. */
  traps: readonly TermPattern[];
  /** The option is there. */
  yes: readonly TermPattern[];
  /** The library's own alternative is there ("otherwise 2-position"). */
  no: readonly TermPattern[];
  /** A callout printed beside a device in a drawing ("WIRE TO STARTER"):
   * it speaks for the device label nearest to it (readers/r0.ts). */
  callouts: ReadonlyArray<TermPattern & { value: "yes" | "no" }>;
}

export interface TermList {
  version: string;
  sources: Readonly<Record<string, string>>;
  role: {
    not_connected: readonly TermPattern[];
    local_control: readonly TermPattern[];
    /** The subject of a control act that is the BAS, by name. */
    bas_actor: readonly TermPattern[];
    /** The subject of a control act that is not the BAS: a thermostat, the
     * unit's own or its manufacturer's controls. */
    local_actor: readonly TermPattern[];
  };
  options: Readonly<Record<string, OptionTerms>>;
  /** Options that are one choice: at most one of them is true (two read
   * true leave both unresolved, combine.ts). */
  exclusive: ReadonlyArray<{ options: readonly string[]; why: string; sources: readonly string[] }>;
}

interface RawPattern { id: string; re: string; sources: string[]; whitelist?: boolean; subject?: string }

/** Compile and check a raw term list; throws on the first problem. */
export function compileTermList(raw: unknown): TermList {
  const r = raw as { version?: unknown; sources?: Record<string, string>; role?: Record<string, RawPattern[]>; options?: Record<string, Record<string, unknown>>; exclusive?: Array<{ options: string[]; why: string; sources: string[] }> };
  if (typeof r?.version !== "string" || !r.version) throw new Error("term list: no version");
  const sources = r.sources ?? {};
  const pattern = (where: string, p: RawPattern): TermPattern => {
    if (!p || typeof p.id !== "string" || typeof p.re !== "string") throw new Error(`term list ${where}: a pattern needs an id and a re`);
    if (!Array.isArray(p.sources) || !p.sources.length) throw new Error(`term list ${where}.${p.id}: no source`);
    for (const s of p.sources) if (!(s in sources)) throw new Error(`term list ${where}.${p.id}: unknown source "${s}"`);
    let re: RegExp;
    try { re = new RegExp(p.re); } catch (e) { throw new Error(`term list ${where}.${p.id}: ${(e as Error).message}`); }
    if (re.test("")) throw new Error(`term list ${where}.${p.id}: matches empty text`);
    return { id: p.id, re, sources: [...p.sources], ...(p.whitelist ? { whitelist: true } : {}), ...(p.subject ? { subject: new RegExp(p.subject) } : {}) };
  };
  const list = (where: string, ps: unknown): TermPattern[] => (Array.isArray(ps) ? ps : []).map((p) => pattern(where, p as RawPattern));
  const options: Record<string, OptionTerms> = {};
  for (const [option, o] of Object.entries(r.options ?? {})) {
    if (typeof o.device !== "string" || !o.device) throw new Error(`term list options.${option}: no device`);
    const entry: OptionTerms = {
      option,
      device: o.device,
      mention: list(`options.${option}.mention`, o.mention),
      traps: list(`options.${option}.traps`, o.traps),
      yes: list(`options.${option}.yes`, o.yes),
      no: list(`options.${option}.no`, o.no),
      callouts: (Array.isArray(o.callouts) ? o.callouts : []).map((c) => {
        const v = (c as { value?: unknown }).value;
        if (v !== "yes" && v !== "no") throw new Error(`term list options.${option}.callouts: value must be yes or no`);
        return { ...pattern(`options.${option}.callouts`, c as RawPattern), value: v };
      }),
    };
    if (!entry.mention.length || !entry.yes.length) throw new Error(`term list options.${option}: needs mention and yes patterns`);
    options[option] = entry;
  }
  const exclusive = (r.exclusive ?? []).map((g, i) => {
    if (!Array.isArray(g.options) || g.options.length < 2 || g.options.some((o) => !options[o])) throw new Error(`term list exclusive[${i}]: needs two or more listed options`);
    if (!Array.isArray(g.sources) || !g.sources.length || g.sources.some((x) => !(x in sources))) throw new Error(`term list exclusive[${i}]: needs known sources`);
    return { options: [...g.options], why: String(g.why ?? ""), sources: [...g.sources] };
  });
  return {
    version: r.version,
    sources,
    exclusive,
    role: {
      not_connected: list("role.not_connected", r.role?.not_connected),
      local_control: list("role.local_control", r.role?.local_control),
      bas_actor: list("role.bas_actor", r.role?.bas_actor),
      local_actor: list("role.local_actor", r.role?.local_actor),
    },
    options,
  };
}

/** The term list every surface reads (v1). */
export const TERM_LIST: TermList = compileTermList(TERMS);
