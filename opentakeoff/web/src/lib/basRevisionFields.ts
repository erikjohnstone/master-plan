/** Shared, bounded semantic projection of verified inventory records. Original
 * JSON/citations remain intact. This is not arbitrary prose interpretation. */
import type { BasRevisionItem } from './basRevisionInventory.ts';
import { basEngineeringCheckSchema } from './basEngineeringContract.ts';
import { basEngineeringReferences } from './basEngineeringRegister.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { normalizedBasVariable } from './basSequenceReconciliation.ts';

type Obj = Record<string, unknown>;
export type RevisionIdentity = (kind: BasRevisionItem['kind'], subjectId: string) => string;
export type RevisionLookup = (kind: BasRevisionItem['kind'], subjectId: string) => BasRevisionItem | null;
const object = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const pick = (v: unknown, keys: string[]): Obj => Object.fromEntries(keys.filter(k => Object.prototype.hasOwnProperty.call(object(v), k)).map(k => [k, object(v)[k]]));
const without = (v: unknown, keys: string[]): Obj => Object.fromEntries(Object.entries(object(v)).filter(([k]) => !keys.includes(k)));
const sort = (v: unknown[]) => [...v].sort((a, b) => canonicalBasJson(a).localeCompare(canonicalBasJson(b)));
const cells = (v: unknown) => Object.fromEntries(Object.entries(object(v)).map(([key, c]) => [key, object(c).text]));
const note = (v: unknown) => ({ ...pick(v, ['kind', 'subject']), source_text: object(object(v).source).text ?? null });

