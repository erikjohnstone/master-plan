# Initial source-reviewed narrative cases

These cases are authored before narrative-parser implementation. They come from
visual review of the Fort Sam Houston excerpt and its already revalidated raw
text/ground-truth captures, not from the output of a new narrative parser.
They do not replace the requirement to inspect the other development PDFs and
evaluate the reserved holdout after rule freeze.

Source: focus rank 12, `12__vol2__028__Fort_Sam_Houston_Building_615_Controls_Excerpt.pdf`,
SHA-256 `c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`.
Reference renders: the original collection's `ground_truth/reviews/12__vol2__028/`.
Positioned-text evidence: `evidence/baseline/fort-sam-text.json`.
Existing baseline sequence compile: zero; this is a known omission, not a zero
source expectation.

| PDF page / sheet | Primary sequence blocks that must be separately accounted for | Critical segmentation / interpretation control |
| --- | --- | --- |
| 2 / M-506 | MINI-SPLIT CONTROL SEQUENCE; EXHAUST FAN CONTROL SEQUENCE | Multiple nearby I/O matrices, general notes, zone-temperature prose, diagrams and captions must not blend into either sequence. Retain related unassigned notes separately; no claim that only the two sequence headings account for all requirements. |
| 5 / M-509 | CHILLED WATER SYSTEM CONTROL SEQUENCES; HEATING-WATER SYSTEM CONTROL SEQUENCES | Two independent long columns. Large lower captions repeat the subject but are not two extra sequences. Preserve numbered/lettered subclauses and their system scope. |
| 6 / M-510 | FAN COIL UNIT (FCU) CONTROL SEQUENCE | A wide sequence below a separate point matrix and schematic. Safety/alarm paragraphs describe components and behavior; they do not automatically establish an additional physical I/O terminal for every alarm. |
| 7 / M-511 | DEDICATED OUTSIDE AIR SYSTEM CONTROL SEQUENCE; SEQUENCE OF OPERATION VAV TERMINAL UNIT (NON-FAN POWERED) | Different widths and vertically offset blocks. The VAV text says “each” but does not establish installed multiplicity. The DOAS context identifies DOAS 3 separately from the following page's DOAS 1/2. |
| 8 / M-512 | DEDICATED OUTSIDE AIR SYSTEM CONTROL SEQUENCE | Same generic heading as page 7, but materially different occupancy/run behavior. Do not deduplicate by title or high text similarity. The DOAS 1/2 caption supports applicability review, not two additional devices counted from caption occurrences. |

There are eight explicitly titled primary sequence bodies in these reviewed
regions. General controls/zone prose and all other possible requirements still
need their own coverage accounting. This count is not a “complete project SOO”
claim and must not become a hardcoded production expectation.

## Negative and edge requirements

1. Table cells, point flags and repeated view captions must not be silently
   inserted into neighboring narrative clauses.
2. The two DOAS bodies remain distinct source records, including the occupied
   versus unoccupied behavior and negation. A shared heading is insufficient
   to declare interchangeable control templates.
3. Factory-furnished onboard controllers establish a furnished-component
   statement; they do not independently assign install, wire, program or test.
4. A sensor mentioned in an alarm paragraph is not automatically a second
   device if another paragraph describes the same sensor. Conversely, distinct
   high/low pressure switches must not be collapsed because both are pressure
   alarms.
5. Explicit hardwiring of a safety to a motor circuit is not proof of a separate
   BAS DI unless that input is actually established. Preserve physical component
   and signal requirements as separate concepts.
6. “Each VAV” permits per-unit template interpretation only after applicability
   and the actual equipment set are established. No installed quantity is
   derived from this paragraph alone.
7. The source's unusual printed I/O categories must be preserved and any
   apparent engineering inconsistency reviewed, not silently reclassified by
   point-name heuristics.
