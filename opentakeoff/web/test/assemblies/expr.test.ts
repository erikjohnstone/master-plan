// ASSEMBLIES WP3.2 — the expression language (src/lib/assemblies/expr.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkExpr, evalExpr, ExprError, parseExpr, refsOf, type Env, type Value } from "../../src/lib/assemblies/expr.ts";

const env = (attr: Record<string, Value> = {}, vars: Record<string, Value> = {}, opts: Record<string, Value> = {}): Env => ({
  attr: (n) => attr[n], var: (n) => vars[n], opt: (n) => opts[n],
});
const val = (src: string, e: Env = env()) => {
  const r = evalExpr(src, e);
  assert.ok(r.known, `${src} should be known, missing ${JSON.stringify(!r.known && r.missing)}`);
  return r.value;
};

test("arithmetic, comparison and logic, with the usual precedence", () => {
  assert.equal(val("1 + 2 * 3"), 7);
  assert.equal(val("(1 + 2) * 3"), 9);
  assert.equal(val("-2 * 3 + 10 / 4"), -3.5);
  assert.equal(val("2 - -3"), 5);
  assert.equal(val("1 < 2 and 3 >= 3"), true);
  assert.equal(val("not 1 = 2"), true);
  assert.equal(val("1 <> 1 or 2 == 2"), true);
  assert.equal(val("true and not false"), true);
  assert.equal(val(".5 + 1e1"), 10.5);
});

test("references, text equality and functions", () => {
  const e = env({ heat_type: "hw", cfm_max: 1200, eh_kw: 4.5 }, { spare_pct: 10 }, { reheat: true });
  assert.equal(val("attr.heat_type = 'HW'", e), true, "text compares without case");
  assert.equal(val('attr.heat_type != "electric"', e), true);
  assert.equal(val("attr.cfm_max * (1 + var.spare_pct / 100)", e), 1320);
  assert.equal(val("if(opt.reheat, 2, 1)", e), 2);
  assert.equal(val("min(attr.cfm_max, 1000, 5000)", e), 1000);
  assert.equal(val("max(1, attr.eh_kw)", e), 4.5);
  assert.equal(val("ceil(attr.eh_kw)", e), 5);
  assert.equal(val("floor(attr.eh_kw)", e), 4);
  assert.equal(val("round(2.345, 2)", e), 2.35);
  assert.equal(val("round(attr.eh_kw)", e), 5);
  assert.equal(val("known(attr.eh_kw) and not known(attr.hw_gpm)", e), true);
  assert.deepEqual(refsOf(parseExpr("attr.a + var.b * if(opt.c, attr.a, 1)")).map((r) => r.text), ["attr.a", "var.b", "opt.c", "attr.a"]);
});

test("unknown stays unknown, and says what it waits for", () => {
  const e = env({ heat_type: "hw" });
  assert.deepEqual(evalExpr("attr.hw_gpm * 2", e), { known: false, missing: ["attr.hw_gpm"] });
  assert.deepEqual(evalExpr("attr.hw_gpm > 1 and var.x < 3", e), { known: false, missing: ["attr.hw_gpm", "var.x"] });
  assert.equal(val("attr.heat_type = 'steam' and attr.hw_gpm > 1", e), false, "false and unknown is false");
  assert.equal(val("attr.heat_type = 'hw' or attr.hw_gpm > 1", e), true, "true or unknown is true");
  assert.deepEqual(evalExpr("attr.heat_type = 'hw' and attr.hw_gpm > 1", e), { known: false, missing: ["attr.hw_gpm"] });
  assert.equal(val("if(attr.hw_gpm > 1, 2, 2)", e), 2, "an unknown condition with equal branches decides");
  assert.deepEqual(evalExpr("if(attr.hw_gpm > 1, 2, 1)", e), { known: false, missing: ["attr.hw_gpm"] });
  assert.deepEqual(evalExpr("not attr.vfd", e), { known: false, missing: ["attr.vfd"] });
  assert.deepEqual(evalExpr("min(1, attr.x)", e), { known: false, missing: ["attr.x"] });
  assert.equal(val("known(attr.x)", e), false);
});

test("malformed expressions are refused with the offending token and its position", () => {
  const refuses = (src: string, message: RegExp) => assert.throws(() => parseExpr(src), (err: unknown) => err instanceof ExprError && message.test(err.message), src);
  refuses("", /empty expression/);
  refuses("1 +", /unexpected end of expression/);
  refuses("(1 + 2", /expected "\)"/);
  refuses("1 2", /unexpected "2" at 3/);
  refuses("pow(2, 3)", /unknown function "pow"/);
  refuses("heat_type = 1", /unknown name "heat_type"/);
  refuses("'abc", /unterminated string/);
  refuses("1 < 2 < 3", /comparisons do not chain/);
  refuses("known(1)", /known\(\) takes a reference/);
  refuses("if(1, 2)", /if\(\) takes 3 arguments, not 2/);
  refuses("round(1, 2, 3)", /round\(\) takes 1-2 arguments, not 3/);
  refuses("1 # 2", /unexpected "#" at 3/);
  refuses("and 1", /"and" needs a value before it/);
});

test("references are checked against the family's attributes and the assembly's own variables and options", () => {
  const scope = { attrs: new Set(["cfm_max", "heat_type"]), vars: new Set(["spare_pct"]), opts: new Set(["reheat"]) };
  assert.doesNotThrow(() => checkExpr("attr.cfm_max * var.spare_pct + if(opt.reheat, 1, 0)", scope));
  assert.throws(() => checkExpr("attr.cfm_mx > 0", scope), /"attr\.cfm_mx" is not an attribute of this family at 1/);
  assert.throws(() => checkExpr("1 + var.spare", scope), /"var\.spare" is not a variable of this assembly at 5/);
  assert.throws(() => checkExpr("opt.reheat and opt.cool", scope), /"opt\.cool" is not an option of this assembly at 16/);
});

test("type mismatches and division by zero are errors, not values", () => {
  assert.throws(() => evalExpr("'a' * 2", env()), /\* needs a number/);
  assert.throws(() => evalExpr("1 and true", env()), /and needs true or false/);
  assert.throws(() => evalExpr("1 / (2 - 2)", env()), /division by zero/);
  assert.throws(() => evalExpr("round(1.5, 0.5)", env()), /digits must be a whole number/);
});

test("the evaluator never runs source text: no eval, no Function constructor", () => {
  const src = readFileSync(new URL("../../src/lib/assemblies/expr.ts", import.meta.url), "utf8");
  assert.ok(!/\beval\s*\(/.test(src.replace(/\/\/.*$/gm, "")), "eval(");
  assert.ok(!/\bFunction\s*\(/.test(src), "Function(");
});

test("fuzz: any token soup parses or throws ExprError, and a parsed one evaluates or throws ExprError", () => {
  let seed = 20260924;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pieces = ["1", "2.5", "'x'", "attr.a", "attr.b", "var.v", "opt.o", "true", "(", ")", ",", "+", "-", "*", "/", "=", "<>", "<", ">=", "and", "or", "not", "if(", "min(", "max(", "ceil(", "round(", "known(", "zzz", "."];
  const e = env({ a: 3, b: "x" }, { v: 0 }, { o: true });
  for (let i = 0; i < 3000; i++) {
    const src = Array.from({ length: 1 + Math.floor(rand() * 9) }, () => pieces[Math.floor(rand() * pieces.length)]).join(" ");
    try {
      evalExpr(src, e);
    } catch (err) {
      assert.ok(err instanceof ExprError, `${src}: ${String(err)}`);
    }
  }
});
