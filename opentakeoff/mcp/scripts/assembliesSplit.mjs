// ASSEMBLIES goal — the seeded draws that decide which documents the
// attribute keys are authored on: WP0.2's frozen dev / held-out split, and
// the second tier AS-2 / AS-17 call for once the bulk corpus is staged.
// Pure functions of their inputs (a census, drafters.json, a seed), so a
// test reproduces every committed draw from its seed.
//
// SHOULD THIS BE ON THE SHARED PATH? No — evaluation bookkeeping: which
// documents are keyed, tuned on, or held out. Nothing here reads a PDF or
// runs the pipeline. scripts/assemblies-baseline.mjs is the CLI.

// Reporting buckets only (which compiled families a controls or hook-up
// estimator would put a typical on). Not a classifier: the family names are
// the compile's own HVAC_FAMILY_SPECS keys, taken as given.
export const CONTROLS_RELEVANT_FAMILIES = new Set([
  "AHU", "DOAH_UNIT", "DOAH_HANDLING", "DOAS", "OUTDOOR_AIR_UNIT", "FCU", "VAV", "RTU",
  "AIR_COOLED_CHILLER", "HEAT_RECOVERY_CHILLER", "BOILER", "PUMP", "FAN", "UNIT_HEATER",
  "CABINET_UNIT_HEATER", "HEAT_PUMP", "ERV", "CRAH", "RAH", "COOLING_TOWER", "HEAT_EXCHANGER",
  "HUMIDIFIER", "DEHUMIDIFIER", "VARIABLE_FREQUENCY_DRIVE", "CONDENSING_UNIT", "VRF_INDOOR",
  "VRF_OUTDOOR", "FURNACE", "DUCT_MOUNTED_COIL", "CONTROL_DAMPER", "CHW_CONTROL_VALVE",
  "HHW_CONTROL_VALVE", "BYPASS_CONTROL_VALVE", "MIXING_VALVE", "LAB_AIR_VALVE",
  "FUME_HOOD_DAMPER", "FIN_TUBE_RADIATION", "RADIANT_CEILING_PANEL",
]);

/** Equipment families whose schedule attributes the *.attrs.csv keys cover
 * (TRUTH: "equipment-schedule tables … claimed for a controls-relevant
 * family"). Devices — valves, dampers, VFDs, air valves — are selection
 * roles keyed with their own fields later (WP7), not equipment here. */
export const ATTR_KEY_FAMILIES = new Set([...CONTROLS_RELEVANT_FAMILIES]
  .filter((f) => !/VALVE|DAMPER|VARIABLE_FREQUENCY_DRIVE/.test(f)));

/** The equipment GOAL TRUTH says the dev keys must cover, as compile families. */
export const REQUIRED_KEY_COVERAGE = [
  ["VAV", ["VAV"]],
  ["AHU/DOAS/RTU", ["AHU", "DOAH_UNIT", "DOAH_HANDLING", "DOAS", "OUTDOOR_AIR_UNIT", "RTU"]],
  ["FCU", ["FCU"]],
  ["pump", ["PUMP"]],
  ["fan", ["FAN"]],
  ["UH/CUH", ["UNIT_HEATER", "CABINET_UNIT_HEATER"]],
  ["boiler", ["BOILER"]],
  ["chiller", ["AIR_COOLED_CHILLER", "HEAT_RECOVERY_CHILLER"]],
  ["cooling tower", ["COOLING_TOWER"]],
  ["HX", ["HEAT_EXCHANGER"]],
  ["ERV", ["ERV"]],
  ["humidifier", ["HUMIDIFIER"]],
];

/** Small seeded PRNG (mulberry32) — the draw must reproduce from the seed alone. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seededShuffle(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Rows keyed per sampled table, in PRINTED order (read off the render, not
 * the pipeline), so one 150-row VAV schedule cannot swamp the sample. */
export const KEY_ROWS_PER_TABLE_MAX = 30;
export const HELDOUT_MIN_DOCS = 5;

/** A census's documents with ≥ 1 compiled row in a keyed family:
 * set id -> [{ family, table_rows }]. */
function keyedDocs(perSet, keep) {
  const docs = new Map();
  for (const r of perSet) {
    if (r.error || !keep(r.id)) continue;
    const fams = Object.entries(r.families).filter(([f, v]) => ATTR_KEY_FAMILIES.has(f) && v.items > 0);
    if (fams.length) docs.set(r.id, fams.map(([family, v]) => ({ family, table_rows: v.table_rows })));
  }
  return docs;
}

/** The REQUIRED_KEY_COVERAGE buckets some of `setIds` covers. */
const bucketsOf = (docs, setIds) => new Set(REQUIRED_KEY_COVERAGE
  .filter(([, fams]) => setIds.some((id) => docs.get(id).some((d) => fams.includes(d.family))))
  .map(([name]) => name));

/** One claimed table per document × keyed family, drawn by `rand`. */
const sampleTables = (docs, setIds, rand) => setIds.flatMap((id) => docs.get(id).map(({ family, table_rows }) => {
  const tables = Object.keys(table_rows).sort();
  const pick = tables[Math.floor(rand() * tables.length)];
  return { set: id, family, table: pick, claimed_rows: table_rows[pick], keyed_rows_max: Math.min(table_rows[pick], KEY_ROWS_PER_TABLE_MAX), tables_in_stratum: tables.length };
}));

