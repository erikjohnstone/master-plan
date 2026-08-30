# Takeoff slate — exactly two records

| ID | Kind | Set | Status |
|---|---|---|---|
| T-HVAC-01 | HVAC equipment quantity takeoff | `navfac-cherry-point-atc` | `LOCKED` (MCP 5/5 · UI 5/5) |
| T-BAS-01 | BAS / DDC points takeoff | `navfac-cherry-point-atc` | `LOCKED` (MCP 5/5 · UI 5/5) |

Selection rationale: `navfac-cherry-point-atc` (75 sheets) is the densest
vector set with both full HVAC equipment schedules **and** extractable BAS
points/DDC lists. One set hosts both takeoffs; scope is still set by what
that set contains, not a fixed checklist.

Do not add a third takeoff ID without amending `GOAL.md`.

**Agent rule:** no Cursor Task/subagent tools for this goal — primary agent
only (see `GOAL.md` non-negotiable #8).

**Parity:** both surfaces use the shared Session + ODL sheet-graph pipeline.
Background graph prewarm on upload is a documented follow-on after this lock.
