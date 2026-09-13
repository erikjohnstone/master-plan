# BAS holdout evidence roles

These JSON files preserve the outcome that existed when each evaluation ran.
The embedded `split` field is the document's reservation status at process
start, not a claim that every file remained blind afterward. The current status
of each corpus item is authoritative in `../../corpus-inventory.json`.

| File | Evaluation role | Result | Permitted interpretation |
| --- | --- | --- | --- |
| `05__vol2__009.json` | Initial full-pipeline holdout, then retired for debugging | 7/8 point matrices and 50/75 rows before source recovery; 15 equipment candidates included cross-trade schedules | Failure evidence that drove generalized point-source recovery and narrow cross-trade exclusion. Not blind after debugging. |
| `source-regression-05__vol2__009.json` | Post-fix source-path development regression | 8 matrices and 75 rows, equal to the independent aggregate; three exact titles remain ambiguous to the evaluator's generic-title containment matcher | Confirms recovered aggregate rows, physical/software separation, and explicit core-column blockers. This is neither blind nor a full-graph result. |
| `08__vol2__044.json` | Blind full-pipeline evaluation; no tuning | 2/2 authored point matrices and 96/96 rows; zero directional physical I/O observations | Exact table/row discovery. Correctly does not convert BACnet object-list attributes into hardwired AI/AO/DI/DO. |
| `15__vol2__067.json` | Opened evaluation-only negative control | 0 point matrices for 23 diagram callouts | Diagram labels are not promoted into a point schedule. |
| `19__vol2__094.json` | Opened evaluation-only negative control | 0 point matrices where no authored point table exists | No point-table fabrication. |
| `24__vol2__019.json` | Full real-PDF development regression after debugging | 5/5 matrices, 158/158 rows, AI 59 / AO 33 / DI 41 / DO 25; 17/17 equipment schedules and 132/132 rows | Current shared-pipeline regression proof, not an untouched holdout. Installed quantity remains `null`. |
| `source-27__vol1__21.json` | Final blind source-path evaluation; no tuning after open | 0/1 expected table | Honest miss: the record classifies a `CHILLED WATER SYSTEM CONTROL DIAGRAM` as a one-row point table, while the bounded source recovery accepts explicit point-list/schedule structures only. This is not full-graph evaluation. |

The final blind miss is intentionally retained. It was not converted into a
pass by weakening the table gate, treating diagram callouts as rows, changing a
truth record, or tuning a new rule after opening the last reserve.

All files compare automatic capture with the corpus's independent records, whose
own metadata states that the claims are not independently reverified. They are
evidence for the declared bounded checks—not proof of universal BAS extraction,
installed quantity, complete design verification, or autonomous release.
