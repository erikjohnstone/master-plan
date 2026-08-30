// Resolve a corpus set's PDF files to real, existing paths.
//
// sets.json records ABSOLUTE roots (set.root / spec.root) as authored on the
// machine that built the corpus. Those paths are correct there but do not
// exist when the same corpus is checked out somewhere else (CI, a cloud VM
// under /workspace, another contributor's laptop). To keep every eval script
// portable WITHOUT rewriting the corpus data, each file is resolved against a
// list of candidate roots and the first root that actually contains the file
// wins.
//
// The recorded absolute roots are tried FIRST, so on the authoring machine the
// behavior is byte-for-byte unchanged; the corpus-relative and re-anchored
// fallbacks only ever engage when the recorded path is genuinely absent. This
// is deliberately general — it keys on "does this file exist here", never on a
// specific set id, filename, or username — so it stays in line with the
// corpus's own standing rule against hardcoding corpus specifics.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function resolveSetFiles(corpus, spec, set) {
  const recorded = [set.root, spec.root].filter(Boolean);
  const parent = dirname(corpus);

  const roots = [
    ...recorded, // authoring machine — checked first, so nothing changes there
    join(corpus, "raw"), // the corpus's own raw/ (the normal on-disk layout)
    corpus, // a flat corpus dir
  ];

  // Re-anchor each recorded absolute root by its trailing path segments onto
  // the corpus's parent dir. This recovers a SIBLING location (e.g. a set whose
  // PDF lives in ".../opentakeoff/samples" next to ".../opentakeoff-corpus")
  // after a checkout that kept the sibling layout but changed the common
  // ancestor (".../MASTER PLAN" on a laptop vs. "/workspace" in a VM).
  for (const r of recorded) {
    const segs = r.split(/[\\/]+/).filter(Boolean);
    for (let k = 1; k <= Math.min(3, segs.length); k++) {
      roots.push(join(parent, ...segs.slice(segs.length - k)));
    }
  }

  return set.files.map((f) => {
    for (const root of roots) {
      const p = join(root, f);
      if (existsSync(p)) return p;
    }
    // Nothing resolved — preserve the original path so the downstream error
    // (a missing-file throw from loadPlan) reads exactly as it did before.
    return join(set.root ?? spec.root, f);
  });
}
