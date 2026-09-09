# Deterministic BAS takeoff workflows

## Findings

The five workflows are feasible as evidence-backed software workflows, with explicit operator decisions where drawings omit information. They are not equivalent to automatic comprehension of every drawing or a complete controls design. The existing application has reusable table, citation, Python calculation, annotation, and revision-storage machinery, but lacks a durable BAS domain record joining those pieces.

The first extraction priority is a shared narrative-text path. The current sequence compiler examines graph tables; it does not walk the available PDF prose. Fort Sam Houston M-509 contains two long, visibly separate sequence columns. The production text adapter returns their headings and bodies, while the existing sequence compiler returns zero sequences. Treating this as a table-grid failure would target the wrong layer.

The first workflow priority is evidence identity and durable state. BAS results currently disappear after browser reload, reproduced with a real PDF and real compile endpoint. Review decisions, equipment assignments, and revision approvals cannot be reliable until their inputs, source versions, and state survive reload and export.

## Primary-source requirements and their applicability

The UFGS documents below are design guides with project-specific tailoring. They are research references, not imported project requirements. No option, suggested factor, responsibility, or numeric default is to be applied merely because it appears in a guide.

**Points and responsibilities.** UFGS 23 09 00 distinguishes hardware, network, and configuration points. Its points schedule identifies the owning DDC hardware, settings, ranges, and I/O type. Its packaged-controls testing provisions assign separate coordinated work to controls contractors and equipment suppliers. These distinctions support separate identities and separate responsibility activities, rather than one generic owner field.[^1]

**SOO scope.** UFGS 23 09 93 describes template sequences that must be edited for the project and placed on drawings. It coordinates choices with points schedules and schematics; some examples are explicitly LonWorks-specific. A sequence template is therefore not evidence of its applicability to every similar equipment item, and a network instruction cannot be counted automatically as a physical terminal.[^2]

**Device compatibility.** UFGS 23 09 13 treats fail position, operating environment, actuator torque, and valve shutoff pressure as distinct characteristics. Feedback and accessories can depend on what is indicated. A table of component names is insufficient to declare engineering compatibility. The goal excludes manufacturer selection; numerical checks must compare declared demands against declared capabilities, not synthesize a product recommendation.[^3]

**Controller compatibility.** UFGS 23 09 23.02 distinguishes analog inputs/outputs, contact inputs, relay and triac outputs, and pulse accumulators. It also distinguishes base/expansion hardware from standalone devices. This supports a compatibility contract that retains electrical signal mode, direction, ratings, and allocation boundaries independently of raw channel counts. The guide's options and limits are not universal hardware defaults.[^4]

### Engineering implications

The recommended initial rule catalog is deterministic and manufacturer-independent:

| Check | Required explicit inputs | Result boundary |
| --- | --- | --- |
| Physical channel assignment | Required channel kind, supported channel modes, shared/universal pool constraints, assigned controller | A free terminal alone is not a compatible terminal. |
| Signal compatibility | Sender/receiver direction, voltage/current/contact/resistance/pulse mode, supported ranges, relevant excitation/contact details | Missing or conflicting mode/rating means not evaluable; no inference from an AI/AO label. |
| Power capacity | AC/DC, voltage and tolerated range, device demand in compatible units, source capacity, explicit grouping | Check running and stated startup loads separately; never convert W to VA without an applicable power factor. |
| Mechanical actuator constraints | Declared required/provided torque or shutoff pressure, fail position, applicable environment | Compare only like quantities and explicit applicable limits; no default torque-per-area rule. |
| Expansion/controller allocation | Base compatibility declaration, module count/channel limits, power budget, ownership/pool | Cross-controller pooling is prohibited unless explicitly supported. |
| Network/location | Explicit endpoint identity, segment/closet assignment, declared route lengths and device constraints | Existing shared network math is reused; missing routes do not become estimated wiring. |

These are engineering consistency checks, not construction authorization, code-compliance certification, commissioning, or physical verification. Each check needs its rule version, inputs, evidence, and pass/fail/not-evaluable outcome.

## Competitor workflow observations

These observations come from official documentation, not authenticated hands-on use. They inform information architecture rather than establish feature parity.

| Product and observed behavior | Design recommendation for this platform |
| --- | --- |
| Autodesk Takeoff exposes a contextual compare mode with two explicit sheet/version selectors, overlay or side-by-side views, inventory quantity comparison, and a clear exit action. Its documented compare scope is 2D sheets.[^5] | Use a spacious internal comparison mode, with visible before/after identities and semantic quantity differences beside source evidence. Exit returns to the previous working context. |
| Bluebeam Revu separates document differences from colored overlays. Comparison can produce a new PDF without altering the source versions; page pairing/alignment is explicit and differences can be reviewed in the Markups List.[^6] | Preserve immutable source versions, keep correspondence review explicit, and give changes a navigable issue list. Do not imply that an ink overlay proves an equipment quantity change. |
| Togal's official indexed help description distinguishes version history from a permanent snapshot for the current sheet. Direct article retrieval was unavailable; no further detailed behavior is relied upon here.[^7] | Name the scope of each snapshot. A BAS takeoff snapshot must preserve requirements, decisions, and sources, not only the visible sheet. |

