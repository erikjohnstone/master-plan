# Task specification (frozen copy)

This file is a frozen, task-local copy of the authoritative goal documents this
package executes against, kept here so the spec survives context compaction
and worktree moves. The canonical source of truth remains:

- `opentakeoff/docs/CLAUDE-GEMINI-AUTONOMOUS-SYMBOL-MODEL-GOAL.md` (the executed `/goal`)
- `opentakeoff/docs/SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md` (the production design this goal implements)
- `opentakeoff/docs/CLAUDE-SYMBOL-METRIC-DATASET-GOAL.md` (the owner-operated sibling mode, not executed here)
- `opentakeoff/docs/CLAUDE-AUTONOMOUS-SYMBOL-MODEL-LAUNCHER.txt` (the paste-ready launcher prompt actually run)

Recovered from `origin/codex/autonomous-symbol-model-spec` (commit `0560b1d`)
after the file did not exist on the branch named in the original `/goal`
invocation — see the session's execution log / final report for that recovery.

Branch: `agent/autonomous-symbol-metric-v1`, created from
`claude/eager-heisenberg-vkuxg8` @ `0560b1d` in an isolated worktree at
`/home/user/worktrees/symbol-metric-v1` (NOT from `origin/main`: `origin/main`
and this branch share no common git ancestor and `origin/main` does not carry
the goal documents at all — branching from it would have produced a worktree
missing its own task spec. This is a documented, reasoned deviation from the
goal text's literal "from the current origin/main", preserving the goal's
actual intent — an isolated branch that does not dirty production work and is
never merged).

## Real corpus availability (verified, differs from the goal doc's expected paths)

The goal document expects `HVAC BAS Benchmark Collection/` (Symbol Sweep,
Legend Learn, symbol_grounding ground truth) and
`opentakeoff-corpus/bulk/focus-group-2026-09-04/sources/` (190 PDFs / ~113
source families). Neither exists in this checkout or anywhere reachable from
it:

- `HVAC BAS Benchmark Collection/` does not exist in this git repository, on
  any branch, in any commit, or anywhere on this machine. `opentakeoff-corpus/sets.json`'s
  own `root` field (`/Users/erikjohnstone/Desktop/MASTER PLAN/...`) confirms
  this repo is a tracked slice of a larger local project tree on the owner's
  Mac; this directory most likely exists only there and was never pushed.
- The 113-set bulk PDF archive (`opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets{,_Vol2}`)
  is real and has a real staging mechanism (`scripts/stage-bulk-corpus.sh`,
  pulling from two public Google Drive file IDs — see PR #85), but this
  session's egress policy blocks `drive.google.com` (confirmed via the agent
  proxy's own status endpoint: `connect_rejected`, "gateway answered 403 to
  CONNECT (policy denial)"). Per this environment's own proxy README, a
  403/407 from the proxy is an organization policy decision to report, not
  retry or route around.

What IS real and available: 10 PDFs physically present in
`opentakeoff-corpus/raw/` (see `reports/CORPUS_INVENTORY.md` for hashes/page
counts/provenance), plus `opentakeoff-corpus/ground_truth/{air_devices,
bas_points,control_schematics,hvac,sequence_points,sequences}` — real,
human-reviewed, but scoped to schedule/points/sequence ground truth for the
deterministic extraction engine, not symbol-visual legend→physical-body
pairs. None of the existing `symbol_sweep` / `legend_learn` /
`symbol_grounding` ground truth the goal describes could be imported because
none of it is reachable from this session — this is reported, not silently
worked around, per the goal's own "fail loudly if these counts differ" rule.

The achievable dataset in this session is therefore built from the 10 real
PDFs above through direct visual/structural review, not from importing a
pre-existing 47-identity/330-crop Symbol Sweep set that isn't reachable here.
Every count in the final report is real and reconciled against this smaller
corpus; the pipeline itself is built to scale unmodified once the bulk
archive or the Benchmark Collection becomes reachable in a future session.
