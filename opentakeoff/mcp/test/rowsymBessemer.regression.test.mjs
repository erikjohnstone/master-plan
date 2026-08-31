/**
 * WP3 rowsym bar — Bessemer keyed row-to-symbol recall via sweep_schedule_row.
 * Key authored independently (render + look); scorer uses found>0 vs expect_status.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import { resolveSetFiles } from "../scripts/corpusFiles.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");

function readRowsymKey(setId) {
  const path = join(CORPUS, "keys", `${setId}.rowsym.csv`);
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

test("Bessemer rowsym recall ≥90% on keyed schedule-row tags (WP3)", async () => {
  const spec = JSON.parse(readFileSync(join(CORPUS, "sets.json"), "utf8"));
  const set = spec.sets.find((s) => s.id === "bessemer");
  assert.ok(set, "bessemer in sets.json");
  const key = readRowsymKey("bessemer");
  assert.ok(key?.length, "bessemer.rowsym.csv present");

  const files = resolveSetFiles(CORPUS, spec, set);
  assert.ok(existsSync(files[0]), `bessemer PDF at ${files[0]}`);

  const session = new Session();
  await session.loadPlan(files[0]);

  let tp = 0;
  let fn = 0;
  const missed = [];
  for (const row of key) {
    const tag = row.tag;
    const expect = row.expect_status;
    let status;
    try {
      const r = await session.sweepScheduleRow(tag, { evaluationFast: true });
      status = (r.found ?? 0) > 0 ? "resolved" : "refused";
    } catch {
      status = "refused";
    }
    if (expect === "resolved") {
      if (status === "resolved") tp += 1;
      else {
        fn += 1;
        missed.push(tag);
      }
    }
  }

  const recall = tp / Math.max(1, tp + fn);
  assert.ok(
    recall >= 0.9,
    `Bessemer rowsym recall ${(recall * 100).toFixed(1)}% (${tp}/${tp + fn}); missed: ${missed.join(", ") || "none"}`,
  );
});