The shared design pattern is contextual depth: detailed work opens when needed, rather than occupying permanent canvas chrome. For BAS, equipment is the most useful context because points, components, ownership, and compatibility all depend on the same item.

## Current code and contract map

Paths below are relative to `opentakeoff/`. Findings describe baseline commit `161583a4aeabd5de08b092d0c154aa880bd02b24`.

| Concern | Current source | Finding / intended reuse |
| --- | --- | --- |
| Positioned PDF text | `mcp/src/pdf.ts`: `openPdf`, `textSpans` | Existing text plus image-pixel bboxes; source text can be exposed without modifying table discovery. Preserve its coordinate semantics. |
| Shared source session | `mcp/src/session.ts`: `graphForPipeline`, `sheetContext`, `buildVectorSheetContexts` | UI compile and MCP already consume the same Session graph. Add a cheap text-only adapter rather than invoking expensive geometry solely to read prose. |
| Sequence extraction | `web/src/lib/sequenceExtract.ts` | Table-centered, `impliedPoints` deliberately empty. Add a separate source-accounting/narrative lane; do not silently reinterpret legacy sequence fields. |
| Shared compile | `mcp/src/productionTakeoff.ts` | Calls unchanged legacy compiler, then the shared BAS math process for `bas_points`. Preserve legacy output; attach a validated BAS workflow extension. |
| UI and MCP entry points | `mcp/scripts/cliJson.mjs`, `mcp/src/tools.ts`, Vite compile proxy | Must invoke one workflow service for extraction, decisions, and recomputation. No browser quantity implementation. |
| BAS math | `bas_engine/models.py`, `adapters.py`, `engine.py`, `hardware.py`, `reconcile.py`, `network.py` | Strict typed inputs, exact count math, evidence, unresolved diagnostics. Existing max-envelope reconciliation is not a decision that conflicting source requirements are equivalent. |
| Process boundary | `mcp/src/basMath.ts` | No-shell process, byte/time limits, safe-number gate, validated output. Extend deliberately; oversized jobs must disclose scope rather than silently truncate evidence. |
| BAS display | `web/src/components/BasMathSummary.jsx`, `TakeoffDataPanel.jsx` | Current math view is embedded above legacy tables. It consumes substantial vertical space and has no equipment-centered persisted workflow. |
| Browser result state | `TakeoffCanvas.jsx`: `lastCorpusTakeoffMeta`, `agentTakeoffRows`, `buildPayload` | Compiled BAS state is not serialized by the current autosave payload. Actual reload reproduces loss. |
| PDF storage | `web/src/lib/store.js`: `addPdf`, `pdf_revs`, revision readers | Same-name changed PDFs archive old bytes, but deleting a PDF also deletes its revisions. Approved BAS snapshots require durable source retention, not merely a pointer to this removable store. |
| Snapshots / comparison | `store.js`, `RevisionsPanel.jsx`, `revisions.js` | Generic snapshots exist; existing comparison is condition/finish-quantity oriented. Reuse storage and UI conventions, but do not force BAS truth through flooring math or modify commercial outputs. |
| Approval seals | `web/src/lib/approvals.js` | Drawing marks are distinct from BAS review approval. Do not treat an annotation stamp as an approval of a versioned BAS result. |
| Portable project | `web/src/lib/projectArchive.js` | Existing archive carries the current annotation payload and stored PDFs. Extend additively for BAS state and retained referenced versions; verify old archives still round-trip. |

Source identity and business identity must remain separate. A content hash identifies one exact PDF version; an equipment identity needs explicit project/building/system/phase scope. A filename, schedule row number, or nearest tag cannot safely stand in for both.

## Live UI findings and proposed placement

Follow-up on the real assigned-value reader: inherited muted text measured only
3.40:1 in dark mode. W3C's [WCAG 2.2 contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
requires at least 4.5:1 for normal text without rounding. The fix uses the
existing primary/secondary text tokens within BAS readers, not a new palette.
Actual PDF upload plus ordinary import of a verified workflow now measures all
411 sampled reader text elements at at least 6.51:1 in light and 7.71:1 in dark,
at 1280 and 1920 pixels. Evidence: `evidence/assignment-reader-contrast-before/`
and `evidence/assignment-reader-contrast-after/`. This is a bounded contrast and
state-preservation check, not an app-wide accessibility certification. Accessed
2026-09-09; exact unrounded ratios are retained in the JSON artifacts.

The real Fort Sam upload was compiled through the production endpoint. Captures at 1920×1080, 1440×900, and 1280×800 in both themes are retained in `evidence/baseline/workspace-ui/`. No response fixtures were injected. The reload check found a BAS result before reload and none afterward; no browser page errors occurred.

