// ASSEMBLIES GATE 1 — the canonical attribute schema
// (web/src/lib/assemblies/attributes.ts) reviewed against the keys: every keyed
// attribute maps to exactly one canonical attribute of its family, every
// committed key line's printed unit converts to that attribute's canonical
// unit, every enum value is canonical, and every example source column is
// real. Key lines are read through the transcription helper's own expansion,
// which assembliesKeys.test.mjs holds byte-identical to the committed CSVs.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KEY_ATTRIBUTES, expandTranscription, parseTranscription } from "../scripts/assemblies-key-transcribe.mjs";
import {
  ASSEMBLY_FAMILIES, ATTRIBUTES, familyAttributes, canonicalAttributeFor, keyValueToCanonical,
} from "../../web/src/lib/assemblies/attributes.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const WORK = join(CORPUS, "reports", "assemblies", "key-work");
const transcriptions = existsSync(WORK) ? readdirSync(WORK).filter((f) => f.endsWith(".transcription.txt")).sort() : [];
const keyLines = () => transcriptions.flatMap((f) => {
  const setId = f.replace(/\.transcription\.txt$/, "");
  return expandTranscription(parseTranscription(readFileSync(join(WORK, f), "utf8"))).map((l) => ({ ...l, setId }));
});
const KIND = { num: "number", size: "size", enum: "enum", text: "text" };

test("GATE 1: the schema's families are exactly the frozen key vocabulary's families", () => {
  assert.deepEqual([...ASSEMBLY_FAMILIES].sort(), Object.keys(KEY_ATTRIBUTES).sort());
});

test("GATE 1: every key-vocabulary attribute maps to exactly one canonical attribute of its family, with the same kind and enum", () => {
  for (const [family, attrs] of Object.entries(KEY_ATTRIBUTES)) {
    const { keyed, all } = familyAttributes(family);
    assert.deepEqual([...keyed].sort(), Object.keys(attrs).sort(), `${family}: keyed attributes are the frozen vocabulary`);
    const targets = new Map();
    for (const [attr, spec] of Object.entries(attrs)) {
      const id = canonicalAttributeFor(family, attr);
      assert.equal(all.filter((a) => a === id).length, 1, `${family}.${attr} -> exactly one ${id}`);
      assert.ok(!targets.has(id), `${family}: ${attr} and ${targets.get(id)} both map to ${id}`);
      targets.set(id, attr);
      const c = ATTRIBUTES[id];
      assert.equal(c.kind, KIND[spec.type], `${family}.${attr}: kind`);
      if (spec.type === "enum") assert.deepEqual([...c.values], [...spec.values], `${family}.${attr}: enum values`);
    }
    assert.throws(() => canonicalAttributeFor(family, "no_such_key_attribute"), /not in the/);
  }
});

test("GATE 1: every committed key line maps; its unit converts to the canonical unit; every value is canonical",
  { skip: transcriptions.length ? false : "corpus key-work absent" }, () => {
    let lines = 0, values = 0;
    for (const l of keyLines()) {
      if (!l.attribute) continue; // a table-level line (rows: none) keys no attribute
      lines++;
      const id = canonicalAttributeFor(l.family, l.attribute);
      const spec = ATTRIBUTES[id];
      if (spec.kind === "number" || spec.kind === "size") {
        assert.doesNotThrow(() => keyValueToCanonical(l.family, l.attribute, spec.kind === "size" ? "1" : "1", l.unit),
          `${l.setId} ${l.tag}.${l.attribute}: unit "${l.unit}"`);
      }
      if (l.value === "") continue;
      values++;
      const v = keyValueToCanonical(l.family, l.attribute, l.value, l.unit);
      if (spec.kind === "number") assert.ok(Number.isFinite(v), `${l.setId} ${l.tag}.${l.attribute} = ${l.value}`);
      if (spec.kind === "enum") assert.ok(spec.values.includes(v), `${l.setId} ${l.tag}.${l.attribute} = ${l.value}`);
    }
    assert.ok(lines > 7000 && values > 3000, `read ${lines} key lines, ${values} printed values`);
  });

test("GATE 1: every example source column is real, and an attribute with no example is printed in no key",
  { skip: transcriptions.length ? false : "corpus key-work absent" }, () => {
    const lines = keyLines();
    const text = new Map(transcriptions.map((f) => [f.replace(/\.transcription\.txt$/, ""), readFileSync(join(WORK, f), "utf8")]));
    for (const [id, spec] of Object.entries(ATTRIBUTES)) {
      const mapped = lines.filter((l) => l.attribute === id && l.source_header);
      if (spec.example === null) {
        assert.equal(mapped.length, 0, `${id} says no key prints it, but ${mapped[0]?.setId} maps "${mapped[0]?.source_header}"`);
        continue;
      }
      const { set, header, source } = spec.example;
      if (source === "key") {
        assert.ok(mapped.some((l) => l.setId === set && l.source_header === header), `${id}: "${header}" is a ${set} key header for it`);
      } else {
        const doc = text.get(set);
        assert.ok(doc, `${id}: example set ${set} has a transcription`);
        if (source === "column") assert.ok(doc.split("\n").some((ln) => ln.startsWith("col: ") && ln.includes(header)), `${id}: ${set} types a "${header}" column`);
        else assert.ok(doc.replace(/\s+#\s*/g, " ").includes(header), `${id}: ${set} records the note "${header}"`);
      }
    }
  });
