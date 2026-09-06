// graphKeys — put the sheet graph back in the canvas's key space.
//
// The browser uploads its PDFs to /__ot/sheet-graph by their real names. The
// endpoint spools them CONTENT-ADDRESSED — `<sha256>.pdf` — on purpose, so the
// same document is the same path forever and the ODL/graph caches actually hit
// (see vite.corpusTakeoffApi.js's own note; that caching is the difference
// between an estimator waiting minutes and waiting not at all).
//
// The consequence nobody had exercised end to end: every sheet key in the
// graph that comes back is `<sha256>.pdf#12`, while every sheet key in the
// canvas is `<original name>.pdf#12`. The two never compare equal. Measured
// live by clicking a schedule in the Schedules panel:
//
//     Could not show that: Sheet d2e1967964c07d…da1.pdf#2 not found.
//
// and anything else that matches a graph table against a canvas sheet — a
// citation, tablesOverlappingRegion's `t.sheet === key` — has the same hole.
//
// The fix belongs HERE, at the boundary, once: the client knows both the bytes
// and the real name, so it can rebuild the mapping the spool discarded and
// hand every downstream consumer keys it can use. The server keeps its
// content-addressed cache untouched.

/** sha256 of bytes, lowercase hex, via WebCrypto. */
export async function sha256Hex(bytes) {
  const buf = bytes instanceof ArrayBuffer ? bytes : (bytes?.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A spooled name is exactly 64 hex characters plus ".pdf". Anything else is a
 *  real filename and must be left alone — a set legitimately named "abc.pdf"
 *  is not a hash. */
const SPOOLED = /^([0-9a-f]{64})\.pdf$/i;

/** Split "name.pdf#12" into its file part and the rest, preserving the tail
 *  exactly (a filename may itself contain "#"). */
function splitKey(key) {
  const s = String(key);
  const hash = s.lastIndexOf("#");
  if (hash < 0) return { file: s, tail: "" };
  const tail = s.slice(hash);
  // only treat the tail as a page marker when it IS one
  return /^#\d+$/.test(tail) ? { file: s.slice(0, hash), tail } : { file: s, tail: "" };
}

/** Rewrite one key if its file part is a spooled sha we know a real name for. */
export function remapKey(key, shaToName) {
  if (typeof key !== "string" || !key) return key;
  const { file, tail } = splitKey(key);
  const m = SPOOLED.exec(file);
  if (!m) return key;
  const real = shaToName.get(m[1].toLowerCase());
  return real ? `${real}${tail}` : key;
}

/** Keys the graph carries under these names, at any depth. Walking by KEY NAME
 *  rather than rewriting every string that merely looks like one keeps room
 *  numbers, cell text and titles untouched. */
const KEY_FIELDS = new Set(["sheet", "key", "sheet_id", "sheet_key"]);

/** Deep, in-place remap of every sheet key in a freshly parsed graph.
 *  Returns the same object. Cycles are tolerated. */
export function remapGraphSheetKeys(graph, shaToName) {
  if (!graph || !(shaToName instanceof Map) || shaToName.size === 0) return graph;
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const v = node[i];
        if (typeof v === "string") node[i] = remapKey(v, shaToName);
        else walk(v);
      }
      return;
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === "string") {
        if (KEY_FIELDS.has(k)) node[k] = remapKey(v, shaToName);
      } else if (v && typeof v === "object") {
        walk(v);
      }
    }
    // A map keyed BY sheet key (per-sheet lookups) has to be rekeyed too.
    for (const k of Object.keys(node)) {
      const m = SPOOLED.exec(splitKey(k).file);
      if (!m) continue;
      const nk = remapKey(k, shaToName);
      if (nk !== k && !(nk in node)) { node[nk] = node[k]; delete node[k]; }
    }
  };
  walk(graph);
  return graph;
}
