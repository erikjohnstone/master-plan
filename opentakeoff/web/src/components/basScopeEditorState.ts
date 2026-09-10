/** Surface-only draft helpers. The shared compiler validates every selection. */
import { basDeliverableTargetKey, BAS_SCOPE_TARGET_LIMIT, type BasDeliverableScopeSpec, type BasDeliverableTarget } from '../lib/basDeliverableScopeContract.ts';
import type { BasScopeCatalog } from '../lib/basScopeCatalog.ts';
export const SCOPE_CLAIM_LABELS = { scheduled_equipment: 'Scheduled equipment', assigned_points: 'Assigned points',
  assembly_components: 'Assembly components', responsibilities: 'Responsibilities', engineering_compatibility: 'Engineering compatibility' };
/** Display ordinals disambiguate repeated labels; selection still uses the full owned key. */
export function scopeChoiceLabels(targets: BasScopeCatalog['targets']) {
  const names = targets.map(t => `${SCOPE_CLAIM_LABELS[t.target.claim]} ${t.label}`);
  const counts = new Map<string, number>(); for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  return new Map(targets.map((t, i) => [basDeliverableTargetKey(t.target), names[i] +
    (counts.get(names[i])! > 1 ? ` · Review item ${i + 1} · ${t.capture_label}` : '')]));
}
export function scopeWindow<T>(rows: T[], rawPage: number = 0) {
  const page = Math.max(0, Math.min(Number.isFinite(rawPage) ? Math.trunc(rawPage) : 0, Math.max(0, Math.ceil(rows.length / 50) - 1)));
  return { page, rows: rows.slice(page * 50, (page + 1) * 50), total: rows.length };
}
export function populateScopeDraft(specification: BasDeliverableScopeSpec, catalog: BasScopeCatalog): BasDeliverableScopeSpec {
  if (catalog.targets.length > BAS_SCOPE_TARGET_LIMIT) throw new Error('More than 2,000 available claims. Choose a smaller explicit scope; nothing was truncated.');
  const excluded = new Set(specification.excluded.map(e => basDeliverableTargetKey(e.target)));
  return { ...specification, included: catalog.targets.filter(t => !excluded.has(basDeliverableTargetKey(t.target))).map(t => t.target) };
}
export function selectScopeTarget(specification: BasDeliverableScopeSpec, target: BasDeliverableTarget, disposition: 'included' | 'excluded' | 'unselected'): BasDeliverableScopeSpec {
  const key = basDeliverableTargetKey(target), old = specification.excluded.find(e => basDeliverableTargetKey(e.target) === key);
  const included = specification.included.filter(t => basDeliverableTargetKey(t) !== key);
  const excluded = specification.excluded.filter(e => basDeliverableTargetKey(e.target) !== key);
  if (disposition === 'included') included.push(target);
  if (disposition === 'excluded') excluded.push(old ?? { target, reason: '', consequence: '', evidence: [] });
  if (included.length + excluded.length > BAS_SCOPE_TARGET_LIMIT) throw new Error('Scope exceeds 2,000 claims. Existing draft is unchanged.');
  return { ...specification, included, excluded };
}