/**
 * WP0.2 draw (TRUTH): documents are grouped by drafter so no drafter sits on
 * both sides; drafter groups are shuffled by the seed; groups go to HELD-OUT
 * in that order until it holds ≥ HELDOUT_MIN_DOCS documents, skipping any
 * group whose removal would leave a required family uncovered on the dev
 * side. Then, per document and per keyed family (the family × drafter
 * stratum), ONE claimed table is drawn by the same seed, and every printed row
 * of it (up to KEY_ROWS_PER_TABLE_MAX) is keyed from the render.
 */
export function drawSplit(baseline, drafters, seed) {
  const rand = mulberry32(seed);
  const excluded = { ...(drafters.duplicates || {}), ...(drafters.derived || {}) };
  const docs = keyedDocs(baseline.per_set, (id) => !excluded[id]);
  const groups = Object.entries(drafters.groups)
    .map(([gid, g]) => ({ gid, sets: g.sets.filter((id) => docs.has(id)) }))
    .filter((g) => g.sets.length)
    .sort((a, b) => a.gid.localeCompare(b.gid));
  const ungrouped = [...docs.keys()].filter((id) => !groups.some((g) => g.sets.includes(id)));
  if (ungrouped.length) throw new Error(`drafters.json does not place: ${ungrouped.join(", ")}`);
  const order = seededShuffle(groups, rand);
  const heldout = [];
  let heldoutDocs = 0;
  const skipped = [];
  for (const g of order) {
    if (heldoutDocs >= HELDOUT_MIN_DOCS) break;
    const rest = groups.filter((x) => x !== g && !heldout.includes(x)).flatMap((x) => x.sets);
    const restCover = bucketsOf(docs, rest);
    const lost = [...bucketsOf(docs, g.sets)].filter((b) => !restCover.has(b));
    if (lost.length) { skipped.push({ group: g.gid, would_uncover: lost }); continue; }
    heldout.push(g);
    heldoutDocs += g.sets.length;
  }
  const dev = groups.filter((g) => !heldout.includes(g));
  // Tables are drawn dev first, then held-out, each in sorted set order, so
  // the draw is a pure function of (baseline, drafters, seed).
  const devSets = dev.flatMap((g) => g.sets).sort();
  const heldoutSets = heldout.flatMap((g) => g.sets).sort();
  const devTables = sampleTables(docs, devSets, rand);
  const heldoutTables = sampleTables(docs, heldoutSets, rand);
  return {
    seed,
    heldout_min_docs: HELDOUT_MIN_DOCS,
    key_rows_per_table_max: KEY_ROWS_PER_TABLE_MAX,
    population_docs: docs.size,
    shuffled_group_order: order.map((g) => g.gid),
    skipped_for_dev_coverage: skipped,
    dev: { groups: dev.map((g) => g.gid), sets: devSets, covers: [...bucketsOf(docs, devSets)], tables: devTables },
    heldout: { groups: heldout.map((g) => g.gid), sets: heldoutSets, covers: [...bucketsOf(docs, heldoutSets)], tables: heldoutTables },
    required_coverage_missing_from_population: REQUIRED_KEY_COVERAGE.map(([n]) => n)
      .filter((n) => !bucketsOf(docs, [...docs.keys()]).has(n)),
    // The copies this census measured and the draw left out (drafters.json
    // records later copies too; they were never in this population).
    excluded_from_population: Object.fromEntries(Object.entries(excluded)
      .filter(([id]) => baseline.per_set.some((r) => r.id === id))),
  };
}

export const TIER2_DEV_MIN_DOCS = 8;

/**
 * The second tier (AS-2, AS-17): a second dev tier and a second held-out
 * tier, drawn together from documents staged after the WP0.2 split, so the
 * normalizer can grow on more drafters and still be measured on drafters it
 * never saw. WP0.2's split never moves.
 *
 * Population: the census's documents (`census`: the unseen corpus sets,
 * `eligible`) with ≥ 1 compiled row in a keyed family, minus copies
 * drafters.json records, minus every document whose drafter group holds a
 * WP0.2 document: a held-out drafter's document is never tuned on, and a dev
 * drafter's adds no new drafter. Every population document must be placed in
 * a drafters.json group.
 *
 * The seed shuffles the groups; every group draws ONE document by the same
 * seed, so no drafter weighs more than another. Held-out 2 is filled first,
 * in the shuffled order, until it holds HELDOUT_MIN_DOCS documents: a group
 * goes to it only if none of its documents was `examined` (its control
 * drawings, cites or renders were looked at before the draw) and taking it
 * leaves every required family the population holds coverable by the rest.
 * A held-out-2 group's other documents are `withheld`: never keyed, tuned
 * on, or read as unseen (the held-out drafter rule). Dev 2 then takes the
 * remaining groups in the same order until it holds TIER2_DEV_MIN_DOCS
 * documents, then only groups whose drawn document covers a required family
 * dev 2 lacks, until it covers every one the population holds.
 *
 * Keying scope, both sides: one claimed table per document × keyed family,
 * drawn by the seed, every printed row up to KEY_ROWS_PER_TABLE_MAX.
 */
