// Surface-specific identity adapter, NOT a math/extraction fork. Reuse the
// existing graph key translation for the NEW BAS evidence payload only.
import { remapGraphSheetKeys, remapKey } from "./graphKeys.js";
import { basPointListsOutputSchema } from "./basPointLists.ts";

export function basResultForCanvas(compiled, shaToName) {
  if (compiled?.bas_math) remapGraphSheetKeys(compiled.bas_math, shaToName);
  if (compiled?.bas_point_lists) {
    const checked = basPointListsOutputSchema.safeParse(compiled.bas_point_lists);
    if (!checked.success) {
      compiled.bas_point_lists = { schema_version: "bas_point_lists_v1", status: "unavailable",
        project_complete: false, error: "Point evidence failed its contract; original schedule results are preserved." };
      return compiled;
    }
    const points = checked.data;
    if ("matrices" in points) for (const matrix of points.matrices) {
      // Only navigation aliases change. Raw row keys/text and content-derived
      // IDs are evidence, even when a value happens to resemble a spool name.
      matrix.raw.sheet = remapKey(matrix.raw.sheet, shaToName);
      const mapSource = (source) => { source.sheet_key = remapKey(source.sheet_key, shaToName); };
      matrix.header_sources.forEach(mapSource);
      matrix.notes.forEach(note => mapSource(note.source));
      matrix.rows.forEach(row => {
        row.observations.forEach(observation => mapSource(observation.source));
        row.qualifiers.forEach(note => mapSource(note.source));
      });
    }
    compiled.bas_point_lists = points;
  }
  return compiled;
}
