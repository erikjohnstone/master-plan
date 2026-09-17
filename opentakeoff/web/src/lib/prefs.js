// Build-time feature flag for local-first + optional Drive sync. Set VITE_CLOUD_SYNC=1
// at build time (e.g. the Netlify env) to enable it for the WHOLE deployment at once;
// unset / anything-else = OFF, which reproduces today's Drive-canonical behavior
// byte-for-byte (ProjectGate builds the legacy store — nothing local-first is wired).
//
// Deliberately a DEPLOYMENT flag, NOT a per-user toggle. Local-first sync relies on an
// app-level rev precondition that only enabled clients honor, so a PARTIAL fleet (some
// browsers on, some off) is the mixed-fleet clobber hazard the design warns about.
// Flipping the whole build at once is the "don't share a project until its whole
// collaborator set is opted in" rule, enforced by the deploy instead of left to
// per-user chance. Rollback is one env change + redeploy, no code revert.
//
// No imports / no cloud vocabulary — the gating decision stays cheap and synchronous
// (never blocks a mount on network), and the anonymous bundle pulls in nothing.

/** True when THIS BUILD enabled local-first + optional Drive sync (VITE_CLOUD_SYNC=1). */
export function cloudSyncEnabled() {
  return ((import.meta.env && import.meta.env.VITE_CLOUD_SYNC) || "") === "1";
}

// #linear-takeoff (WP3.1, opentakeoff-corpus/goals/LINEAR_TAKEOFF.md): the
// trace engine (stroke classification, connectivity graph, the bidirectional
// walker, Trace mode's own canvas UI) is real, load-bearing geometry code
// that has not yet cleared GATE 3's own accuracy bars (recall/precision/
// length-error/size-accuracy on a held-out corpus tier) — it must not affect
// a single existing project until it does. Same DEPLOYMENT-flag discipline
// as cloudSyncEnabled above (a whole-build toggle, not a per-user setting,
// flipped once GATE 4 signs off): OFF reproduces today's manual-mode-only
// behavior byte-for-byte. Nothing reads this yet — WP3.2 onward (the index,
// graph, walker, and WP3.7's canvas UI) are the eventual consumers; adding
// the flag now, ahead of them, means every trace-engine module that lands
// between here and GATE 4 has somewhere to gate itself from the start.
export function traceModeEnabled() {
  return ((import.meta.env && import.meta.env.VITE_LINEAR_TRACE) || "") === "1";
}
