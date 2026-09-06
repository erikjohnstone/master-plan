# Cherry Point ATC Tower and Air Operations - audit in progress

Scope: all 75 supplied pages. This is not a completed ground-truth record.
Source SHA-256: `9b83f64b9ef98c22a4053ab4e79665fe7581a620c2908c2239b9216c02e2c0bf`.

The initial [source context](source_overview.json) records pages 1-2: project,
location, engineer, page-1 issue row, building roster and narrative precedence.
[metadata](metadata.json) now supplies a two-parser verified title-block, issue
and sheet-scope ledger for all 75 pages. Both raw PDF engines have captured all
75 pages.

The M-002 narrative explicitly defers to remaining drawings/specifications on
conflicts. Its capacities and redundancy descriptions are not substitutes for
the actual schedules. Building-scoped identities are essential: Air Operations,
MTRACON and ATCT have different plant/system scopes and critical-room redundancy.

The verified [M-601 Air Operations core schedules](schedules_air_ops_core.json)
contain all 30 printed rows from the AHU, both DOAH schedule parts, FCU, pump
and boiler schedules (670 strict cells). The 180-DPI visual review and both
independent native-text engines corroborate that module. Printed schedule rows
remain separate from installed-plan quantities.

M-602's [compact equipment and isolation tables](schedules_air_ops_aux.json)
cover 18 rows / 137 strict cells, its [full VAV matrix](schedules_air_ops_vav.json)
covers 27 rows / 594 strict cells, and its [duct/piping construction schedules](construction_air_ops.json)
cover 13 rows / 100 strict cells. M-603's [CHW](valves_air_ops_chw.json) and
[HHW](valves_air_ops_hhw.json) control-valve tables contain all 21 and 46
printed rows, respectively; its [other compact equipment schedules](schedules_air_ops_m603_compact.json),
[grille/register/diffuser matrix](schedules_air_ops_grd.json), and [fan sound-power
matrix](schedules_air_ops_fan_sound.json) complete the sheet. Two chiller Cv
cells visibly render as `324.0` while both native captures preserve an overlapped
hidden `57.1` vector word; the evidence module retains that exception explicitly
by engine and word ID rather than concealing the source defect.

Next: complete the MTRACON/ATCT schedules, then controls matrices, sequence
review, and full plan sensor/equipment reconciliation. MTRACON's [control-valve
tables](valves_mtracon.json) now cover 54 rows / 378 strict cells and its [VAV
matrix](schedules_mtracon_vav.json) covers 25 rows / 550 strict cells. The
[Air Ops DOAH point list](points_air_ops_doah.json) adds 67 explicit BAS points
with alarm/trend flags, its [AHU point list](points_air_ops_ahu.json) adds 31,
its [CHW system point list](points_air_ops_chw.json) adds 33, and its [HHW system
point list](points_air_ops_hhw.json) adds 39. The latter three retain literal
placeholder marks, source duplicate descriptions and controller-point flags where
printed. The [combined MTRACON/ATCT CHW point list](points_mtracon_atct_chw.json)
adds 63, retaining its source tag gap and duplicate feedback descriptions. The
[combined MTRACON/ATCT HHW point list](points_mtracon_atct_hhw.json) adds 102
rows across the two printed panels, retaining its continuation geometry and
literal duplicate text. The [ATCT DOAH-T1 point list](points_atct_doah.json)
adds 34 and the [paired ATCT AHU-T1A/T1B point list](points_atct_ahu.json)
adds 62. The [bounded ATCT DOAH-T1 sequence assertions](sequence_atct_doah_t1.json)
capture 18 control-logic, safety, alarm and setpoint statements; they do not
stand in for a complete all-sequence review. The initial logo read has now been
visually corroborated on the M-601 render, but the firm identity still needs a
bounded parser-backed metadata assertion before being treated as final project
metadata. The [ATCT stair pressurization point list](points_atct_stair_pressurization.json)
adds 12 points and records its reference to fire-protection sequences without
inventing those controls. MI740's [FCU and unit-heater point templates](points_fcu_unit_heater_templates.json)
add 26 explicit printed rows, pending device-by-device schedule/plan reconciliation.
MI741's [CRAH and series-fan VAV templates](points_crah_sfpvav_templates.json)
add 22 further printed BAS rows, and its [bounded CRAH/SFPVAV sequence assertions](sequence_crah_sfpvav.json)
preserve 27 explicit controller, safety, redundancy, occupancy and setpoint statements.
Neither reusable template is converted into an installed-device count before
schedule and plan reconciliation.
MI742's [four controls point-list templates](points_mi742_templates.json) add
26 printed rows for humidification, UPS exhaust, bathroom exhaust and elevator
machine-room systems. Its [bounded sequence assertions](sequence_mi742.json)
preserve 24 explicit operation, interlock, alarm, load-shed and setpoint
statements. Both modules retain source typos and unusual printed point
classifications rather than silently correcting them.
MI743's [Air Operations heating-and-ventilating point list](points_air_ops_heating_ventilating.json)
adds 16 rows, and its [source-bounded sequence](sequence_air_ops_heating_ventilating.json)
captures damper proof/open/close behavior, 15-second closure delay, HHW control,
alarms and limits. MI744 adds 17 rows across its [occupied FCU, redundant-FCU,
and AHU/VAV/FCU matrix](points_mi744_fcu_sfpvav.json), with
[16 bounded control assertions](sequence_mi744_fcu_sfpvav.json) for occupied,
duty/standby, AHU-failure, recovery and Sunday exercise operation. Its literal
SPFVAV/SFPVAV spellings and copy-forward source text are retained as conflicts.
MI700's [control-symbol/abbreviation legend](controls_legend_mi700.json) records
the source meanings of BAS point types, sensors, DDC valves and dampers without
turning a legend into a count. MI701's [network architecture](network_mi701.json)
records BACnet IP, BACnet MS/TP, the UUKL network, NAE locations, 15 named
controller nodes and printed external interfaces. It does not infer unprinted
addresses, port counts, or controller/protocol associations from geometry alone.
ATCT's M-622 control-valve schedules now add 22 HHW and 24 CHW rows / 322
strict cells in [valves_atct](valves_atct.json), preserving the literal
`FCU-T9` / `FCU-9-CHW` source mismatch. MI703's [Air Ops/MTRACON DOAH
sequence](sequence_air_ops_mtracon_doah.json) now supplies 22 source-bounded
statements across fire/HOA, occupancy, airflows, ERV/coil, freeze, shutdown,
alarms and setpoints. MI705/MI711/MI713/MI721/MI723's [AHU and hydronic
sequences](sequences_air_ops_and_shared_hydronics.json) add 22 more bounded
statements covering Air Ops and shared MTRACON/ATCT plant behavior, but neither
module converts sequence prose into unprinted installed I/O or controller
terminal counts.

The initial MTRACON and ATCT schedule pass now anchors literal source marks
without treating them as a final plan quantity takeoff: [M-611](schedules_mtracon_m611.json)
has 33 rows across AHU, FCU, pump, boiler, unit-heater, heat-recovery chiller,
air-separator and CRAH tables; [M-612](schedules_mtracon_m612_aux.json) adds
the two-part DOAH-M1 schedule and three range hoods; [M-613](schedules_mtracon_m613_aux.json)
adds 33 auxiliary air-device/humidity rows; and [M-621](schedules_atct_m621.json)
adds 42 ATCT equipment rows. These modules verify literal mark cells in both
engines and retain selected schedule context, but full per-row specifications,
plan placement and point-owner reconciliation still gate completion.
