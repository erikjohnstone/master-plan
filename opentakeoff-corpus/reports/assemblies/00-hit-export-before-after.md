# Assemblies goal — WP0.4 HIT export, before / after

Generated 2026-09-23T19:51:08.842Z. Base (before) = `valveSizeExport.ts` at `9985b3647193`; after = the working tree. One compile per set through the production path (VectorGrid mode `on`, python `/home/user/master-plan/opentakeoff/.venv-sidecar/bin/python`), fed to both builders, so every difference below is the builder's.
Reproduce: `cd opentakeoff/mcp && node --import tsx scripts/assemblies-hit-before-after.mjs ../../opentakeoff-corpus --base 9985b3647193`.

## `navfac-cherry-point-atc` — 163 rows before, 163 after (0 only before, 0 only after)

| Column | Filled before | Filled after | Rows changed | Change |
|---|---|---|---|---|
| unitNo | 163 | 163 | 0 | — |
| location | 159 | 159 | 0 | — |
| system | 163 | 163 | 0 | — |
| ports | 0 | 0 | 0 | — |
| pnClass | 0 | 0 | 0 | — |
| lineSizeIn | 163 | 163 | 0 | — |
| designFlowRateGpm | 163 | 163 | 0 | — |
| consumerDpPsi | 163 | 0 | 163 | 37 distinct value changes ×163 |
| branchDpPsi | 0 | 0 | 0 | — |
| tolerancePct | 0 | 0 | 0 | — |
| positioningSignal | 0 | 0 | 0 | — |
| operatingVoltage | 0 | 0 | 0 | — |

Valve Δp (derived), reported not written: 163 of 163 rows.
Positioning Signal after: blank: no_signal_printed ×163.

## `itd-d1-lab` — 10 rows before, 10 after (0 only before, 0 only after)

| Column | Filled before | Filled after | Rows changed | Change |
|---|---|---|---|---|
| unitNo | 10 | 10 | 0 | — |
| location | 0 | 0 | 0 | — |
| system | 9 | 9 | 0 | — |
| ports | 0 | 0 | 0 | — |
| pnClass | 0 | 0 | 0 | — |
| lineSizeIn | 0 | 0 | 0 | — |
| designFlowRateGpm | 10 | 10 | 0 | — |
| consumerDpPsi | 0 | 0 | 0 | — |
| branchDpPsi | 0 | 0 | 0 | — |
| tolerancePct | 0 | 0 | 0 | — |
| positioningSignal | 0 | 0 | 0 | — |
| operatingVoltage | 0 | 0 | 0 | — |

Valve Δp (derived), reported not written: 0 of 10 rows.
Positioning Signal after: blank: no_signal_printed ×10.

