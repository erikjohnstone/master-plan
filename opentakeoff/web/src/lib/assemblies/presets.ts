// ASSEMBLIES goal, WP8.2 — the starter's hook-up profile and responsibility
// presets as project settings (research 04 §4-5; decision D13).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. Which contractor furnishes and
// installs a coil valve, and which hook-up components a project takes, change
// the lines every surface exports. The settings a surface passes to
// applyAssemblies come from here, so a preset means the same thing in the
// Takeoff panel and over MCP.
//
// The files are data (starter/hookup-profile-v1.json, responsibility-v1.json):
// every switch, variable and preset names the sources that make it a choice.
// A preset edits responsibility per role; it never adds or removes a line.
import profile from "./starter/hookup-profile-v1.json" with { type: "json" };
import responsibility from "./starter/responsibility-v1.json" with { type: "json" };
import type { ProjectSettings } from "./select";

export interface ResponsibilityPreset {
  id: string;
  label: string;
  roles: Record<string, Record<string, string>>;
  source: { ref: string; license: string; derivation: string };
  note?: string;
}

export const RESPONSIBILITY_PRESETS: readonly ResponsibilityPreset[] = (responsibility as { presets: ResponsibilityPreset[] }).presets;

export interface HookupSwitch { id: string; label: string; default: boolean; sources: string[] }
export interface HookupVariable { id: string; label: string; default: string | number | boolean | null; values?: string[]; unit?: string; sources: string[] }

const P = profile as unknown as {
  switches: Record<string, Omit<HookupSwitch, "id">>;
  variables: Record<string, Omit<HookupVariable, "id">>;
};
/** The hook-up profile's switches and variables, with their labels and the
 * sources that make each a choice (for a settings form). */
export const HOOKUP_SWITCHES: readonly HookupSwitch[] = Object.entries(P.switches).map(([id, v]) => ({ id, ...v }));
export const HOOKUP_VARIABLES: readonly HookupVariable[] = Object.entries(P.variables).map(([id, v]) => ({ id, ...v }));

/** The hook-up profile's switches and variables at their starter defaults.
 * A variable with no default (the project's closed loops, say) is left out:
 * its lines stay unresolved until the project sets it. */
export function hookupProfileDefaults(): Required<Pick<ProjectSettings, "profile" | "variables">> {
  return {
    profile: Object.fromEntries(HOOKUP_SWITCHES.map((s) => [s.id, s.default])),
    variables: Object.fromEntries(HOOKUP_VARIABLES.filter((v) => v.default !== null).map((v) => [v.id, v.default as string | number | boolean])),
  };
}

/** `settings` with a responsibility preset applied over it: the preset's
 * parties per role and activity replace the settings' own for those cells. */
export function withResponsibilityPreset(settings: ProjectSettings, presetId: string): ProjectSettings {
  const preset = RESPONSIBILITY_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`no responsibility preset "${presetId}" (have: ${RESPONSIBILITY_PRESETS.map((p) => p.id).join(", ")})`);
  const merged: NonNullable<ProjectSettings["responsibility"]> = { ...(settings.responsibility ?? {}) };
  for (const [role, cells] of Object.entries(preset.roles)) merged[role] = { ...(merged[role] ?? {}), ...cells };
  return { ...settings, responsibility: merged };
}

/** The presets whose every cell `settings` already holds. */
export function activeResponsibilityPresets(settings: ProjectSettings): string[] {
  return RESPONSIBILITY_PRESETS.filter((p) => Object.entries(p.roles).every(([role, cells]) =>
    Object.entries(cells).every(([activity, party]) => settings.responsibility?.[role]?.[activity] === party))).map((p) => p.id);
}

/** Settings built from the starter's hook-up profile defaults (when asked)
 * and a responsibility preset, with the project's own settings over both: a
 * switch, variable or responsibility cell the project sets wins. */
export function settingsWithPresets(settings: ProjectSettings, opts: { hookupDefaults?: boolean; responsibilityPreset?: string | null } = {}): ProjectSettings {
  let base: ProjectSettings = opts.hookupDefaults ? hookupProfileDefaults() : {};
  if (opts.responsibilityPreset) base = withResponsibilityPreset(base, opts.responsibilityPreset);
  const out: ProjectSettings = { ...settings };
  if (base.profile) out.profile = { ...base.profile, ...(settings.profile ?? {}) };
  if (base.variables) out.variables = { ...base.variables, ...(settings.variables ?? {}) };
  if (base.responsibility) {
    const merged: NonNullable<ProjectSettings["responsibility"]> = { ...base.responsibility };
    for (const [role, cells] of Object.entries(settings.responsibility ?? {})) merged[role] = { ...(merged[role] ?? {}), ...cells };
    out.responsibility = merged;
  }
  return out;
}
