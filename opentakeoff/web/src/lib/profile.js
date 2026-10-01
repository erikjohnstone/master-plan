// Estimator profile (.otprofile) — the working environment as ONE portable
// file (#299): who am I and how do I have OpenTakeoff configured, as opposed
// to what job am I on (that's the project — annotations payload / .otk).
//
// Scope v1 — exactly the browser-global, cross-project records:
//   condition_templates   meta store   (store.loadTemplates)
//   material_library      meta store   (store.loadMaterialLibrary)
//   stamp_library         meta store   (store.loadStampLibrary)
//   report_templates      localStorage (lib/reportTemplates.js)
//   report_theme          localStorage (lib/reportTheme.js — the RAW file, so
//                                       re-parsing always reflects the import)
//   report_cols/groupby   localStorage (lib/reportColumns.js)
//
// Project data (shapes, conditions in the payload, scales, markups) is
// deliberately NOT here — switching profiles must never touch a takeoff.
//
// Apply is REPLACE, not merge, and every incoming list rides the same
// sanitize gate its store-load path uses, so a hand-edited or hostile file
// degrades to empty sections instead of wedging every project's hydrate.
// Versioned like the project archive: unknown MAJOR schemas refuse loudly.

import { store } from "./store.js";
import { sanitizeTemplates } from "./templates.js";
import { sanitizeMaterialLibrary } from "./materials.js";
import { sanitizeStampLibrary, seedStampLibrary } from "./stamps.js";
import { loadTemplates as loadReportTemplates, overwriteTemplates as overwriteReportTemplates, sanitizeTemplates as sanitizeReportTemplates } from "./reportTemplates.js";
import { activeThemeFileRaw, saveActiveThemeFile, clearActiveTheme } from "./reportTheme.js";
import { loadColPrefs, saveColPrefs, loadGroupBy, saveGroupBy } from "./reportColumns.js";
import { sanitizeAssemblyLibrary, SEED_ASSEMBLIES } from "./linear/assemblyLibrary.ts";
import { equipmentAssembliesOf } from "./assemblies/library.ts";

export const PROFILE_SCHEMA = "opentakeoff.profile.v1";

export function isProfileFile(name) {
  return /\.otprofile$/i.test(name || "");
}

/** Gather the whole working environment into one plain object. */
export async function buildProfile(name) {
  const [templates, materials, stamps, assemblies, equipment] = await Promise.all([
    store.loadTemplates().catch(() => []),
    store.loadMaterialLibrary().catch(() => []),
    store.loadStampLibrary().catch(() => ({ stamps: [], sets: [] })),
    store.loadAssemblyLibrary().catch(() => []),
    store.loadEquipmentAssemblies().catch(() => []),
  ]);
  let theme = null;
  try { const raw = activeThemeFileRaw(); theme = raw ? JSON.parse(raw) : null; } catch { theme = null; }
  return {
    schema: PROFILE_SCHEMA,
    app: "opentakeoff",
    created: new Date().toISOString(),
    ...(name ? { name } : {}),
    condition_templates: templates,
    material_library: materials,
    stamp_library: stamps,
    // #linear-takeoff (WP2.4): assembly_library, same browser-global
    // section as the three above — store.loadAssemblyLibrary() already
    // seeds plan §5.5's defaults on first touch, so this is never empty
    // for an estimator who has opened the app at all.
    // ASSEMBLIES (D7): equipment assemblies ride the same array, after the
    // linear records; with none, the section is exactly what it was.
    assembly_library: [...assemblies, ...equipment],
    report_templates: loadReportTemplates(),
    ...(theme ? { report_theme: theme } : {}),
    report_cols: loadColPrefs(),
    report_groupby: loadGroupBy(),
  };
}

/**
 * Parse profile-file text. Throws "Couldn't apply profile…" on anything that
 * isn't a well-formed v1 profile.
 */
export function parseProfile(text) {
  let p;
  try { p = JSON.parse(text); }
  catch { throw new Error("Couldn't apply profile: the file isn't valid JSON."); }
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("Couldn't apply profile: not a profile file.");
  if (p.schema !== PROFILE_SCHEMA) {
    throw new Error(`Couldn't apply profile: version "${p.schema || "unknown"}" — this build reads ${PROFILE_SCHEMA}. Update the app and try again.`);
  }
  return p;
}

/**
 * REPLACE the working environment with a parsed profile. Each section rides
 * its own sanitize gate; absent sections clear to their defaults, so applying
 * a profile always lands the full, self-consistent environment it describes.
 * @returns {{ templates: number, materials: number, stamps: number, assemblies: number, equipmentAssemblies: number, reportTemplates: number }} counts for the receipt line
 */
export async function applyProfile(p) {
  const templates = sanitizeTemplates(p.condition_templates);
  const materials = sanitizeMaterialLibrary(p.material_library);
  const stamps = sanitizeStampLibrary(p.stamp_library);
  // #linear-takeoff (WP2.4): an incoming profile with no assembly_library at
  // all (every pre-WP2.4 .otprofile) applies as EMPTY here, not re-seeded —
  // apply is a REPLACE (this function's own header), and re-seeding on
  // every old-profile import would silently resurrect defaults a later
  // load_assembly_library call had deliberately emptied on that OTHER
  // machine. Seeding only ever happens once, on a truly first-ever local
  // load (store.loadAssemblyLibrary's own job), never here.
  const assemblies = sanitizeAssemblyLibrary(p.assembly_library);
  const equipment = equipmentAssembliesOf(p.assembly_library);
  const reportTemplates = sanitizeReportTemplates(p.report_templates);
  await store.saveTemplates(templates);
  await store.saveMaterialLibrary(materials);
  await store.saveStampLibrary(stamps);
  await store.saveAssemblyLibrary(assemblies);
  await store.saveEquipmentAssemblies(equipment);
  overwriteReportTemplates(reportTemplates);
  if (p.report_theme) saveActiveThemeFile(p.report_theme); else clearActiveTheme();
  saveColPrefs(p.report_cols && typeof p.report_cols === "object" ? p.report_cols : {});
  saveGroupBy(typeof p.report_groupby === "string" ? p.report_groupby : "");
  return {
    templates: templates.length,
    materials: materials.length,
    stamps: (stamps.stamps || []).length,
    assemblies: assemblies.length,
    equipmentAssemblies: equipment.length,
    reportTemplates: reportTemplates.length,
  };
}

/**
 * Factory reset: the environment a fresh browser profile gets — empty
 * template/material libraries, the SEEDED default stamp set and (#linear-
 * takeoff WP2.4) assembly library, no report customization. Distinct from
 * deleting anything project-side.
 */
export async function resetProfileDefaults() {
  await store.saveTemplates([]);
  await store.saveMaterialLibrary([]);
  await store.saveStampLibrary(seedStampLibrary({ stamps: [], sets: [] }));
  await store.saveAssemblyLibrary(SEED_ASSEMBLIES);
  await store.saveEquipmentAssemblies([]);
  overwriteReportTemplates([]);
  clearActiveTheme();
  saveColPrefs({});
  saveGroupBy("");
}
