// ASSEMBLIES goal, WP3.2 — the expression language assemblies are written in
// (plan §8.2, decision D8): selectors, option conditions, line conditions,
// quantities and parameters.
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The UI and the MCP expand the same
// assemblies; a quantity must evaluate identically on both, so there is one
// parser and one evaluator.
//
// A small, safe, Excel-like language, parsed here and never passed to eval:
//   values     numbers, 'strings' or "strings", true, false,
//              attr.<name>, var.<name>, opt.<name>
//   operators  + - * /, unary -, = == != <> < <= > >=, and, or, not
//   functions  if(c, a, b), min(…), max(…), ceil(x), floor(x),
//              round(x[, digits]), known(ref)
//
// Unknown stays unknown (plan §8.1 A4): an attribute the drawing does not
// print evaluates to UNKNOWN, and UNKNOWN propagates through arithmetic and
// comparison. `and` is false when any side is false, `or` true when any side
// is true, whatever the other side; `known(attr.x)` is always true or false.
// An unknown result carries the references that made it unknown, so an
// unresolved line can say which attribute it waits for.

export type Value = number | string | boolean;

export type Node =
  | { t: "num"; v: number; at: number }
  | { t: "str"; v: string; at: number }
  | { t: "bool"; v: boolean; at: number }
  | { t: "ref"; scope: "attr" | "var" | "opt"; name: string; text: string; at: number }
  | { t: "unary"; op: "-" | "not"; arg: Node; at: number }
  | { t: "binary"; op: BinaryOp; left: Node; right: Node; at: number }
  | { t: "call"; fn: FnName; args: Node[]; at: number };

type BinaryOp = "+" | "-" | "*" | "/" | "=" | "!=" | "<" | "<=" | ">" | ">=" | "and" | "or";
type FnName = "if" | "min" | "max" | "ceil" | "floor" | "round" | "known";
const FUNCTIONS: Record<FnName, [number, number]> = {
  if: [3, 3], min: [1, Infinity], max: [1, Infinity], ceil: [1, 1], floor: [1, 1], round: [1, 2], known: [1, 1],
};

/** A malformed or ill-referenced expression: the message names the offending
 * token and its position in the source. */
export class ExprError extends Error {
  constructor(message: string, readonly source: string, readonly at: number) {
    super(`${message} at ${at + 1} in "${source}"`);
    this.name = "ExprError";
  }
}

// ── Tokens ──────────────────────────────────────────────────────────────────

