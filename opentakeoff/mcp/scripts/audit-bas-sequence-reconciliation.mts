/** Real development-PDF diagnostic. Reviewed associations are fixture inputs,
 * not inferred applicability or real operator approvals. Does not edit sources. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Session } from '../src/session.ts';
import { runBasPointLists } from '../src/basMath.ts';
import { interpretBasSequences, reconcileBasSequencePoints, type BasSequenceAssociation } from '../../web/src/lib/basSequenceReconciliation.ts';
import { shutdownVectorGrid } from '../../web/src/lib/vectorGridClient.ts';
import { writeJsonAndExit } from './cliJson.mjs';

const [pdf, outputDirectory] = process.argv.slice(2);
assert.ok(pdf && outputDirectory, 'Usage: PDF OUTPUT_DIRECTORY');
const truth = JSON.parse(readFileSync(new URL('../../web/test/fixtures/bas-soo-monitor-cases.json', import.meta.url), 'utf8'));
const previous = JSON.parse(readFileSync(new URL('../../docs/bas-production/evidence/point-workspace-compile.json', import.meta.url), 'utf8'));
mkdirSync(outputDirectory, { recursive: true });
const start = performance.now();
const session = new Session();
let report;
try {
  await session.loadPlan(path.resolve(pdf));
  const sources = session.basSourcesForPipeline();
  assert.equal(sources.documents[0].sha256, truth.source_sha256, 'Only the independently reviewed development PDF belongs in this diagnostic');
  const graph = await session.graphForPipeline();
  const graphBefore = structuredClone(graph);
  const points = await runBasPointLists({ sources, tables: graph.tables });
  assert.deepEqual(points, previous.bas_point_lists, 'All previously captured point evidence remains unchanged');
  const analysis = interpretBasSequences(sources);
  const associations: BasSequenceAssociation[] = truth.reviewed_associations.map((review: { page: number; matrix_identity_cell: string; reference_span_index: number; reference_tag: string }) => {
    const regions = analysis.regions.filter(r => r.page_id.endsWith(`:p${review.page}`) && r.title === truth.title);
    const matrices = points.matrices.filter(m => m.page_id?.endsWith(`:p${review.page}`) && m.rows.some(r => r.name === review.matrix_identity_cell));
    assert.equal(regions.length, 1); assert.equal(matrices.length, 1);
    return { region_id: regions[0].region_id, matrix_id: matrices[0].matrix_id,
      review_origin: 'source_review_fixture', reason: 'Controlled association keyed from original diagram/sequence review, not an automatic join or approved takeoff.',
      equipment_references: [{ tag: review.reference_tag,
        span_ids: [`sha256:${truth.source_sha256}:p${review.page}:s${review.reference_span_index}`],
        scope: { building: null, level: null, system: null, phase: null } }] };
  });
  const result = await reconcileBasSequencePoints(sources, points, associations);
  let verified = 0;
  for (const expected of truth.cases) {
    const region = result.sequences.regions.find(r => r.page_id.endsWith(`:p${expected.page}`) && r.title === truth.title)!;
    const block = region.raw.blocks.find(b => b.kind === 'paragraph' && b.marker === expected.marker)!;
    const compared = result.comparisons.find(c => c.association.region_id === region.region_id)!.requirements.find(r => r.clause_id === block.block_id)!;
    assert.equal(compared.requirement.variable, expected.variable);
    assert.equal(compared.requirement.operating_mode, expected.mode);
    assert.equal(compared.requirement.modulation, expected.modulate);
    assert.equal(compared.requirement.target, expected.target);
    assert.equal(compared.listed_rows[0]?.local_key ?? null, expected.listed_row_key);
    assert.equal(compared.status, expected.listed_row_key === null ? 'not_listed_in_selected_matrix' : 'listed');
    if (expected.declared_channel) assert.ok(compared.listed_rows[0].observations.some(o => o.channel === expected.declared_channel && o.kind === 'declared_io' && o.value === 1));
    assert.equal(compared.requirement.signal_type, null);
    assert.equal(compared.installed_quantity, null);
    verified++;
  }
  assert.equal(result.comparisons.flatMap(c => c.requirements).length, verified);
  assert.deepEqual(await reconcileBasSequencePoints(sources, points, associations), result);
  assert.deepEqual(session.basSourcesForPipeline(), sources);
  assert.deepEqual(graph, graphBefore);
  report = { scope: 'Real Session PDF/text/graph/point interpreter -> shared bounded SOO comparison. Source-reviewed fixture associations; not production UI/MCP integration or automatic equipment assignment.',
    source_sha256: truth.source_sha256, exact_reviewed_requirements: verified,
    listed: result.comparisons.flatMap(c => c.requirements).filter(r => r.status === 'listed').length,
    not_listed_in_selected_matrix: result.comparisons.flatMap(c => c.requirements).filter(r => r.status === 'not_listed_in_selected_matrix').length,
    previous_points_exactly_unchanged: true, graph_and_sources_unchanged: true, replay_exact: true,
    installed_quantity_derived: false, project_complete: false,
    elapsed_ms: Math.round(performance.now() - start), main_process_peak_rss_bytes: process.resourceUsage().maxRSS * 1024 };
  writeFileSync(path.join(outputDirectory, 'comparison.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(path.join(outputDirectory, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
} finally { shutdownVectorGrid(); }
await writeJsonAndExit(report);
