// Whole-set text index (maturity plan Phase 1): every sheet's positioned text
// spans, persisted per (sheetKey, file rev) so sheet_graph/find_schedule/
// resolve_tag/count_marks can see every sheet in the loaded plan set — not
// just whichever sheets happen to be open as tabs or a side-by-side group
// right now. Mirrors thumbs.js's own pattern exactly (persisted record in the
// shared keyPath-less `meta` store, invalidated on file removal) for the same
// reason thumbs.js exists: reopening a known set should draw from IndexedDB,
// not re-walk pdf.js from scratch.
//
// Keyed by REV, not a re-hashed content digest — `rev` (CO-1's revision
// counter, already trusted by the store for exactly "did this file's bytes
// actually change") is free to read off `store.listSheets()` and changes
// if and only if the file's content changed, so a stale cache entry is
// impossible without an actual content change. A file fully removed and
// later re-added under the same name can restart at rev 1 for genuinely
// different bytes — forgetSheetText (called from the same removal sites as
// forgetThumbs) closes that gap by purging the old entries outright rather
// than relying on rev alone to disambiguate.
import { metaGet, metaPut, metaDelete, metaDeletePrefix } from "./store.js";

// v3: indexOneSheet now persists the discrete rotation alongside its
// rotation-aware bbox, so quarter-turned table extraction receives the same
// GraphSpan signal as the MCP pipeline. v2 corrected placement but silently
// dropped the rotation field itself.
//
// v2: indexOneSheet's span math became rotation-aware (a real 270°-rotated
// title-block run was previously mispositioned into a horizontal-text guess
// that could bleed into a nearby schedule row) — bumped so every already-
// cached sheet re-extracts with the corrected geometry instead of serving
// the old, wrongly-positioned rotated spans forever.
const INDEX_VERSION = 3;
const PREFIX = `textidx:v${INDEX_VERSION}:`;
const keyOf = (sheetKey) => `${PREFIX}${sheetKey}`;

/** Persisted spans for `sheetKey`, valid only when they were captured at
 * this exact `rev` — a mismatched rev means the file changed underneath and
 * is treated as a cache miss, never served as if it were current. */
export async function loadSheetSpans(sheetKey, rev) {
  try {
    const rec = await metaGet(keyOf(sheetKey));
    if (!rec || rec.rev !== rev || !Array.isArray(rec.spans)) return null;
    return rec.spans;
  } catch { return null; }
}

/** Best-effort persist; a quota failure only costs the next load a re-walk. */
export function saveSheetSpans(sheetKey, rev, spans) {
  return metaPut(keyOf(sheetKey), { rev, spans, ts: Date.now() }).catch(() => {});
}

/** Drop every indexed page for these FILE names — called from the same
 * close/remove/revise sites as forgetThumbs, so a stale index entry can
 * never outlive the PDF it was extracted from. Same file/file# prefix
 * bound as thumbs.js (a `plan.pdf` removal must not sweep `plan.pdf2`'s
 * entries). */
export async function forgetSheetText(fileNames) {
  for (const file of fileNames) {
    try { await metaDelete(keyOf(file)); await metaDeletePrefix(keyOf(`${file}#`)); } catch { /* cache only */ }
  }
}
