#!/usr/bin/env node
// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 7 — shadow/parallel-run
// harness for requirements 2/3 (refactoring symbol_sweep/sweep_schedule_row
// to consume the new candidate/ownership/verifier modules). Per the
// dedicated Phase 7 audit (PROGRESS.md): that refactor has the largest
// blast radius of anything in Phase 7 — a real 47/47-case corpus
// regression gate (docs/SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md) plus 244+
// existing unit/conformance/parity tests — and should not be attempted
// without a way to validate any internal change against that same corpus
// BEFORE swapping the real path. This is that tool's own comparison half;
// symbol-sweep-corpus.mjs (unmodified, already real, already mature)
// remains the one and only thing that actually RUNS the corpus — this
// script never re-implements that, only diffs two of its own JSON reports.
//
// USAGE:
//   node --import tsx scripts/symbol-sweep-corpus.mjs --mode=default > baseline.json
//   ... (a future change to symbol_sweep's own internals) ...
//   node --import tsx scripts/symbol-sweep-corpus.mjs --mode=default > candidate.json
//   node --import tsx scripts/symbol-sweep-shadow-diff.mjs baseline.json candidate.json
//
// A NEW real failure (a case that passed in baseline and fails in
// candidate) is the one thing this tool exists to catch before it ever
// reaches a real user — reported first, loudest, and drives the exit
// code. A NEW pass (baseline failed, candidate now passes) is real
// improvement, reported but never treated as covering for a regression
// elsewhere. Anything else (same-ok, timing-only) is informational.
import { readFileSync } from "node:fs";

const [, , baselinePath, candidatePath] = process.argv;
if (!baselinePath || !candidatePath) {
  console.error("usage: symbol-sweep-shadow-diff.mjs <baseline.json> <candidate.json>");
  process.exit(2);
}

function loadReport(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw?.results)) {
    throw new Error(`${path}: not a symbol-sweep-corpus.mjs report (no .results array) — did you pass its raw JSON output?`);
  }
  return raw;
}

let baseline, candidate;
try {
  baseline = loadReport(baselinePath);
  candidate = loadReport(candidatePath);
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

if (baseline.mode !== candidate.mode) {
  console.error(`refusing to compare reports run in different modes (baseline: ${baseline.mode}, candidate: ${candidate.mode}) -- re-run both with the SAME --mode`);
  process.exit(2);
}

const baseById = new Map(baseline.results.map((r) => [r.id, r]));
const candById = new Map(candidate.results.map((r) => [r.id, r]));

const allIds = new Set([...baseById.keys(), ...candById.keys()]);
const newFailures = [];
const newPasses = [];
const foundCountChanges = [];
const missingFromCandidate = [];
const newInCandidate = [];
let unchanged = 0;

for (const id of allIds) {
  const b = baseById.get(id);
  const c = candById.get(id);
  if (!c) { missingFromCandidate.push(id); continue; }
  if (!b) { newInCandidate.push(id); continue; }
  if (b.ok && !c.ok) {
    newFailures.push({ id, baselineErrors: b.errors, candidateErrors: c.errors });
    continue;
  }
  if (!b.ok && c.ok) {
    newPasses.push(id);
    continue;
  }
  if (b.found !== c.found) {
    foundCountChanges.push({ id, baselineFound: b.found, candidateFound: c.found, stillOk: b.ok && c.ok });
    continue;
  }
  unchanged++;
}

console.log(`Symbol-sweep shadow diff: ${baselinePath} (${baseline.cases} cases) vs ${candidatePath} (${candidate.cases} cases), mode=${baseline.mode}`);
console.log(`unchanged: ${unchanged}`);

if (missingFromCandidate.length) {
  console.log(`\nCASES MISSING FROM CANDIDATE (${missingFromCandidate.length}) -- the candidate run covered fewer cases than baseline, itself a real gap:`);
  for (const id of missingFromCandidate) console.log(`  - ${id}`);
}
if (newInCandidate.length) {
  console.log(`\nCases new to candidate, not in baseline (${newInCandidate.length}) -- informational, likely a corpus update between runs:`);
  for (const id of newInCandidate) console.log(`  - ${id}`);
}
if (foundCountChanges.length) {
  console.log(`\nfound-count changed, ok status unchanged (${foundCountChanges.length}) -- informational, worth a human look even when both sides still pass:`);
  for (const r of foundCountChanges) console.log(`  - ${r.id}: ${r.baselineFound} -> ${r.candidateFound}${r.stillOk ? "" : " (one or both sides fail)"}`);
}
if (newPasses.length) {
  console.log(`\nNEW PASSES (${newPasses.length}) -- real improvement, never used to excuse a regression elsewhere:`);
  for (const id of newPasses) console.log(`  - ${id}`);
}

if (newFailures.length) {
  console.log(`\n*** NEW REGRESSIONS (${newFailures.length}) -- passed in baseline, now fail in candidate. Never ship this change until every one of these is understood and fixed. ***`);
  for (const r of newFailures) {
    console.log(`  - ${r.id}`);
    for (const e of r.candidateErrors) console.log(`      candidate error: ${e}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nNo regressions: every case that passed in baseline still passes in candidate.`);
}
