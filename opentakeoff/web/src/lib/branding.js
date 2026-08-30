// Branding mode — how a deliverable presents itself. Two modes:
//   • "default"    — unbranded product masthead (no product name / parent credit).
//   • "clearlabel" — a saved trade-name profile brands the document as the firm
//                    presenting it. No parent-product credit is appended.
//
// resolveBranding() is PURE — given the per-project selection + the global
// profiles list it tells every render point (report masthead, marked-set cover,
// the CSV/MD export titles) what to show. Storage is a separate, swappable edge:
// the selection lives in the per-project meta KV, keyed on the project id so it
// degrades to a single global setting in the browser-only build (folderId "").
import { metaGet, metaPut } from "./store.js";
import { activeProfile } from "./identity.js";

/** Default product name for unbranded deliverables — intentionally empty. */
export const OT_NAME = "";
/** Legacy export; parent-product credit is never shown. */
export const OT_CREDIT = null;

/**
 * @param {{mode?: string, profileId?: string|null,
 *   profiles?: Array<{id:string,name?:string,address?:string,logo?:string}>}} [sel]
 * @returns {{clear:boolean, company:{name?:string,address?:string,logo?:string}|null,
 *   brandName:string, credit:string|null, coverTitle:string}}
 */
export function resolveBranding(sel) {
  const profiles = sel?.profiles || [];
  // clear-label only takes effect when a real profile resolves — no profiles, a
  // stale id with none left, or mode off all fall back to unbranded defaults.
  const profile = sel?.mode === "clearlabel"
    ? activeProfile({ profiles, activeId: sel?.profileId })
    : null;
  const clear = Boolean(profile);
  return {
    clear,
    company: clear ? { name: profile.name, address: profile.address, logo: profile.logo } : null,
    // Firm text / export title tag — trade name when clear-labelling; empty otherwise.
    brandName: (clear && profile.name) ? profile.name : OT_NAME,
    // Never append a parent-product credit on deliverables.
    credit: null,
    coverTitle: "Marked Set",
  };
}

// ── per-project persistence (browser-only; the meta KV is IndexedDB) ──────────
const selKey = (projectId) => `branding:${projectId || ""}`;

/** @param {string} [projectId] @returns {Promise<{mode:string, profileId:string|null}>} */
export async function loadBrandingSelection(projectId) {
  try {
    const v = await metaGet(selKey(projectId));
    if (v && typeof v === "object") {
      return { mode: v.mode === "clearlabel" ? "clearlabel" : "default", profileId: v.profileId ?? null };
    }
  } catch {
    /* DB blocked/unavailable — fall through to unbranded default */
  }
  return { mode: "default", profileId: null };
}

/** @param {string} projectId @param {{mode?:string, profileId?:string|null}} sel @returns {Promise<boolean>} saved ok */
export async function saveBrandingSelection(projectId, sel) {
  try {
    await metaPut(selKey(projectId), {
      mode: sel?.mode === "clearlabel" ? "clearlabel" : "default",
      profileId: sel?.profileId ?? null,
    });
    return true;
  } catch {
    return false;
  }
}

/** CSV/MD export title line — omits empty brand names. */
export function exportDocTitle(projectName, kind, brandName = "") {
  if (!projectName) return "";
  const brand = String(brandName || "").trim();
  const label = brand ? `${brand} ${kind}` : kind;
  return `# ${projectName} — ${label}\n`;
}