export function drawTier2(census, drafters, split, seed, { eligible, examined = [] }) {
  const rand = mulberry32(seed);
  const excluded = { ...(drafters.duplicates || {}), ...(drafters.derived || {}) };
  const eligibleSet = new Set(eligible);
  const all = keyedDocs(census.per_set, (id) => eligibleSet.has(id) && !excluded[id]);
  const groupOf = new Map();
  for (const [gid, g] of Object.entries(drafters.groups)) for (const id of g.sets) groupOf.set(id, gid);
  const unplaced = [...all.keys()].filter((id) => !groupOf.has(id));
  if (unplaced.length) throw new Error(`drafters.json does not place: ${unplaced.join(", ")}`);
  const splitSets = new Set([...split.dev.sets, ...split.heldout.sets]);
  const leftOut = [];
  const docs = new Map();
  for (const [id, fams] of all) {
    const mates = drafters.groups[groupOf.get(id)].sets.filter((s) => splitSets.has(s));
    // An eligible document by a held-out drafter is one the hygiene scan
    // (corpus-hygiene.py) failed to withhold: fix the scan, never draw around it.
    const held = mates.filter((s) => split.heldout.sets.includes(s));
    if (held.length) throw new Error(`${id} shares drafter group ${groupOf.get(id)} with held-out ${held.join(", ")}, yet it is eligible: the hygiene scan must withhold it`);
    if (mates.length) leftOut.push({ set: id, group: groupOf.get(id), shares_drafter_with: mates });
    else docs.set(id, fams);
  }
  const groups = [...new Set([...docs.keys()].map((id) => groupOf.get(id)))].sort()
    .map((gid) => ({ gid, sets: drafters.groups[gid].sets.filter((id) => docs.has(id)).sort() }));
  const order = seededShuffle(groups, rand).map((g) => ({ ...g, pick: g.sets[Math.floor(rand() * g.sets.length)] }));
  const need = bucketsOf(docs, [...docs.keys()]);
  const examinedSet = new Set(examined);

  const heldout = [];
  const skipped = [];
  for (const g of order) {
    if (heldout.length >= HELDOUT_MIN_DOCS) break;
    const seen = g.sets.filter((id) => examinedSet.has(id));
    if (seen.length) { skipped.push({ group: g.gid, examined: seen }); continue; }
    const rest = order.filter((x) => x !== g && !heldout.includes(x)).map((x) => x.pick);
    const lost = [...need].filter((b) => bucketsOf(docs, [g.pick]).has(b) && !bucketsOf(docs, rest).has(b));
    if (lost.length) { skipped.push({ group: g.gid, would_uncover: lost }); continue; }
    heldout.push(g);
  }
  const dev = [];
  const covered = () => bucketsOf(docs, dev.map((g) => g.pick));
  for (const g of order) {
    if (heldout.includes(g)) continue;
    if (dev.length < TIER2_DEV_MIN_DOCS) { dev.push(g); continue; }
    const have = covered();
    if ([...need].every((b) => have.has(b))) break;
    const adds = [...bucketsOf(docs, [g.pick])].filter((b) => !have.has(b));
    if (adds.length) dev.push({ ...g, added_for_coverage: adds });
  }
  const devSets = dev.map((g) => g.pick).sort();
  const heldoutSets = heldout.map((g) => g.pick).sort();
  const withheld = heldout.flatMap((g) => drafters.groups[g.gid].sets.filter((id) => id !== g.pick && eligibleSet.has(id))).sort();
  const devTables = sampleTables(docs, devSets, rand);
  const heldoutTables = sampleTables(docs, heldoutSets, rand);
  return {
    seed,
    heldout_min_docs: HELDOUT_MIN_DOCS,
    dev_min_docs: TIER2_DEV_MIN_DOCS,
    key_rows_per_table_max: KEY_ROWS_PER_TABLE_MAX,
    population_docs: docs.size,
    population_groups: groups.length,
    left_out_split_drafters: leftOut,
    examined,
    shuffled_group_order: order.map((g) => ({ group: g.gid, docs: g.sets.length, pick: g.pick })),
    skipped_for_heldout: skipped,
    dev: { groups: dev.map((g) => g.gid), sets: devSets, covers: [...bucketsOf(docs, devSets)], added_for_coverage: dev.filter((g) => g.added_for_coverage).map((g) => ({ group: g.gid, adds: g.added_for_coverage })), tables: devTables },
    heldout: { groups: heldout.map((g) => g.gid), sets: heldoutSets, covers: [...bucketsOf(docs, heldoutSets)], withheld, tables: heldoutTables },
    required_coverage_missing_from_population: REQUIRED_KEY_COVERAGE.map(([n]) => n).filter((n) => !need.has(n)),
    dev_coverage_missing: [...need].filter((b) => !bucketsOf(docs, devSets).has(b)),
  };
}
