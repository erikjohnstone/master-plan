// Chat formatting only. Never replace the canonical Takeoff/export result.
export function basReplyForAgent(payload) {
  const math = payload?.bas_math;
  if (!math || math.status === "unavailable") return payload;
  const fields = (row, names) => Object.fromEntries(names.map((name) => [name, row[name]]));
  const lists = {
    hardware: (math.hardware || []).map((h) => fields(h, ["group_id", "profile_id", "pool_count", "blocks_per_pool", "blocks_total", "status"])),
    licenses: (math.licenses || []).map((l) => fields(l, ["pool", "variables", "weighted_points", "entitlement", "packs", "headroom", "status"])),
    serial: (math.serial || []).map((r) => fields(r, ["route_id", "status"])),
    ip: (math.ip || []).map((r) => fields(r, ["closet_id", "status", "switches", "endpoint_count"])),
    diagnostic_codes: [...new Set((math.diagnostics || []).map((d) => d.code))],
  };
  const summary = {
    ...fields(math, ["engine", "schema_version", "status", "project_complete", "source_coverage", "physical_total"]),
    point_rows_in_workspace: math.points?.length || 0,
    ...Object.fromEntries(Object.entries(lists).map(([key, rows]) => [key, rows.slice(0, key === "diagnostic_codes" ? 16 : 4)])),
    omitted: {},
    detail: "Chat summary only. Full point rows, source citations, assignments, network partitions and diagnostics remain in Takeoff and Export BAS JSON. Read review_required literally; neither this summary nor a capacity envelope certifies a complete project.",
  };
  const updateOmissions = () => {
    summary.omitted = Object.fromEntries(Object.entries(lists).map(([key, rows]) => [key, rows.length-summary[key].length]));
  };
  updateOmissions();
  // Leave room for the existing compile metadata inside Agent's 5,000-char cap.
  // Drop whole summary entries with explicit omissions, never truncate IDs or
  // recalculate a quantity. Core totals and readiness always survive.
  while (JSON.stringify(summary).length > 2500) {
    const candidates = Object.keys(lists).filter((key) => summary[key].length);
    if (!candidates.length) break;
    const largest = candidates.sort((a, b) => JSON.stringify(summary[b]).length-JSON.stringify(summary[a]).length)[0];
    summary[largest].pop();
    updateOmissions();
  }
  const { bas_math: _canonical, ...legacy } = payload;
  return { ...legacy, bas_math: summary };
}
