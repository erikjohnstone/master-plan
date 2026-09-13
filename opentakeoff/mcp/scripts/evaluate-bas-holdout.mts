/**
 * Frozen BAS-workflow holdout evaluator.
 *
 * This is a read-only acceptance diagnostic. It opens only inventory entries
 * already reserved as `new_workflow_holdout`, runs the unchanged shared
 * Session/production workflow, and compares bounded source/table facts with
 * the independently authored benchmark record. It never writes a key, changes
 * a scorer, applies a review decision, or feeds a result back into production.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Session } from '../src/session.ts';
import { compileProductionTakeoff } from '../src/productionTakeoff.ts';
import { shutdownVectorGrid } from '../../web/src/lib/vectorGridClient.ts';
import { verifyBasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { basSequenceView } from '../../web/src/lib/basReview.ts';
import { basEquipmentView } from '../../web/src/lib/basEquipmentReview.ts';
import { basProjectReview } from '../../web/src/lib/basProjectReview.ts';

const [inventoryPath, groundTruthRoot, outputDir, requestedId] = process.argv.slice(2);
if (!inventoryPath || !groundTruthRoot || !outputDir || !requestedId) {
  throw new Error('usage: evaluate-bas-holdout.mts INVENTORY GROUND_TRUTH_ROOT OUTPUT_DIR HOLDOUT_ID');
}

type Box = [number, number, number, number];
const inventory = JSON.parse(await readFile(path.resolve(inventoryPath), 'utf8'));
const item = inventory.selected.find((entry: { id: string }) => entry.id === requestedId);
assert.ok(item, `Unknown inventory entry: ${requestedId}`);
assert.equal(item.split, 'new_workflow_holdout', 'This evaluator may open only the frozen holdout');

const pdfPath = path.resolve(inventory.source_roots.collection, item.relative_path);
const recordPath = path.resolve(groundTruthRoot, 'records', `${item.id}.json`);
const sourceBytes = await readFile(pdfPath);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
const recordBytes = await readFile(recordPath);
const recordHash = createHash('sha256').update(recordBytes).digest('hex');
const record = JSON.parse(recordBytes.toString('utf8'));
assert.equal(sourceHash, item.sha256, 'Inventory/PDF byte identity differs');
assert.equal(record.source_sha256, item.sha256, 'Independent record belongs to another PDF');
assert.equal(record.page_count, item.pages, 'Independent record page count differs');

const pointTruth = record.modules?.points ?? { tables: [] };
const controlsTruth = record.modules?.controls_context ?? {};
const equipmentTruth = record.modules?.equipment_reconciliation ?? {};
const truthTables = Array.isArray(pointTruth.tables) ? pointTruth.tables : [];
const truthTableSummaries = truthTables.map((table: Record<string, unknown>) => {
  const x = Array.isArray(table.x_edges) ? table.x_edges.filter(Number.isFinite) as number[] : [];
  const y = Array.isArray(table.y_ranges)
    ? (table.y_ranges as unknown[]).filter((value): value is [number, number] => Array.isArray(value)
      && value.length === 2 && value.every(Number.isFinite)) : [];
  const region: Box | null = x.length >= 2 && y.length
    ? [Math.min(...x), Math.min(...y.map(value => value[0])), Math.max(...x), Math.max(...y.map(value => value[1]))]
    : null;
  return {
    id: String(table.id ?? ''), page: Number(table.page),
    sheet: String(table.sheet ?? pointTruth.source_sheet ?? ''),
    title: String(table.title ?? table.title_as_printed ?? ''),
    rows: Array.isArray(table.rows) ? table.rows.length : null,
    region,
  };
});

const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const pageNumber = (pageId: string | null) => Number(pageId?.match(/:p([1-9]\d*)$/)?.[1] ?? NaN);

const session = new Session();
const start = performance.now();
let result: Record<string, unknown>;
try {
  await session.loadPlan(pdfPath);
  const sources = session.basSourcesForPipeline();
  assert.equal(sources.documents.length, 1);
  assert.equal(sources.documents[0].sha256, item.sha256);
  assert.equal(sources.pages.length, item.pages);
  const graphStart = performance.now();
  const graph = await session.graphForPipeline();
  const graphMs = performance.now() - graphStart;
  const compileStart = performance.now();
  const compiled = await compileProductionTakeoff(session, graph, 'bas_points') as Record<string, unknown>;
  const compileMs = performance.now() - compileStart;
  assert.ok(compiled.bas_workflow, 'Production compile did not retain a BAS workflow');
  const workflow = await verifyBasWorkflow(compiled.bas_workflow);
  const captureId = workflow.current_capture_id;
  assert.ok(captureId);
  const capture = workflow.captures.find(candidate => candidate.capture_id === captureId)!;
  const sequence = await basSequenceView(workflow, captureId);
  const equipment = await basEquipmentView(workflow, captureId);
  const review = await basProjectReview(workflow, captureId);

  const actualMatrices = capture.points.matrices.map(matrix => ({
    matrix_id: matrix.matrix_id, page: pageNumber(matrix.page_id), sheet: matrix.raw.sheet,
    title: matrix.raw.title?.text ?? '', region: matrix.raw.region,
    rows: matrix.rows.length, statuses: Object.fromEntries(['interpreted', 'unpopulated', 'no_typed_requirement', 'review_required']
      .map(status => [status, matrix.rows.filter(row => row.status === status).length])),
    observations: matrix.rows.reduce((sum, row) => sum + row.observations.length, 0),
    ambiguous_observations: matrix.rows.reduce((sum, row) => sum + row.observations.filter(value => value.status === 'ambiguous').length, 0),
    unobserved_columns: matrix.rows.reduce((sum, row) => sum + row.unobserved_columns.length, 0),
    uninterpreted_columns: matrix.rows.reduce((sum, row) => sum + row.uninterpreted_columns.length, 0),
    issues: matrix.issues,
  }));
  const pointMatches = truthTableSummaries.map(expected => {
    const candidates = actualMatrices.filter(actual => actual.page === expected.page).map(actual => {
      const title = expected.title && actual.title
        ? (normalize(actual.title).includes(normalize(expected.title)) || normalize(expected.title).includes(normalize(actual.title)) ? 1 : 0) : 0;
      const sheet = normalize(actual.sheet) === normalize(expected.sheet) ? 1 : 0;
      // The independent records do not declare their render scale, while the
      // Session contract is image_px. Do not pretend those boxes are directly
      // comparable or use an inferred corpus-specific scale in matching.
      return { actual, score: title * 2 + sheet };
    }).sort((a, b) => b.score - a.score || a.actual.matrix_id.localeCompare(b.actual.matrix_id));
    const best = candidates[0];
    const matched = !!best && best.score > 0;
    return {
      expected, matched, actual_matrix_id: matched ? best.actual.matrix_id : null,
      actual_rows: matched ? best.actual.rows : null,
      exact_row_count: matched && expected.rows !== null ? best.actual.rows === expected.rows : null,
      bounded_geometry_overlap: null,
      geometry_comparison: 'not_run_independent_record_has_no_declared_coordinate_frame',
    };
  });
  const matchedActual = new Set(pointMatches.map(match => match.actual_matrix_id).filter(Boolean));

  const titleExpectations = (Array.isArray(controlsTruth.sequence_inventory) ? controlsTruth.sequence_inventory : [])
    .filter((entry: Record<string, unknown>) => typeof entry.title_as_printed === 'string')
    .map((entry: Record<string, unknown>) => ({ title: entry.title_as_printed, page: Number(entry.page), sheet: String(entry.sheet ?? '') }));
  const actualRegions = sequence.sequences.regions.map(region => ({
    region_id: region.region_id, page: pageNumber(region.raw.page_id), title: region.title,
    status: region.raw.status, clauses: region.clauses.length,
    interpreted_clauses: region.clauses.filter(clause => clause.status === 'interpreted').length,
    uninterpreted_clauses: region.clauses.filter(clause => clause.status !== 'interpreted').length,
  }));
  const titleMatches = titleExpectations.map(expected => ({ ...expected,
    actual_region_id: actualRegions.find(actual => actual.page === expected.page
      && (normalize(actual.title).includes(normalize(expected.title)) || normalize(expected.title).includes(normalize(actual.title))))?.region_id ?? null,
  }));
  const accounting = Object.fromEntries(Object.keys(sources.pages[0]?.spans ? sequence.sequences.discovery.pages[0]?.accounting ?? {} : {})
    .map(key => [key, sequence.sequences.discovery.pages.reduce((sum, page) => sum
      + ((page.accounting as Record<string, string[]>)[key]?.length ?? 0), 0)]));
  const equipmentRows = equipment.candidates.tables.flatMap(table => table.rows);
  const issueCounts = new Map<string, number>();
  for (const issue of review.issues) {
    const key = `${issue.domain}:${issue.severity}:${issue.code}`;
    issueCounts.set(key, (issueCounts.get(key) ?? 0) + 1);
  }
  const sourceText = {
    pages: sources.pages.length,
    spans: sources.pages.reduce((sum, page) => sum + page.spans.length, 0),
    no_text_pages: sources.pages.filter(page => page.text_status === 'no_text').length,
  };
  const totalExpectedRows = truthTableSummaries.reduce((sum, table) => sum + (table.rows ?? 0), 0);
  const pointTruthKind = truthTableSummaries.length ? 'authored_point_tables'
    : Number(pointTruth.point_summary?.diagram_callouts_total ?? 0) > 0 ? 'diagram_callouts_not_point_table'
      : 'no_authored_point_table';
  result = {
    schema_version: 'bas_holdout_evaluation_v1', evaluated_utc: new Date().toISOString(),
    split: item.split, rules_frozen_before_open: true, production_rules_changed_from_result: false,
    document: { id: item.id, rank: item.rank, title: item.title, pdf_sha256: sourceHash,
      pages: item.pages, bytes: sourceBytes.byteLength, independent_record_sha256: recordHash,
      independent_record_review_status: record.review_status,
      independent_record_claim_is_reverified: item.truth?.claim_is_independently_reverified ?? null },
    source_accounting: { ...sourceText, exhaustive_partition: accounting,
      source_hash_and_page_count_match: true, workflow_schema_and_fingerprints_pass: true },
    graph_inventory: {
      tables: graph.tables.length,
      tables_by_kind: Object.fromEntries([...new Set(graph.tables.map(table => table.kind))].sort()
        .map(kind => [kind, graph.tables.filter(table => table.kind === kind).length])),
      table_details: graph.tables.map(table => ({
        sheet: table.sheet,
        kind: table.kind,
        title: table.title?.text ?? '',
        region: table.region ?? null,
        headers: table.headers,
        rows: table.rows.length,
      })),
    },
    point_lists: {
      truth_kind: pointTruthKind, expected_tables: truthTableSummaries.length, expected_rows: totalExpectedRows,
      expected_diagram_callouts_not_tables: pointTruth.point_summary?.diagram_callouts_total ?? 0,
      actual_matrices: actualMatrices.length, actual_rows: actualMatrices.reduce((sum, matrix) => sum + matrix.rows, 0),
      actual_observations: actualMatrices.reduce((sum, matrix) => sum + matrix.observations, 0),
      authored_table_matches: pointMatches,
      unmatched_actual_candidates: actualMatrices.filter(matrix => !matchedActual.has(matrix.matrix_id)),
    },
    bas_math: compiled.bas_math && typeof compiled.bas_math === 'object' ? {
      status: (compiled.bas_math as Record<string, unknown>).status ?? null,
      source_coverage: (compiled.bas_math as Record<string, unknown>).source_coverage ?? null,
      physical_total: (compiled.bas_math as Record<string, unknown>).physical_total ?? null,
      calculated_rows: Array.isArray((compiled.bas_math as Record<string, unknown>).points)
        ? ((compiled.bas_math as Record<string, unknown>).points as unknown[]).length : null,
    } : null,
    sequences: {
      authored_titled_regions: titleExpectations.length, authored_title_matches: titleMatches,
      authored_sequence_inventory_items: Array.isArray(controlsTruth.sequence_inventory) ? controlsTruth.sequence_inventory.length : 0,
      authored_summary_groups: controlsTruth.sequence_of_operations && typeof controlsTruth.sequence_of_operations === 'object'
        ? Object.keys(controlsTruth.sequence_of_operations).length : 0,
      authored_summary_clauses: Array.isArray(controlsTruth.sequences) ? controlsTruth.sequences.length : 0,
      actual_regions: actualRegions, actual_region_count: actualRegions.length,
      actual_clause_count: actualRegions.reduce((sum, region) => sum + region.clauses, 0),
      discovery_complete: sequence.sequences.discovery_complete,
      interpretation_complete: sequence.sequences.interpretation_complete,
    },
    equipment_candidates: {
      authored_schedule_counts: equipmentTruth.schedule_counts ?? null,
      actual_tables: equipment.candidates.tables.length, actual_rows: equipmentRows.length,
      tables: equipment.candidates.tables.map(table => ({ table_id: table.table_id, sheet: table.raw.sheet,
        title: table.raw.title?.text ?? '', rows: table.rows.length,
        rows_with_issues: table.rows.filter(row => row.issues.length).length,
        issue_codes: [...new Set(table.rows.flatMap(row => row.issues))].sort() })),
      rows_with_issues: equipmentRows.filter(row => row.issues.length).length,
      issue_codes: [...new Set(equipmentRows.flatMap(row => row.issues))].sort(),
      installed_quantity_values: [...new Set(equipmentRows.map(row => row.installed_quantity))],
      review_status: equipment.status,
    },
    initial_human_in_loop_state: {
      review_events: workflow.review_events?.length ?? 0, equipment_events: workflow.equipment_events?.length ?? 0,
      assembly_events: workflow.assembly_events?.length ?? 0, engineering_events: workflow.engineering_events?.length ?? 0,
      project_complete: false, installed_quantity: null,
      findings: review.issues.length,
      blockers: review.issues.filter(issue => issue.severity === 'blocker').length,
      findings_by_domain_severity_code: Object.fromEntries([...issueCounts].sort(([a], [b]) => a.localeCompare(b))),
    },
    performance: { graph_ms: Math.round(graphMs), compile_and_capture_ms: Math.round(compileMs),
      total_ms: Math.round(performance.now() - start), peak_rss_bytes: process.resourceUsage().maxRSS * 1024 },
    assessment_boundary: 'Independent source facts versus frozen automatic capture. Unmatched candidates require source review; they are not automatically labeled false positives. No human applicability, assembly, responsibility, compatibility, revision, approval, or installed-count decision is manufactured by this audit.',
  };
} finally {
  shutdownVectorGrid();
}

await mkdir(path.resolve(outputDir), { recursive: true });
const outputPath = path.resolve(outputDir, `${item.id}.json`);
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: outputPath, document: item.id, performance: result.performance,
  point_lists: result.point_lists, sequences: result.sequences, equipment_candidates: result.equipment_candidates }, null, 2));