type Token =
  | { k: "num"; v: number; at: number; text: string }
  | { k: "str"; v: string; at: number; text: string }
  | { k: "id"; v: string; at: number; text: string }
  | { k: "op"; v: string; at: number; text: string }
  | { k: "end"; at: number; text: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const at = i;
    if (/[0-9.]/.test(c)) {
      const m = src.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!m) throw new ExprError(`unexpected "${c}"`, src, at);
      out.push({ k: "num", v: Number(m[0]), at, text: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new ExprError("unterminated string", src, at);
      out.push({ k: "str", v: src.slice(i + 1, end), at, text: src.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/)!;
      out.push({ k: "id", v: m[0], at, text: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["==", "!=", "<>", "<=", ">="].includes(two)) {
      out.push({ k: "op", v: two, at, text: two });
      i += 2;
      continue;
    }
    if ("+-*/=<>(),".includes(c)) {
      out.push({ k: "op", v: c, at, text: c });
      i++;
      continue;
    }
    throw new ExprError(`unexpected "${c}"`, src, at);
  }
  out.push({ k: "end", at: src.length, text: "end of expression" });
  return out;
}

// ── Parser (precedence climbing) ────────────────────────────────────────────

/** Parse an expression. Throws ExprError naming the offending token. */
export function parseExpr(src: string): Node {
  const source = String(src ?? "");
  if (!source.trim()) throw new ExprError("empty expression", source, 0);
  const tokens = tokenize(source);
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (v: string) => peek().k === "op" && (peek() as { v: string }).v === v;
  const isWord = (v: string) => peek().k === "id" && (peek() as { v: string }).v.toLowerCase() === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`expected "${v}" but found "${peek().text}"`, source, peek().at);
    p++;
  };

  const orExpr = (): Node => {
    let left = andExpr();
    while (isWord("or")) { const at = peek().at; p++; left = { t: "binary", op: "or", left, right: andExpr(), at }; }
    return left;
  };
  const andExpr = (): Node => {
    let left = notExpr();
    while (isWord("and")) { const at = peek().at; p++; left = { t: "binary", op: "and", left, right: notExpr(), at }; }
    return left;
  };
  const notExpr = (): Node => {
    if (isWord("not")) { const at = peek().at; p++; return { t: "unary", op: "not", arg: notExpr(), at }; }
    return comparison();
  };
  const COMPARE: Record<string, BinaryOp> = { "=": "=", "==": "=", "!=": "!=", "<>": "!=", "<": "<", "<=": "<=", ">": ">", ">=": ">=" };
  const comparison = (): Node => {
    const left = additive();
    const t = peek();
    if (t.k === "op" && COMPARE[t.v]) {
      p++;
      const right = additive();
      const next = peek();
      if (next.k === "op" && COMPARE[next.v]) throw new ExprError(`comparisons do not chain ("${next.text}")`, source, next.at);
      return { t: "binary", op: COMPARE[t.v], left, right, at: t.at };
    }
    return left;
  };
  const additive = (): Node => {
    let left = multiplicative();
    while (isOp("+") || isOp("-")) { const t = peek() as { v: string; at: number }; p++; left = { t: "binary", op: t.v as BinaryOp, left, right: multiplicative(), at: t.at }; }
    return left;
  };
  const multiplicative = (): Node => {
    let left = unary();
    while (isOp("*") || isOp("/")) { const t = peek() as { v: string; at: number }; p++; left = { t: "binary", op: t.v as BinaryOp, left, right: unary(), at: t.at }; }
    return left;
  };
  const unary = (): Node => {
    if (isOp("-")) { const at = peek().at; p++; return { t: "unary", op: "-", arg: unary(), at }; }
    return primary();
  };
  const primary = (): Node => {
    const t = peek();
    if (t.k === "num") { p++; return { t: "num", v: t.v, at: t.at }; }
    if (t.k === "str") { p++; return { t: "str", v: t.v, at: t.at }; }
    if (t.k === "op" && t.v === "(") { p++; const e = orExpr(); expect(")"); return e; }
    if (t.k === "id") {
      p++;
      const word = t.v.toLowerCase();
      if (word === "true" || word === "false") return { t: "bool", v: word === "true", at: t.at };
      if (isOp("(")) {
        if (!(word in FUNCTIONS)) throw new ExprError(`unknown function "${t.v}"`, source, t.at);
        p++;
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(orExpr());
          while (isOp(",")) { p++; args.push(orExpr()); }
        }
        expect(")");
        const [lo, hi] = FUNCTIONS[word as FnName];
        if (args.length < lo || args.length > hi) throw new ExprError(`${word}() takes ${lo === hi ? lo : `${lo}${hi === Infinity ? " or more" : `-${hi}`}`} argument${hi === 1 ? "" : "s"}, not ${args.length}`, source, t.at);
        if (word === "known" && args[0].t !== "ref") throw new ExprError("known() takes a reference (attr.x, var.x or opt.x)", source, args[0].at);
        return { t: "call", fn: word as FnName, args, at: t.at };
      }
      const dot = t.v.indexOf(".");
      const scope = dot > 0 ? t.v.slice(0, dot).toLowerCase() : "";
      const name = dot > 0 ? t.v.slice(dot + 1) : "";
      if ((scope === "attr" || scope === "var" || scope === "opt") && name) return { t: "ref", scope, name, text: t.v, at: t.at };
      if (["and", "or", "not"].includes(word)) throw new ExprError(`"${t.v}" needs a value before it`, source, t.at);
      throw new ExprError(`unknown name "${t.v}" (a reference is attr.<name>, var.<name> or opt.<name>)`, source, t.at);
    }
    throw new ExprError(`unexpected ${t.k === "end" ? "end of expression" : `"${t.text}"`}`, source, t.at);
  };

  const node = orExpr();
  if (peek().k !== "end") throw new ExprError(`unexpected "${peek().text}"`, source, peek().at);
  return node;
}

