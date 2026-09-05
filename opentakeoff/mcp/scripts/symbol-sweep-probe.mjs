#!/usr/bin/env node
// Read-only symbol-sweep diagnostic for selecting and manually reviewing
// corpus seeds. Usage:
//   node --import tsx scripts/symbol-sweep-probe.mjs PDF PAGE X0 Y0 X1 Y1 [sheet|set] [--compact]
import path from "node:path";

import { Session } from "../src/session.ts";
import { labelPlacements } from "../../web/src/lib/symbollabels.ts";

const [pdfArg, pageArg, x0Arg, y0Arg, x1Arg, y1Arg, scopeArg = "sheet", ...extraArgs] = process.argv.slice(2);
const compact = extraArgs.length === 1 && extraArgs[0] === "--compact";
const rectArgs = [x0Arg, y0Arg, x1Arg, y1Arg];
if (!pdfArg || !pageArg || rectArgs.some((value) => value === undefined) || (extraArgs.length && !compact) || !["sheet", "set"].includes(scopeArg)) {
  console.error("usage: symbol-sweep-probe.mjs PDF PAGE X0 Y0 X1 Y1 [sheet|set] [--compact]");
  process.exit(2);
}
const page = Number(pageArg);
const seedRect = rectArgs.map(Number);
if (!Number.isInteger(page) || page < 1 || seedRect.some((value) => !Number.isFinite(value))) {
  console.error("page must be a positive integer and seed coordinates must be finite numbers");
  process.exit(2);
}

const session = new Session();
const source = path.resolve(pdfArg);
const loaded = await session.loadPlan(source);
const sheet = loaded.sheets[page - 1];
if (!sheet) throw new Error(`page ${page} is absent (PDF has ${loaded.sheets.length})`);

const result = await session.symbolSweep(sheet.sheet, {
  seedRect: [[seedRect[0], seedRect[1]], [seedRect[2], seedRect[3]]],
  scope: scopeArg,
});
let resolvedLabels;
if (scopeArg === "sheet") {
  const state = session.sheets.get(sheet.sheet);
  const diagnosticWithheld = compact ? result.withheld : [];
  const labels = labelPlacements(
    [result.seed.center, ...result.matches.map((match) => match.at), ...diagnosticWithheld.map((row) => row.at)],
    state.spans,
    state.geo.segs,
    state.geo.lum,
    {
      ...(result.seed.label ? { preferredLabel: result.seed.label } : {}),
      scores: [1, ...result.matches.map((match) => match.score), ...diagnosticWithheld.map((row) => row.score)],
      symbolInkLengthPx: result.seed.length_px,
    },
  );
  resolvedLabels = compact ? {
    seed: labels[0] ?? null,
    matches: result.matches.map((match, i) => ({ at: match.at, label: labels[i + 1] ?? null })),
    withheld: result.withheld
      .map((row, i) => ({ row, label: labels[1 + result.matches.length + i] ?? null }))
      .filter(({ row }) => row.reason?.includes("broad adjacency"))
      .map(({ row, label }) => ({ at: row.at, label })),
  } : labels;
} else {
  const seedState = session.sheets.get(sheet.sheet);
  const [seedLabel] = labelPlacements(
    [result.seed.center],
    seedState.spans,
    seedState.geo.segs,
    seedState.geo.lum,
    {
      ...(result.seed.label ? { preferredLabel: result.seed.label } : {}),
      scores: [1],
      symbolInkLengthPx: result.seed.length_px,
    },
  );
  const sheets = [];
  for (const pageResult of result.sheets) {
    const broadWithheld = compact
      ? pageResult.withheld.filter((row) => row.reason?.includes("broad adjacency"))
      : [];
    if (!pageResult.matches.length && !broadWithheld.length) continue;
    const target = session.sheets.get(pageResult.sheet);
    const carriesSeed = pageResult.sheet === sheet.sheet;
    // Compact diagnostics include every review candidate during assignment so
    // the reported label for a filtered broad-adjacency row is the same
    // one-to-one claim production saw, without printing every unrelated row.
    const diagnosticWithheld = compact ? pageResult.withheld : [];
    const labels = labelPlacements(
      [
        ...(carriesSeed ? [result.seed.center] : []),
        ...pageResult.matches.map((match) => match.at),
        ...diagnosticWithheld.map((row) => row.at),
      ],
      target.spans,
      target.geo.segs,
      target.geo.lum,
      {
        ...(result.seed.label ? { preferredLabel: result.seed.label } : {}),
        scores: [
          ...(carriesSeed ? [1] : []),
          ...pageResult.matches.map((match) => match.score),
          ...diagnosticWithheld.map((row) => row.score),
        ],
        symbolInkLengthPx: result.seed.length_px,
      },
    );
    sheets.push({
      sheet: pageResult.sheet,
      page: loaded.sheets.findIndex((candidate) => candidate.sheet === pageResult.sheet) + 1,
      matches: pageResult.matches.map((match, i) => ({
        at: match.at,
        label: labels[i + (carriesSeed ? 1 : 0)] ?? null,
      })),
      ...(compact ? {
        withheld: broadWithheld.map((row) => {
          const originalIndex = pageResult.withheld.indexOf(row);
          return {
            at: row.at,
            label: labels[(carriesSeed ? 1 : 0) + pageResult.matches.length + originalIndex] ?? null,
          };
        }),
      } : {}),
    });
  }
  resolvedLabels = { seed: seedLabel ?? null, sheets };
}
const compactSweepResult = (value) => {
  if (value.scope !== "set") return {
    scope: value.scope,
    found: value.found,
    seed: value.seed,
    matches: value.matches,
    withheld: value.withheld.filter((row) => row.reason?.includes("broad adjacency")),
  };
  return {
    scope: value.scope,
    found: value.found,
    seed: value.seed,
    sheets: value.sheets
      .map((pageResult) => ({
        sheet: pageResult.sheet,
        found: pageResult.found,
        matches: pageResult.matches,
        withheld: pageResult.withheld.filter((row) => row.reason?.includes("broad adjacency")),
      }))
      .filter((pageResult) => pageResult.matches.length || pageResult.withheld.length),
  };
};

console.log(JSON.stringify({
  source,
  page,
  sheet: {
    id: sheet.sheet,
    number: sheet.sheet_number,
    width_px: sheet.width_px,
    height_px: sheet.height_px,
  },
  result: compact ? compactSweepResult(result) : result,
  ...(resolvedLabels ? { resolved_labels: resolvedLabels } : {}),
}, null, 2));
