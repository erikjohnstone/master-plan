// The binding eval's second tier (scripts/control-intent-binding-split.mjs):
// a pure seeded draw, reproduced exactly from what is committed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BINDING_TIER2_DEV_DOCS, bindingExposure, drawBindingTier2, shortId } from "../scripts/control-intent-binding-split.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const DIR = join(CORPUS, "reports", "control-intent", "binding-tier2");

const docs = (n, eligible = () => true) => Array.from({ length: n }, (_, i) => ({ id: `${String(i).padStart(3, "0")}_XX_doc`, eligible: eligible(i) }));

test("binding tier 2: held-out is every eligible unexposed document; dev the seeded head of the exposed ones", () => {
  const eligibility = docs(12, (i) => i !== 5);
  const exposure = Object.fromEntries(eligibility.filter((_, i) => i % 3 !== 0).map((d) => [d.id, ["cited"]]));
  const a = drawBindingTier2(eligibility, exposure, 7, 4);
  assert.deepEqual(a, drawBindingTier2(structuredClone(eligibility), { ...exposure }, 7, 4), "a pure function of its inputs");
  assert.deepEqual(a.heldout, ["000_XX_doc", "003_XX_doc", "006_XX_doc", "009_XX_doc"]);
  assert.equal(a.dev.length, 4);
  assert.ok(a.dev.every((id) => exposure[id]), "dev draws exposed documents only");
  assert.ok(!a.dev.includes("005_XX_doc") && !a.heldout.includes("005_XX_doc"), "an ineligible document is on neither side");
  assert.deepEqual(new Set(a.pool_order), new Set(Object.keys(exposure).filter((id) => id !== "005_XX_doc")));
  assert.notDeepEqual(a.dev, drawBindingTier2(eligibility, exposure, 8, 4).dev, "the seed decides the dev draw");
});

test("binding tier 2: a citation counts only as a whole short id", () => {
  const ids = ["10_MO_Hawthorn", "010_US_Other", "110_MO_Else"];
  const exp = bindingExposure(ids, [], "CI-40 cites 10_MO's sequence and 010_US_x.");
  assert.deepEqual(Object.keys(exp).sort(), ["010_US_Other", "10_MO_Hawthorn"]);
  assert.equal(shortId("096_IN_Vermillion_County"), "096_IN");
  assert.deepEqual(bindingExposure(["096_IN_V"], [{ id: "096_IN_V", why: "audited" }], "")["096_IN_V"], ["tier 2's examined list: audited"]);
});

test("binding tier 2: the committed draw is reproduced exactly by its seed", { skip: !existsSync(join(DIR, "01-split.json")) && "binding tier 2 not drawn here" }, () => {
  const split = JSON.parse(readFileSync(join(DIR, "01-split.json"), "utf8"));
  const eligibility = JSON.parse(readFileSync(join(DIR, "00-eligibility.json"), "utf8")).documents;
  const population = [2, 3, 4, 5].flatMap((t) => JSON.parse(readFileSync(join(CORPUS, "reports", "assemblies", `tier${t}`, "01-split.json"), "utf8")).dev.sets);
  const examined = JSON.parse(readFileSync(join(CORPUS, "reports", "assemblies", "tier2", "examined.json"), "utf8")).sets;
  const exposure = bindingExposure(population, examined, readFileSync(join(CORPUS, "CONTROL_INTENT_BUG_CATALOGUE.md"), "utf8"));
  // An eligible document's exposure as recorded: a later citation of a held-out
  // document is exposure, and fails here.
  const eligibleIds = new Set(eligibility.filter((d) => d.eligible).map((d) => d.id));
  const onEligible = (e) => Object.fromEntries(Object.entries(e).filter(([id]) => eligibleIds.has(id)).map(([id, why]) => [id, Boolean(why.length)]));
  assert.deepEqual(onEligible(exposure), onEligible(split.exposure), "eligible documents' exposure as recorded");
  const again = drawBindingTier2(eligibility, exposure, split.seed, split.dev_docs ?? BINDING_TIER2_DEV_DOCS);
  assert.deepEqual(again.dev, split.dev.sets);
  assert.deepEqual(again.heldout, split.heldout.sets);
  for (const id of [...split.dev.sets, ...split.heldout.sets]) assert.ok(existsSync(join(CORPUS, "keys", `${id}.attrs.csv`)), `${id} has an attribute key`);
});