// ── References ──────────────────────────────────────────────────────────────

/** Every reference an expression makes, in source order. */
export function refsOf(node: Node): Array<Extract<Node, { t: "ref" }>> {
  const out: Array<Extract<Node, { t: "ref" }>> = [];
  const walk = (n: Node) => {
    if (n.t === "ref") out.push(n);
    else if (n.t === "unary") walk(n.arg);
    else if (n.t === "binary") { walk(n.left); walk(n.right); }
    else if (n.t === "call") n.args.forEach(walk);
  };
  walk(node);
  return out;
}

/** The names an expression may reference: the family's canonical attributes
 * and the assembly's own variables and options. */
export interface Scope {
  attrs: ReadonlySet<string>;
  vars: ReadonlySet<string>;
  opts: ReadonlySet<string>;
}

/** Parse and check every reference against `scope`; throws ExprError naming
 * the first reference that does not resolve. */
export function checkExpr(src: string, scope: Scope): Node {
  const node = parseExpr(src);
  for (const r of refsOf(node)) {
    const known = r.scope === "attr" ? scope.attrs : r.scope === "var" ? scope.vars : scope.opts;
    if (!known.has(r.name)) {
      const what = r.scope === "attr" ? "an attribute of this family" : r.scope === "var" ? "a variable of this assembly" : "an option of this assembly";
      throw new ExprError(`"${r.text}" is not ${what}`, src, r.at);
    }
  }
  return node;
}

// ── Evaluation ──────────────────────────────────────────────────────────────

/** What an expression evaluated to: a value, or UNKNOWN with the references
 * that made it so. */
export type Result = { known: true; value: Value } | { known: false; missing: string[] };

/** The values references resolve to; `undefined` (or absent) is unknown. */
export interface Env {
  attr: (name: string) => Value | undefined;
  var: (name: string) => Value | undefined;
  opt: (name: string) => Value | undefined;
}

const K = (value: Value): Result => ({ known: true, value });
const U = (...missing: string[][]): Result => ({ known: false, missing: [...new Set(missing.flat())] });
const missingOf = (...rs: Result[]) => rs.flatMap((r) => (r.known ? [] : r.missing));

function num(r: Value, what: string, node: Node, src: string): number {
  if (typeof r === "number" && Number.isFinite(r)) return r;
  throw new ExprError(`${what} needs a number, got ${JSON.stringify(r)}`, src, node.at);
}
function bool(r: Value, what: string, node: Node, src: string): boolean {
  if (typeof r === "boolean") return r;
  throw new ExprError(`${what} needs true or false, got ${JSON.stringify(r)}`, src, node.at);
}
/** Equality is exact for numbers and booleans, case-insensitive for text. */
function same(a: Value, b: Value): boolean {
  if (typeof a === "string" && typeof b === "string") return a.toUpperCase() === b.toUpperCase();
  return a === b;
}

/** Evaluate a parsed expression. A type mismatch ("x" * 2) throws ExprError;
 * a missing reference yields UNKNOWN. `src` is the source, for messages. */
