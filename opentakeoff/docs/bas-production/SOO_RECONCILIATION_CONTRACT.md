# SOO, listed points and equipment references — implementation contract

This is the next shared-path increment, not a reduction of the five-workflow
goal. Source interpretation, scope/identity and joins belong in shared modules.
Do not change VectorGrid, the existing point interpreter or Python math.

## First supported semantic unit

An explicit `THE CONTROLLER SHALL MONITOR … AND MODULATE … TO MAINTAIN …`
clause establishes a monitoring requirement plus a retained control objective.
It does **not** establish AI, DI, hardwiring, a new sensor, installed quantity,
or complete control-sequence interpretation. Preserve source wording, original
spans/boxes, operating-mode prefix, modulation phrase, target and any remaining
prose. Never strip `NOT`, `UNLESS`, `ONLY`, `EXCEPT`, conditions, compound subjects
or references to make an unsupported clause fit. A strict initial grammar is
allowed to recognize a bounded requirement inside a paragraph, but all other
text must remain explicitly uninterpreted. Heading-only/ambiguous regions cannot
supply requirements. Every paragraph/inset remains in coverage accounting.
`operating_mode` is the explicit local prefix only. Every resulting requirement
retains `scope_status=requires_region_review`: parent clauses, unheaded notes,
general applicability and continuation scope are not claimed resolved by this
bounded grammar. Full original region/paragraph evidence remains available.

The initial normalized monitored-variable dictionary is literal equivalence
only: case/whitespace, `CHW` → `CHILLED WATER`, `HW` → `HOT WATER`,
`TEMP`/`TEMP.` → `TEMPERATURE`, and `SET POINT` → `SETPOINT`. Never remove
`SETPOINT`, `STATUS`, `ALARM`, `SUPPLY`, `RETURN`, equipment tags or conditions.
Only exact normalized variable equality is eligible for a listed-point match.
Unknown/numeric/compound variable syntax stays uninterpreted. No fuzzy match.

## Explicit association, not guessed applicability

The reconciler consumes source-reviewed associations between one exact sequence
region and one exact point matrix. Each association needs a reason and a
reference-only equipment scope containing a tag, explicit building/system/phase
labels if established, and literal source-span evidence for that tag. Unresolved
scope labels remain unknown; source version and reference occurrence keep such
references distinct. A diagram/caption mention is **not** an installed device.
An operator-reviewed association is separate from raw extraction and carries
its provenance; it is not an approved takeoff. The current programmatic tests
use explicitly labeled source-review fixtures, not invented operator actions.

Associations must name current source-owned region/matrix IDs and exact source
spans. Reject stale/foreign references and duplicate associations. A title match,
same-page position, proximity or the words `points listed here` never creates an
association automatically. The user-facing assignment journey and robust
automatic explicit-reference/range resolution remain required later.

For each selected association, report every supported monitoring requirement
as one of: one literal matching listed row, no matching row **in the selected
matrix**, or multiple ambiguous matching rows. Retain all raw point declarations
and qualifiers without retyping or summing them. A matching label is only
`listed`, not satisfied/installed/field-wired/approved. Extra point rows remain
visible as not compared; lack of a parsed SOO clause is not evidence to delete
them. Duplicate labels cannot be merged automatically.

Repeated captions and equipment mentions never multiply points. Identical-title
sequences remain separate. A link to a reference does not establish per-unit or
whole-system replication. Physical and software demand totals remain unavailable
from this increment. Later assignment/reconciliation will invoke the existing
shared Python engine only with established typed identities and quantity bases.

## Independent real-source controls, authored before these rules

Fort Sam M-511 / PDF page 7 and M-512 / page 8 were visually reviewed in full.
Both DOAS sequences explicitly monitor (a) CHW coil leaving air temperature in
cooling, (b) supply air temperature in heating, and (c) duct static pressure in
supply-fan control. The page-7 DOAS matrix lists all three; the pressure row is
printed **DI**, which must remain DI rather than being silently changed to AI.
The page-8 matrix lists the two temperatures but **does not list duct static
pressure**. That is a bounded source discrepancy, not proof of a project-wide
missing input. DOAS 3 and DOAS 1/2 references appear in the respective diagrams;
their captions establish references, not verified installed quantities.

Their unoccupied behavior differs: page 7 describes running at 30% load, page 8
says not to run unless a zone override is received. Neither may be erased or
generalized to a common template. `bas-soo-monitor-cases.json` is manually
authored from those pages and the retained original PDF spans, not parser output.

Required tests: exact six monitored requirements and original mode/targets;
five listed-row matches / one selected-matrix omission after explicit source
association; page-7 DI unchanged; no inferred I/O or installed count; no
automatic links; duplicate-row ambiguity; cross-page/same-title separation;
negation/conditional/compound/adversarial clauses; stale/foreign span/association
rejection; exact source preservation; deterministic replay; both surfaces use
one module. Subsequent production capture, UI assignment/review, export and
full corpus/holdout gates are required before calling this workflow delivered.
