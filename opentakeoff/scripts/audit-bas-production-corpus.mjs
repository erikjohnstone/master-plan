// Offline inventory only. Never imported by production or used to infer truth.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.argv[2]) throw new Error('Pass the original MASTER PLAN corpus root as the first argument');
const root = resolve(process.argv[2]);
const output = resolve(process.argv[3] || 'docs/bas-production/corpus-inventory.json');
const collection = resolve(root, 'HVAC BAS Benchmark Collection');
const archiveRoot = resolve(root, 'opentakeoff-corpus/bulk/focus-group-2026-09-04');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const manifest = read(resolve(collection, 'manifest.json'));
const status = read(resolve(collection, 'ground_truth/status.json'));
// Reserved before new workflow rules or document bodies are inspected. These
// are NOT claimed to have been unseen in the platform's historical development.
const holdoutRanks = new Set([5, 8, 15, 19, 24, 27]);
const holdoutSourceIds = new Set(manifest.entries.filter(e => holdoutRanks.has(e.rank)).map(e => e.source_set_id));
const holdoutHashes = new Set(manifest.entries.filter(e => holdoutRanks.has(e.rank)).flatMap(e => [e.sha256, ...e.source_parts.map(p => p.sha256)]));
const check = (path, expected) => {
  if (!existsSync(path)) return { exists: false, matches: false, sha256: null, bytes: null };
  const sha256 = digest(path);
  return { exists: true, matches: sha256 === expected, sha256, bytes: statSync(path).size };
};
const selected = manifest.entries.map(e => {
  const state = status.documents.find(d => d.rank === e.rank);
  const path = resolve(collection, e.output_file);
  return {
    id: `${String(e.rank).padStart(2, '0')}__${e.key}`, rank: e.rank,
    title: e.title, source_set_id: e.source_set_id, pages: e.page_count,
    relative_path: e.output_file, ...check(path, e.sha256),
    split: holdoutRanks.has(e.rank) ? 'new_workflow_holdout' : 'development',
    truth: {
      ledger_complete_claim: state?.complete ?? false,
      ledger_updated_utc: status.updated_utc,
      modules: state?.partial_modules.length ?? 0,
      verification_flags_current: state?.partial_modules.every(m => m.verification_current && m.pass) ?? false,
      claim_is_independently_reverified: false,
    },
  };
});
const sets = ['vol1', 'vol2'].flatMap(volume => read(resolve(archiveRoot, `${volume}-inventory.json`))).map(e => ({
  id: e.id, volume: e.volume,
  title: e.archive_metadata?.project || e.name,
  // Inventory vocabulary is screening metadata, NOT complete BAS ground truth.
  bas_screening_terms: e.archive_metadata?.bas_strong_terms || '',
  split: holdoutSourceIds.has(e.id) || e.parts.some(p => holdoutHashes.has(p.sha256)) ? 'new_workflow_holdout' : 'development',
  parts: e.parts.map(p => ({ relative_path: p.path, pages: p.pages, ...check(resolve(archiveRoot, p.path), p.sha256) })),
}));
const parts = sets.flatMap(s => s.parts);
const mismatches = [
  ...selected.filter(p => !p.matches).map(p => p.relative_path),
  ...parts.filter(p => !p.matches).map(p => p.relative_path),
];
const result = {
  schema_version: 1, audited_utc: new Date().toISOString(),
  source_roots: { collection, archiveRoot },
  baseline_commit: '161583a4',
  scope: 'Metadata and source-byte inventory, not extraction scoring or ground-truth certification.',
  holdout_policy: {
    reserved_ranks: [...holdoutRanks],
    scope: 'Untouched by NEW workflow rule development; historical platform exposure is known and prevents claiming never-seen generalization.',
    require_no_body_or_key_inspection_until_frozen_evaluation: true,
    retire_holdout_status_if_used_for_debugging: true,
    exclude_known_duplicate_source_hashes_from_development: true,
  },
  summary: {
    focus_documents: selected.length, focus_pages: selected.reduce((n, e) => n + e.pages, 0),
    focus_hash_matches: selected.filter(p => p.matches).length,
    source_sets: sets.length, source_parts: parts.length,
    source_pages: parts.reduce((n, p) => n + p.pages, 0),
    source_part_hash_matches: parts.filter(p => p.matches).length,
    unique_source_part_hashes: new Set(parts.map(p => p.sha256).filter(Boolean)).size,
    bas_screened_sets: sets.filter(s => s.bas_screening_terms).length,
    holdout_focus_documents: selected.filter(p => p.split === 'new_workflow_holdout').length,
    truth_ledger_complete_claims: selected.filter(p => p.truth.ledger_complete_claim).length,
  }, selected, sets, mismatches,
};
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result.summary, mismatches, output }, null, 2));
if (mismatches.length) process.exitCode = 1;