export function evaluate(node: Node, env: Env, src = ""): Result {
  const ev = (n: Node): Result => evaluate(n, env, src);
  switch (node.t) {
    case "num": return K(node.v);
    case "str": return K(node.v);
    case "bool": return K(node.v);
    case "ref": {
      const v = node.scope === "attr" ? env.attr(node.name) : node.scope === "var" ? env.var(node.name) : env.opt(node.name);
      return v === undefined || v === null || (typeof v === "number" && !Number.isFinite(v)) ? U([node.text]) : K(v);
    }
    case "unary": {
      const a = ev(node.arg);
      if (!a.known) return a;
      return node.op === "-" ? K(-num(a.value, "-", node, src)) : K(!bool(a.value, "not", node, src));
    }
    case "binary": {
      if (node.op === "and" || node.op === "or") {
        const a = ev(node.left);
        const b = ev(node.right);
        const av = a.known ? bool(a.value, node.op, node, src) : null;
        const bv = b.known ? bool(b.value, node.op, node, src) : null;
        if (node.op === "and") {
          if (av === false || bv === false) return K(false);
          if (av === true && bv === true) return K(true);
        } else {
          if (av === true || bv === true) return K(true);
          if (av === false && bv === false) return K(false);
        }
        return U(missingOf(a, b));
      }
      const a = ev(node.left);
      const b = ev(node.right);
      if (!a.known || !b.known) return U(missingOf(a, b));
      switch (node.op) {
        case "+": return K(num(a.value, "+", node, src) + num(b.value, "+", node, src));
        case "-": return K(num(a.value, "-", node, src) - num(b.value, "-", node, src));
        case "*": return K(num(a.value, "*", node, src) * num(b.value, "*", node, src));
        case "/": {
          const d = num(b.value, "/", node, src);
          if (d === 0) throw new ExprError("division by zero", src, node.at);
          return K(num(a.value, "/", node, src) / d);
        }
        case "=": return K(same(a.value, b.value));
        case "!=": return K(!same(a.value, b.value));
        default: {
          const x = num(a.value, node.op, node, src);
          const y = num(b.value, node.op, node, src);
          return K(node.op === "<" ? x < y : node.op === "<=" ? x <= y : node.op === ">" ? x > y : x >= y);
        }
      }
    }
    case "call": {
      const args = node.args;
      switch (node.fn) {
        case "known": return K(ev(args[0]).known);
        case "if": {
          const c = ev(args[0]);
          if (c.known) return bool(c.value, "if", node, src) ? ev(args[1]) : ev(args[2]);
          // An unknown condition decides nothing, unless both branches agree.
          const a = ev(args[1]);
          const b = ev(args[2]);
          if (a.known && b.known && same(a.value, b.value) && typeof a.value === typeof b.value) return a;
          return U(c.missing, missingOf(a, b));
        }
        case "min":
        case "max": {
          const rs = args.map(ev);
          if (rs.some((r) => !r.known)) return U(missingOf(...rs));
          const ns = rs.map((r, i) => num((r as { value: Value }).value, node.fn, args[i], src));
          return K(node.fn === "min" ? Math.min(...ns) : Math.max(...ns));
        }
        case "ceil":
        case "floor": {
          const a = ev(args[0]);
          if (!a.known) return a;
          const x = num(a.value, node.fn, node, src);
          return K(node.fn === "ceil" ? Math.ceil(x) : Math.floor(x));
        }
        case "round": {
          const a = ev(args[0]);
          const d = args[1] ? ev(args[1]) : K(0);
          if (!a.known || !d.known) return U(missingOf(a, d));
          const digits = num(d.value, "round", node, src);
          if (!Number.isInteger(digits) || digits < 0 || digits > 12) throw new ExprError("round() digits must be a whole number 0-12", src, node.at);
          const f = 10 ** digits;
          return K(Math.round(num(a.value, "round", node, src) * f) / f);
        }
      }
    }
  }
}

/** Parse, then evaluate: the one-call form for tests and tools. */
export function evalExpr(src: string, env: Env): Result {
  return evaluate(parseExpr(src), env, src);
}
