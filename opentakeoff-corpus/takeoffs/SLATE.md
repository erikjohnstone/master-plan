# Takeoff slate — three locked commercial takeoffs

| ID | Kind | Set | Status |
|---|---|---|---|
| T-HVAC-01 | HVAC equipment quantity takeoff | `navfac-cherry-point-atc` | `LOCKED` (MCP 5/5 · UI 5/5) |
| T-BAS-01 | BAS / DDC points takeoff | `navfac-cherry-point-atc` | `LOCKED` (MCP 5/5 · UI 5/5) |
| T-VALVE-01 | Control valve takeoff (CHW+HHW) | `navfac-cherry-point-atc` | `LOCKED` (MCP 5/5 · UI 5/5) |

Selection rationale: `navfac-cherry-point-atc` (75 sheets) is the densest
vector set with HVAC equipment schedules, extractable BAS points/DDC lists,
and CHW/HHW control valve schedules. One set hosts all three takeoffs; scope
is still set by what that set contains, not a fixed checklist.

Do not add a fourth takeoff ID without amending `GOAL.md`.

**Agent rule:** no Cursor Task/subagent tools for this goal — primary agent
only (see `GOAL.md` non-negotiable #8).

**Parity:** both surfaces use the shared Session + ODL sheet-graph pipeline.
Background graph prewarm on upload is a documented follow-on after this lock.
