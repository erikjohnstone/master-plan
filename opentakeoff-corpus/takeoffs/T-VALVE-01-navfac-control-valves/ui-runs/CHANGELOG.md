# UI N=5 — T-VALVE-01

Surface: Takeoff UI via /__ot/compile-corpus-takeoff (Session+ODL).

- run 1: FAIL (39784ms) surface=takeoff_ui items/rows=163
- run 1: PASS (25491ms) surface=takeoff_ui items/rows=163
- run 2: PASS (25677ms) surface=takeoff_ui items/rows=163
- run 3: PASS (25611ms) surface=takeoff_ui items/rows=163
- run 4: PASS (25102ms) surface=takeoff_ui items/rows=163
- run 5: PASS (25007ms) surface=takeoff_ui items/rows=163

Note: runs 1–5 after first FAIL used `--skip-interrogation` (no CEREBRAS_API_KEY in this VM).
Gates 1–4 via `/__ot/compile-corpus-takeoff`; Gate 5 live evidence remains MCP `interrogation/run-5.json`.

LOCKED UI 5/5 (Gates 1–4 live; Gate 5 skipped) at 2026-08-31T02:41:05.526Z