At 1280×800, the first point row appears around y=630, after the workspace header, tab row, family links, engineering heading, caution copy, total matrix, secondary tab row, and further copy. The problem is vertical hierarchy, not just width. Adding three more permanent panels would amplify it.

Recommended structure:

1. **Takeoff table** is the default working surface. Keep the existing canvas launchers/navigation. Show compact source-coverage and unresolved-item counts; avoid repeating the same caveat in multiple paragraphs.
2. **Selected equipment** opens a roomy internal detail workspace with points/SOO, assigned template, assembly/responsibilities, engineering checks, and source evidence. Preserve the equipment list or return context. Large tables scroll within their own workspace.
3. **Review & changes** is one internal entry. It opens a full-width issue queue with contextual drawing comparison and snapshot history. Release is an explicit action here, not a new canvas toolbar.
4. **Source inspection** returns through existing citation navigation. Remember filters, selected item, scroll, and drafts. Do not stack a new modal over Takeoff.

This recommendation preserves the existing theme. Readability and focus/contrast must still be tested; the captured baseline is not an accessibility certification.

## Feasibility and boundaries

| Workflow | Feasible complete journey | Missing/unsupported evidence treatment |
| --- | --- | --- |
| Point-list / SOO coverage | Discover source regions, interpret supported explicit clauses/table structures, account for every reviewed region, compare requirements, record corrections, persist and export evidence | Separate unavailable text, undiscovered scope, ambiguous segmentation, unsupported clauses, and unresolved conflicts. No automatic physical point from a mere alarm/device mention. |
| Templates → equipment | Scope equipment identities, apply explicit tag lists/ranges or reviewed assignments, reconcile scheduled and supported plan evidence, preview exact replication, retain exceptions | No all-project multiplier from a typical detail; unverified plan counts remain unverified. Operator assignment is a disclosed decision, not extracted truth. |
| Assemblies / responsibility | Materialize explicitly required components with derivation and exclusions; track furnish/install/wire/program/test independently; review/edit/export | No default contractor, stock assembly, or automatic extra device for each point. Factory, existing, by-others, and unknown remain distinct. |
| Engineering compatibility | Enter or extract declared ratings, allocate equipment, run shared Python checks, inspect failing inputs, revise and replay | Unknown inputs cannot pass. No product selection, guessed cable route, or certification. |
| Review / revisions / release | Persist source versions and decisions, pair versions, compute semantic changes, invalidate dependent approvals, issue a versioned export | Ambiguous pairing requires explicit resolution. Local integrity hashes cannot authenticate a reviewer or provide server-enforced immutability. |

There is no research basis for claiming universal autonomous interpretation under the selected technology limits. There is a basis for completing all five auditable workflows, with useful deterministic automation and explicit operator review. Production completion requires the acceptance evidence in `IMPLEMENTATION_PLAN.md`; neither this feasibility judgment nor the current test baseline is that evidence.

## Sources

All web sources accessed 2026-09-09. UFGS cover dates are document editions, not dates of every reference update. The hosted PDFs reference UMRL July 2026.

[^1]: USACE / NAVFAC / AFCEC. [UFGS 23 09 00, Instrumentation and Control for HVAC](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2000.pdf). August 2024, change 1 August 2025. Sections 3.3.10 and 3.7.3, PDF pp.44–46 and 52. Project tailoring notes, PDF p.6.
[^2]: USACE / NAVFAC / AFCEC. [UFGS 23 09 93, Sequences of Operation for HVAC Control](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2093.pdf). November 2015. Part 3 template/coordination notes and occupancy scheduling, PDF pp.9–15. Examples are not adopted as project requirements.
[^3]: USACE / NAVFAC / AFCEC. [UFGS 23 09 13, Instrumentation and Control Devices for HVAC](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2013.pdf). November 2015, change 2 May 2021. Section 2.9.1, PDF pp.35–36.
[^4]: USACE / NAVFAC / AFCEC. [UFGS 23 09 23.02, BACnet Direct Digital Control for HVAC and Other Building Control Systems](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2023.02.pdf). August 2024. Sections 2.3.2 and 2.3.4, PDF pp.13–16.
[^5]: Autodesk. [Comparing Sheets in the Takeoff Viewer](https://help.autodesk.com/cloudhelp/ENU/Takeoff-Files/files/Compare_Sheets.html). Undated current help page. Official workflow documentation and linked interface images; not authenticated product testing.
[^6]: Bluebeam. [Compare original PDFs with their revisions](https://support.bluebeam.com/revu/features/compare-documents-vs-overlay-pages.html). Undated; applies to Revu 20 and 21. Official support article.
[^7]: Togal. [Version History & Snapshot](https://help.togal.ai/version-history). Undated official indexed help description; direct retrieval unavailable. Only the indexed scope statement is used.
