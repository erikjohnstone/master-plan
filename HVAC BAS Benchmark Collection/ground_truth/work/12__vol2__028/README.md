# Fort Sam Houston Building 615 - complete supplied-excerpt ground truth

This directory and its self-contained record audit the supplied nine-sheet
archive excerpt, not the unprovided remainder of the 191-sheet Building 615
final-design set. The assembled record is
`ground_truth/records/12__vol2__028.json`: all 65 schedule rows, 193 BAS
matrix rows, written/P&ID controls context, 25 logical sensor roles and all
nine full-page reviews are current and independently corroborated. It retains
the missing-plan limitations instead of inventing installed equipment, sensor,
controller, terminal, wiring or zone quantities.

- `metadata.json` has the nine-sheet/page ledger, exact title-block fields,
  issue-date semantics, visual-review findings, and scale-bar finding. Its 54
  bounded assertions pass independently in MuPDF and Poppler.
- `points_m506_airside_templates.json` exactly transcribes M-506 details 1 and
  2: the 10-row mini-split and 6-row switch-controlled exhaust-fan BAS I/O
  matrices. It has 112 strict cells (224 independent engine checks). Numeric
  marks are local diagram callouts; neither list is represented as a physical
  controller count or installed-equipment quantity.
- `points_m506_meter_global_templates.json` exactly transcribes M-506 details
  3 through 6: water, gas, electric and global I/O. It retains all 39 source
  rows, including three blank-but-numbered global slots, in 468 strict cells.
  It also preserves the anomalous `GAS METER FAILURE` row in the water-meter
  table without inventing a correction.
- `controls_context_m506.json` records the M-506 mini-split and exhaust-fan
  sequences, occupancy-temperature provisions, BACNET/GUI statements, and the
  source limits on transport, installed sensor count and zone mapping. The two
  parsers' degree-glyph ordering difference is explicitly disclosed.
- `points_m507_chw_template.json` exactly transcribes the 25-row chilled-water
  P&ID matrix in 175 strict cells, including asterisked chiller-controller
  points and the source note defining that qualifier.
- `points_m508_hhw_template.json` exactly transcribes the 34-row heating-water
  P&ID matrix in 238 strict cells, including boiler-controller-qualified rows,
  CO input, differential-pressure logic inputs and all printed alarm flags.
- `controls_context_m507.json` and `controls_context_m508.json` record the
  two P&IDs' exact PRV, bypass-valve, controller-ownership and scale context
  in 16 bounded assertions. They explicitly distinguish those P&ID/point-list
  sheets from M-509: neither M-507 nor M-508 prints a written sequence of
  operations, and neither is used to infer an installed equipment or sensor
  count.
- `controls_context_m509_hydronic.json` captures the source's two dense
  hydronic sequences in 30 bounded two-parser assertions: critical-valve
  differential-pressure reset, lead/standby, freeze sequences, BACNET/HMI
  integration, boiler combustion control, and the mechanical-room CO safety
  interlock. It retains the literal `SEND WATER IS FLOWING` wording in the
  source's chilled-water freeze clause rather than silently repairing it.
- `points_m510_fcu_template.json` exactly transcribes the 19-row FCU P&ID
  matrix in 190 strict cells. It preserves the literal `SMOKE DETERCTOR ALARM`
  spelling and the source's printed I/O classifications without reclassifying
  valve or damper position rows.
- `controls_context_m510.json` captures the FCU sequence in 21 bounded
  two-parser assertions, including occupied/unoccupied logic, coil lockout,
  freeze/ESD, static/smoke/filter/condensate safety, and seven logical sensor
  roles without inferring installed quantities.
- `points_m511_doas3_vav_templates.json` exactly transcribes the 29-row DOAS-3
  and 4-row non-fan-powered VAV-terminal P&ID matrices in 231 strict cells.
  The source's atypical `DAMPER POSITION` classification under `DO` is retained
  verbatim; template rows remain distinct from physical controller counts.
- `controls_context_m511.json` records both M-511 written sequences with 21
  bounded two-parser assertions, including VFD/static-pressure and 200-CFM
  exhaust-offset control, the 55°F/70°F coil targets, the BACNET/GUI clauses,
  VAV occupancy behavior and the supplied-excerpt limits on device quantities
  and zone mapping.
- `points_m512_doas12_template.json` exactly transcribes the 27-row DOAS-1/2
  P&ID matrix in 189 strict cells, retaining the local `DOAS 1 OR 2` source
  scope and printed type flags without deriving installed controller counts.
- `controls_context_m512.json` captures 14 M-512 sequence assertions, including
  BAS building-schedule/zone-override behavior. It keeps its unoccupied
  `shall not run unless a zone override command is received` rule distinct from
  the different M-511 DOAS-3 unoccupied sequence.
- M-601 is completely transcribed through four modules: its 23 FCU/FCC rows,
  three DOAS rows, one boiler, one combined unit-heater row, one chiller, and
  three exhaust-fan rows. The 32 exact schedule rows contain 877 strict cells,
  retaining all printed performance, hydronic, electrical, dimensions, model,
  notes, spelling, and zero-like NEMA source values.
- M-505 is completely transcribed through `schedules_m505_silencer_esp.json`:
  16 Noise Control Duct Silencer Schedule rows and 17 External Static Pressure
  Schedule rows, with 278 strict cells retaining the source's selections,
  performance values and blanks.

The final reconciliation modules document the source-row identity scope, P&ID
template ownership limits, source conflicts and archive-excerpt absences. The
assembled record passes its final hash, source, page-review and requirement
audit with 2,932 bounded assertions / 5,864 independent engine checks.