export function revisionDeclaredFields(item: BasRevisionItem, identity: RevisionIdentity, lookup: RevisionLookup) {
  const raw = object(JSON.parse(item.original_json));
  const ids = (v: unknown, kind: BasRevisionItem['kind']) => sort(array(v).map(id => identity(kind, String(id))));
  const refs = sort(item.references.map(r => ({ relation: r.relation, kind: r.kind, identity: identity(r.kind, r.subject_id) })));
  const fields: Obj = { relations: refs };
  const assign = (v: Obj) => Object.assign(fields, v);
  const assignment = (v: unknown) => ({ ...pick(v, ['applicability', 'quantity_basis', 'reason']),
    matrix: identity('point_matrix', String(object(v).matrix_id)),
    scope: object(v).scope_id ? identity('scope', String(object(v).scope_id)) : null,
    equipment: ids(object(v).equipment_ids, 'equipment'), excluded_equipment: ids(object(v).excluded_equipment_ids, 'equipment'),
    sequences: ids(object(v).sequence_region_ids, 'sequence_region') });
  const component = (v: unknown) => ({ ...pick(v, ['label', 'component_kind', 'quantity', 'lifecycle', 'disposition', 'exclusion_reason', 'member_exclusion_reason', 'reason']),
    condition: without(object(v).condition, ['source_span_ids']), scope: identity('scope', String(object(v).scope_id)),
    equipment: ids(object(v).equipment_ids, 'equipment'), excluded_equipment: ids(object(v).excluded_equipment_ids, 'equipment'),
    declarations: ids(object(v).source_requirement_ids, 'component_requirement') });
  switch (item.kind) {
    case 'drawing_page':
      assign({ ...pick(raw, ['width_px', 'height_px', 'rotation', 'text_status']), retained_text: array(raw.spans).map(s => object(s).text) }); break;
    case 'point_matrix':
      assign({ title: object(object(raw.raw).title).text ?? null, headers: object(raw.raw).headers,
        ...pick(raw, ['header_rows', 'quantity_basis', 'issues']), notes: array(raw.notes).map(note) }); break;
    case 'point_row':
      assign({ ...pick(raw, ['name', 'status', 'issues', 'uninterpreted_columns', 'unobserved_columns', 'field_wiring_status']),
        source_cells: cells(object(raw.raw).cells), qualifiers: array(raw.qualifiers).map(note),
        observations: sort(array(raw.observations).map(o => ({ ...pick(o, ['kind', 'channel', 'value', 'status']),
          column: object(object(o).source).column ?? null }))) }); break;
    case 'sequence_region':
      assign({ ...pick(raw, ['title', 'status', 'boundary', 'interpretation_status']), heading: object(raw.heading).text ?? null,
        heading_context: array(raw.heading_context).map(h => object(h).text) }); break;
    case 'sequence_clause': assign(pick(raw, ['kind', 'reading_text', 'status', 'uninterpreted_text'])); break;
    case 'sequence_requirement': assign(without(raw, ['requirement_id'])); break;
    case 'sequence_link':
      assign({ ...pick(raw, ['reason', 'review_origin']), equipment_references: sort(array(raw.equipment_references).map(e => pick(e, ['tag', 'scope']))) }); break;
    case 'equipment_table':
      assign({ ...pick(raw, ['kind', 'headers', 'building']), title: object(raw.title).text ?? null }); break;
    case 'equipment_row':
      assign({ source_cells: cells(object(raw.raw).cells), ...pick(object(raw.interpreted), ['membership', 'printed_quantity', 'named_member_count', 'building_hint', 'scope_status', 'issues']) }); break;
    case 'scope': assign(without(raw, ['scope_id', 'source_span_ids'])); break;
    case 'equipment':
      assign({ ...pick(raw, ['tag', 'reason']), scope: identity('scope', String(raw.scope_id)),
        bindings: sort(array(raw.bindings).map(b => ({ member: object(b).member, occurrence: identity('equipment_row', String(object(b).occurrence_id)) }))) }); break;
    case 'assignment': assign(assignment(raw)); break;
    case 'component_requirement': assign(without(raw, ['requirement_id'])); break;
    case 'assembly_component': assign(component(raw)); break;
    case 'responsibility_claim': assign(without(raw, ['claim_id', 'source_span_ids'])); break;
    case 'responsibility_resolution': assign(pick(raw, ['activity', 'reason'])); break;
    case 'engineering_resource':
      assign({ ...pick(raw, ['roles', 'label', 'reason']), equipment: identity('equipment', String(raw.equipment_id)),
        scope: identity('scope', String(raw.scope_id)), component: raw.component_id ? identity('assembly_component', String(raw.component_id)) : null }); break;
    case 'engineering_check': {
      const check = basEngineeringCheckSchema.parse(raw.check);
      const resourcePaths = new Map(basEngineeringReferences(check).map(r => [r.input_path, r.resource_id]));
      if (check.kind === 'power') check.scenarios.forEach((s, i) => s.states.forEach((state, j) => {
        resourcePaths.set(`scenarios.${i}.states.${j}.load_id`, state.load_id);
      }));
      // Explicit allowed-base/check references, not arbitrary strings in ratings.
      // Unregistered alternatives stay literal; no fabricated resource identity.
      const knownReference = (kind: BasRevisionItem['kind'], id: string) => lookup(kind, id) ? identity(kind, id) : { literal: id };
      // Only a validated engineering-check schema enters this traversal. Explicit
      // resource paths come from its existing authority, not suffix guessing.
      const walk = (v: unknown, path = ''): unknown => {
        if (resourcePaths.has(path)) return identity('engineering_resource', resourcePaths.get(path)!);
        if (check.kind === 'expansion' && path === 'power_check_id') return v === null ? null : knownReference('engineering_check', String(v));
        if (check.kind === 'expansion' && /^modules\.\d+\.compatible_base_ids\.value$/.test(path))
          return sort(array(v).map(id => knownReference('engineering_resource', String(id))));
        if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}.${i}`));
        if (!v || typeof v !== 'object') return v;
        return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'check_id' && k !== 'source_span_ids').map(([k, value]) => {
          const at = path ? `${path}.${k}` : k;
          if (k === 'equipment_id' || k === 'owner_equipment_id') return [k, identity('equipment', String(value))];
          if (k === 'equipment_ids') return [k, ids(value, 'equipment')];
          if (k === 'scope_id') return [k, identity('scope', String(value))];
          if (k === 'value' && path.split('.').at(-1) === 'allowed_scope_ids') return [k, ids(value, 'scope')];
          return [k, walk(value, at)];
        }));
      };
      assign({ input: walk(check), applicability: without(raw.target, ['check_id', 'resource_ids', 'source_span_ids']),
        outcome_status: pick(raw.saved_result, ['kind', 'status']),
        constraint_statuses: array(object(raw.saved_result).constraints).map(c => pick(c, ['status', 'input_paths', 'missing_inputs'])) }); break;
    }
    case 'assigned_observation': {
      const observation = object(raw.observation), original = object(observation.original);
      assign({ assignment: assignment(raw.assignment), ...pick(raw, ['replication_factor']),
        included_equipment: ids(raw.included_equipment_ids, 'equipment'), qualifiers: array(raw.qualifiers).map(note),
        observation: { ...pick(observation, ['status', 'assigned_value']), original: pick(original, ['kind', 'channel', 'value', 'status']),
          source_column: object(original.source).column ?? null } }); break;
    }
    case 'assembly_quantity':
      assign({ component: component(raw.original), ...pick(raw, ['replication_factor', 'eligibility', 'status', 'assigned_quantity', 'issues', 'installed_quantity']),
        included_equipment: ids(raw.included_equipment_ids, 'equipment') }); break;
    default: { const exhaustive: never = item.kind; throw new Error(`Unsupported revision inventory kind: ${exhaustive}`); }
  }
  return fields;
}

/** Identify a quantity by its declared channel/source column, not observation
 * position. Raw metric/value_path remain intact for original-value inspection. */
export function revisionQuantityContext(item: BasRevisionItem, q: BasRevisionItem['quantities'][number], identity: RevisionIdentity,
  lookup: RevisionLookup) {
  const raw = object(JSON.parse(item.original_json)), fields = revisionDeclaredFields(item, identity, lookup);
  const scope = (id: unknown) => {
    const record = lookup('scope', String(id));
    return { identity: identity('scope', String(id)), declared: record
      ? pick(JSON.parse(record.original_json), ['building', 'level', 'system', 'phase']) : null };
  };
  const members = (v: unknown) => sort(array(v).map(id => {
    const record = lookup('equipment', String(id)), equipment = record ? object(JSON.parse(record.original_json)) : null;
    return { identity: identity('equipment', String(id)), declared: equipment ? { tag: equipment.tag, scope: scope(equipment.scope_id),
      bindings: sort(array(equipment.bindings).map(b => ({ member: object(b).member,
        occurrence: identity('equipment_row', String(object(b).occurrence_id)) }))) } : null };
  }));
  let metric = q.metric;
  const hard: Obj = { kind: item.kind, dimension: q.dimension, basis: q.basis }, membership: Obj = {};
  const ofObservation = (o: Obj) => {
    const column = object(o.source).column ?? null;
    Object.assign(hard, pick(o, ['kind', 'channel']), { source_column: column });
    metric = canonicalBasJson([item.kind, q.metric.startsWith('observation:') ? 'observation' : q.metric, o.kind, o.channel, column]);
  };
  if (item.kind === 'point_row') {
    const index = Number(q.value_path.split('.')[1]), o = object(array(raw.observations)[index]); ofObservation(o);
    hard.variable = normalizedBasVariable(String(raw.name)); hard.qualifiers = array(raw.qualifiers).map(note);
    hard.matrix = fields.relations;
  } else if (item.kind === 'equipment_row') {
    hard.building = object(raw.interpreted).building_hint ?? null;
    membership.named_members = object(object(raw.interpreted).membership).members ?? null;
  } else if (item.kind === 'component_requirement') {
    Object.assign(hard, pick(raw, ['subject_label', 'component_kind', 'fan_role', 'component_role', 'protocol_requirement', 'quantity_basis']));
  } else if (item.kind === 'assembly_component' || item.kind === 'assembly_quantity') {
    const c = item.kind === 'assembly_component' ? raw : object(raw.original), quantity = object(c.quantity);
    Object.assign(hard, pick(c, ['component_kind', 'lifecycle', 'disposition']), { declaration_basis: quantity.basis,
      condition: pick(c.condition, ['status', 'statement']), scope: scope(c.scope_id) });
    Object.assign(membership, { equipment: members(c.equipment_ids), excluded: members(c.excluded_equipment_ids) }, pick(raw, ['replication_factor']));
  } else if (item.kind === 'assigned_observation') {
    const a = object(raw.assignment); ofObservation(object(object(raw.observation).original));
    // A reviewed row pairing does not make unlike point variables comparable.
    // Read the actual retained source row, not just its capture-bound identity.
    const rowRef = item.references.find(r => r.relation === 'source_row' && r.kind === 'point_row');
    const sourceRow = rowRef ? lookup('point_row', rowRef.subject_id) : null;
    Object.assign(hard, pick(a, ['applicability', 'quantity_basis']), { scope: scope(a.scope_id),
      variable: sourceRow ? normalizedBasVariable(String(object(JSON.parse(sourceRow.original_json)).name)) : null,
      matrix: identity('point_matrix', String(a.matrix_id)), qualifiers: array(raw.qualifiers).map(note) });
    Object.assign(membership, { equipment: members(raw.included_equipment_ids) }, pick(raw, ['replication_factor']));
  }
  return { metric, hard, membership };
}
