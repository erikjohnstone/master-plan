/** Shared review labels/policy, not extraction or approval. Unknown codes stay
 * visible and blocking; an acknowledgement cannot change the source outcome. */
export const BAS_PROJECT_ISSUE_RULE = 'saved_bas_findings_1' as const;
export type BasIssueDomain = 'sources' | 'points' | 'sequences' | 'equipment' | 'assemblies' | 'engineering';
export type BasIssueSeverity = 'blocker' | 'warning' | 'information';
type Entry = { title: string; next_step: string; severity: BasIssueSeverity };
const catalog: Record<string, Entry> = Object.create(null);
const add = (domain: BasIssueDomain, codes: string[], next_step: string, severity: BasIssueSeverity = 'blocker') => {
  for (const code of codes) catalog[`${domain}:${code}`] = { title: code.toLowerCase().replace(/_/g, ' '), next_step, severity };
};
add('sources', ['source_inventory_not_byte_verified'], 'Keep the original PDFs. This view checks retained evidence, not availability or integrity of stored PDF bytes.');
add('sources', ['narrative_capture_unavailable', 'equipment_capture_unavailable'], 'Recompile the original drawing set to retain the missing source evidence. Earlier decisions are preserved.');
add('points', ['SOURCE_DISCOVERY_COVERAGE_UNVERIFIED'], 'Review source-page coverage. Discovered matrices do not prove that every applicable point list was found.');
add('points', ['PROJECT_TOTAL_WITHHELD_UNRESOLVED_POINT_IDENTITIES'], 'Resolve requirement identity across templates before using a project total. Known listed subtotals are not unique physical requirements.');
add('points', ['SOURCE_PAGE_UNAVAILABLE', 'TABLE_REGION_UNAVAILABLE', 'POINT_CELL_REGION_UNAVAILABLE', 'POINT_NAME_REGION_UNAVAILABLE'], 'Inspect the original matrix and its missing source location. Do not treat ungrounded values as verified takeoff quantities.');
add('points', ['POINT_COLUMNS_UNRESOLVED', 'POINT_NAME_COLUMN_UNRESOLVED', 'POINT_NAME_UNAVAILABLE', 'DUPLICATE_LOCAL_ROW_KEY',
  'POINT_CELL_AMBIGUOUS', 'FOOTNOTE_TABLE_SCOPE_AMBIGUOUS', 'POINT_FOOTNOTE_UNRESOLVED', 'POINT_COLUMNS_UNINTERPRETED',
  'TYPED_SOURCE_CELLS_UNOBSERVED', 'AMBIGUOUS_SOURCE_VALUES_RETAINED', 'SOURCE_ROWS_REQUIRE_REVIEW',
  'point_columns_unobserved', 'point_columns_uninterpreted', 'point_observation_ambiguous'],
'Open the point list and compare its original cells, column meanings and qualifiers. Unknown or unobserved is not zero.');
add('points', ['CONTROLLER_QUALIFIER_RETAINED_NOT_FIELD_WIRING'], 'Read the retained controller qualifier. Listed observations do not establish field wiring.', 'information');
add('sequences', ['discovery_incomplete', 'page_no_text', 'heading_only', 'segmentation_conflict', 'unassigned_horizontal_spans',
  'unsupported_spans', 'ambiguous_spans', 'uninterpreted_clause', 'partially_interpreted_clause'],
'Inspect the original sequence/page. Review unhandled wording and applicability; automatic discovery and interpretation remain bounded.');
add('sequences', ['not_listed_in_selected_matrix', 'ambiguous_listed_rows', 'point_labels_unavailable', 'unpaired_point_rows'],
'Review this explicit sequence/matrix comparison. A missing match here is not proof of a whole-project omission or an additional physical device.');
add('equipment', ['unowned_row_source', 'unowned_table_source', 'ambiguous_mark_columns', 'missing_mark_column', 'missing_mark_cell',
  'ambiguous_quantity_columns', 'missing_quantity_cell', 'named_members_differ_from_printed_count', 'duplicate_source_table'],
'Open the retained equipment row. Resolve exact printed members and quantity basis without changing the source evidence.');
add('equipment', ['empty_expression', 'unsupported_syntax', 'invalid_number', 'incompatible_range', 'descending_range', 'ambiguous_padding',
  'duplicate_member', 'excluded_member_not_included', 'too_many_members'].map(c => `membership_${c}`),
'Review the complete printed tag expression and exceptions. Unresolved membership cannot become a zero or guessed equipment list.');
add('equipment', ['quantity_not_a_complete_integer', 'quantity_unsafe_integer'], 'Review the printed quantity. This value cannot safely be interpreted as a complete device count.');
add('equipment', ['scope_partly_unknown', 'building_hint_differs_from_decision', 'sequence_applicability_not_linked',
  'multiple_templates_require_point_identity_review', 'REPEATED_POINT_LABEL_REQUIRES_IDENTITY_REVIEW',
  'MULTIPLE_TEMPLATES_REQUIRE_POINT_IDENTITY_REVIEW'], 'Review equipment scope, source bindings and template applicability. Repeated labels do not establish distinct or identical physical devices.');
add('equipment', ['all_members_explicitly_excluded', 'ALL_MEMBERS_EXPLICITLY_EXCLUDED'], 'Inspect the recorded member exclusions and their reason. They remain part of the takeoff audit.', 'information');
add('equipment', ['assignment_not_calculated', 'assignment_stale_dependencies'], 'Review current template membership, then calculate assigned values through the shared BAS engine.');
add('equipment', ['FIELD_WIRING_NOT_ESTABLISHED'], 'Assigned point observations do not establish field wiring. Review the source and record the applicable wiring responsibilities.', 'information');
add('equipment', ['UNIQUE_POINT_IDENTITIES_NOT_ESTABLISHED'], 'Reconcile physical requirement identity across assigned templates before claiming a unique project point total.');
add('equipment', ['TYPED_SOURCE_CELLS_UNOBSERVED', 'AMBIGUOUS_SOURCE_VALUES_RETAINED', 'SOURCE_ROWS_REQUIRE_REVIEW',
  'POINT_COLUMNS_UNRESOLVED', 'POINT_NAME_COLUMN_UNRESOLVED', 'FOOTNOTE_TABLE_SCOPE_AMBIGUOUS', 'SOURCE_PAGE_UNAVAILABLE', 'TABLE_REGION_UNAVAILABLE'],
'Open the assigned point matrix and retained calculation. Unobserved/ambiguous source values prevent a complete assigned takeoff.');
add('assemblies', ['component_quantity_unknown', 'component_condition_unresolved', 'component_lifecycle_unknown', 'assembly_scope_partly_unknown',
  'responsibility_conflict', 'responsibility_unknown', 'possible_duplicate_component_requires_review',
  'COMPONENT_QUANTITY_UNKNOWN', 'COMPONENT_CONDITION_UNRESOLVED', 'COMPONENT_LIFECYCLE_UNKNOWN'],
'Open the assembly component and its source/decision. Resolve the specific quantity, predicate, identity or responsibility activity; no default contractor or kit is assumed.');
add('assemblies', ['source_declaration_corrected_by_explicit_decision'], 'Read the explicit correction beside the original declaration; verify its reason and applicability.', 'warning');
add('assemblies', ['all_assembly_members_excluded', 'component_explicitly_excluded', 'component_condition_not_satisfied'], 'Inspect the documented scope exclusion or unsatisfied condition. This does not erase the original requirement.', 'information');
add('assemblies', ['assembly_stale_dependencies', 'assembly_not_calculated', 'assembly_calculation_stale_dependencies'], 'Review current equipment/assembly dependencies and recalculate declared component quantities. Do not reuse a stale result.');
add('engineering', ['engineering_component_excluded', 'engineering_component_condition_not_established', 'engineering_component_lifecycle_unknown'], 'Review the selected resource and its actual assembly applicability before relying on this check.');
add('engineering', ['engineering_check_explicitly_excluded', 'engineering_resource_not_used'], 'Read the saved target/resource decision and exclusion reason. Excluded failures and unknowns are retained, not converted to passes.', 'information');
add('engineering', ['engineering_stale_dependencies', 'engineering_requires_python_replay'], 'Open engineering and replay the saved inputs in the shared Python engine. Source interpretation and dependency freshness remain separate from calculation equality.');
add('engineering', ['constraint_fail', 'constraint_not_evaluable'], 'Inspect the exact governing rule, original inputs and missing information. Correct the declared configuration and recalculate; dismissal cannot change this outcome.');

export function basProjectIssuePolicy(domain: BasIssueDomain, code: string) {
  const found = catalog[`${domain}:${code}`];
  return found ? { ...found, known_code: true } : { title: code, severity: 'blocker' as const, known_code: false,
    next_step: 'Unclassified finding retained. Inspect its original evidence; no readiness or approval may ignore this code.' };
}
export const basProjectIssueCatalogKeys = () => Object.keys(catalog).sort();
