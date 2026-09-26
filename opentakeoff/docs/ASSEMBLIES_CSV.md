# Assemblies CSV set — column reference

The assemblies export writes eight CSV files from one application of your
assembly library, plus `assemblies.pdf`: the report's PDF section (a summary,
the exceptions first, a table per family, and a row per unit with the
schedule row it cites). The Takeoff panel's download and the MCP tool
`apply_assemblies` (`export_dir`) write the same bytes; both come from
`web/src/lib/assemblies/exportSet.ts`. Files are RFC 4180 CSV (comma, CRLF,
quoted cells), UTF-8. A cell that starts with `=`, `+`, `-` or `@` gets a
leading `'` so a spreadsheet shows it as text.

The export stops at the role and its parameters. Choosing a product, sizing it
(Cv, actuator torque) and pricing it happen downstream, in HIT, Desigo Select
or your own tools.

## Conventions

**Units are in the column names**, for example `flow_gpm`, `coil_dp_psi` and
`line_size_in`.

**Every engineering field has a `*_source` column**, and no other column name
ends in `_source`. It says where the value came from:

| Source | Meaning |
|---|---|
| `schedule` | The printed schedule row: the unit's attribute, read from its cell. |
| `drawing` | A printed points list or another statement on the drawings. |
| `derived` | Computed by the takeoff. The rule is in this reference. |
| `project` | A project setting the estimator entered. |
| `partner_default` | A default from your (the partner's) library or profile. |
| `starter_default` | A default of the starter library. |
| `user` | The estimator's override, which carries a reason on the record. |
| `typical` | The typical's own value or rule (see `rule`). |
| `selection` | Left blank on purpose: an engineering decision made at selection time. |
| `unknown` | Blank because nothing gives it. It is never guessed. |

**Partner columns.** `part_no`, `unit_cost`, `hours` and `labor_category` hold
your own fields where your library's rule has them (see "The library as CSV"),
exactly as you entered them, and `partner_fields` then says `partner-entered`.
They are blank everywhere else: the starter library ships no product, price,
rate or hour. The currency and what a labor category means are yours.

**Scope.** The set can be narrowed to one party: the Takeoff panel's **Scope**
menu, or `export_scope` over MCP. `lines.csv` and `lines_rollup.csv` then keep
only that party's lines: lines of its trade, or lines it furnishes, installs,
wires, powers, programs or tests. The party is one of `controls`,
`mechanical`, `electrical`, `fire_alarm`, `factory`, `owner`, `general` or
`unassigned`. The other files stay whole: every unit, every point and every
device schedule, with who does what in its responsibility columns.

**Responsibility** is six columns, one per activity: `furnish`, `install`,
`wire_lv`, `power`, `program` and `test`. Each holds the party (for example
`controls` or `mechanical`). The typical's matrix sets them, and project
settings can change them.

## The key blocks

Every row of `lines.csv`, `valves.csv`, `damper_actuators.csv` and
`sensors.csv` starts with the line key block. `points.csv` and
`equipment.csv` start with the unit key block.

| Column | Meaning |
|---|---|
| `building`, `floor`, `system` | Where the unit is, when the schedule or its sheet says. |
| `unit_tag` | The scheduled unit's mark (for example `AHU-1`). |
| `unit_family` | The family the library applied (for example `DOAS` for a 100% outdoor-air AHU). |
| `layer` | `controls` or `hookup`. |
| `assembly` | The typical applied, as `id@version`. Blank when none applies. |
| `rule` | The line's rule: `id@version:line`, with the sub-assembly path when nested. |
| `role` | The line's role (for example `control-valve`, `supply-air-temperature`). |
| `label` | The line's label in the library. |
| `qty` | The quantity for this unit: the line's quantity × the unit's multiplier. Blank when unresolved. |
| `qty_with_waste` | `qty` with the line's waste. Rounding happens in `lines_rollup.csv`. |
| `qty_unit` | The unit of `qty` (for example `ea`, `ft`). |
| `status` | `ok`; `unresolved` (it waits for `waits_for`); `replaced` (drawing evidence stands instead); or `error`. |
| `waits_for` | What an unresolved line or record waits for, `;`-separated (for example `attr.vfd`). |

The provenance block ends the line files:

| Column | Meaning |
|---|---|
| `sheet`, `table_title`, `row_header`, `row_bbox` | The schedule row the unit cites: sheet, table, the cell's header, and its box (`x0 y0 x1 y1`, compile space). |
| `source_ref`, `source_license`, `source_derivation` | The public source the library line rests on, its license, and whether it is `verbatim`, `paraphrase` or `inferred`. |

## equipment.csv

One row per record: each scheduled unit, once per layer.

| Column | Meaning |
|---|---|
| unit key block | See above. |
| `schedule_family` | The family of the schedule the unit was read from. |
| `selected_by` | `rule` (the library's selector) or `user` (an override). |
| `status` | `ok`, `unresolved`, `no_assembly` (no typical for the family), `excluded` or `overridden`. |
| `waits_for` | What an unresolved record waits for. |
| `candidates` | Typicals the record could not choose between. |
| `excluded_reason` | The reason an estimator gave for excluding the unit. |
| `multiplier`, `multiplier_basis` | How many units the tag stands for (a printed QTY), and why. |
| `options`, `option_sources` | Each option as `id=value`, and where each value came from. `unresolved` when unknown. |
| `variables`, `variable_sources` | Each variable as `id=value`, and where each value came from. |
| `derived` | Facts the takeoff derived, with the rule: for example `terminals_served=12 (derive.terminals_served)`. |
| `printed_points_rows`, `printed_points_lists` | The printed points-list rows mapped to the unit, and the lists they come from. |
| `sheet`, `table_title`, `row_header`, `row_bbox` | The schedule row. |

## lines.csv

Every expanded line: the flat bill of materials, one row per line per unit.

| Column | Meaning |
|---|---|
| line key block | See above. |
| `kind` | `point`, `device`, `component`, `labor` or `note`. |
| `io` | A point's I/O type: `AI`, `AO`, `BI`, `BO`, `PULSE`, `NET-IN`, `NET-OUT` or `SOFT`. |
| `device_role` | For a point, the device line it belongs to. |
| `waste_pct` | The line's waste. |
| `round` | The order rounding applied in the roll-up (`ceil`, or `increment n`). |
| `qty_basis` | `evidence` when a known quantity rests on the drawings and project, `partner_default` when a partner default stands in. |
| `size_in`, `size_in_source` | A component's or device's size, in inches (the connection or line size). |
| `end_type`, `end_type_source` | A component's end connection (for example `threaded`, `flanged`). |
| `params`, `param_sources` | Every parameter as `name=value`, and where each came from. |
| `trade` | The trade that installs the line. |
| `labor_task`, `labor_driver` | The labor-task hook: the task and what drives its count. No hours ship. |
| `furnish` … `test` | The six responsibility columns. |
| provenance block | See above. |
| `part_no`, `unit_cost`, `hours`, `labor_category` | Partner columns: your own fields on the line's rule, as entered; blank otherwise. |
| `partner_fields` | `partner-entered` when the line's rule carries any partner field; blank otherwise. |
| `extended_cost` | Partner-entered: `qty_with_waste` × `unit_cost`, the material bought, waste included. Blank when either is not known. Order rounding (`qty_order`) is not applied. |
| `extended_hours` | Partner-entered: `qty` × `hours`, the installed quantity. Blank when either is not known. |

## lines_rollup.csv

The bill of materials summed by breakdown: building, floor and family by
default. Rows are grouped by what is bought (kind, role, I/O, unit, parameters
and rounding rule). Rounding happens here and nowhere earlier.

| Column | Meaning |
|---|---|
| `building`, `floor`, `system`, `family` | The breakdown's group. A column not in the breakdown is blank. |
| `kind`, `role`, `io`, `qty_unit`, `params`, `round` | What is bought. |
| `qty`, `qty_with_waste` | The sums of the known lines. |
| `qty_order` | `qty_with_waste` rounded by the line's rule: the order quantity. |
| `lines_summed` | Known lines summed into the row. |
| `lines_unresolved`, `lines_replaced`, `lines_error` | Lines left out for want of a quantity. A total never hides them. |
| `tags` | The units in the row. |

## points.csv

Points per unit. Where a printed points list names the unit, its rows stand
instead of the typical's point lines (`source` `drawing`). Otherwise the
typical's point lines are listed (`source` `typical`).

| Column | Meaning |
|---|---|
| unit key block | See above. |
| `point` | The printed point's mark, or the typical line's label. |
| `function` | The printed description, or the typical line's role. |
| `io` | The I/O type. |
| `device_role` | The device line a typical point belongs to. |
| `qty` | The number of points: one per unit the tag stands for. |
| `status`, `waits_for` | As in the line key block. |
| `signal`, `signal_source` | Left for selection. |
| `source` | `drawing` or `typical`. |
| `rule` | The typical line's rule, or `printed points list: <title>`. |
| `sheet`, `table_title`, `row_header`, `row_bbox` | The schedule row, or, for a printed point, the list's sheet, title, point mark and box. |

## valves.csv

Control valves (role `control-valve`), with the fields a valve-sizing tool
asks for.

| Column | Meaning |
|---|---|
| line key block | See above. |
| `service`, `service_source` | The medium: `chw`, `hw`, `steam`, `cw`, `dual_temperature`, … |
| `body`, `body_source` | `2-way` or `3-way`. |
| `action`, `action_source` | `modulating` or `two_position`. |
| `characteristic`, `characteristic_source` | The flow characteristic, where the typical gives one. |
| `line_size_in`, `line_size_in_source` | The coil or equipment connection size. |
| `flow_gpm`, `flow_gpm_source` | The design flow from the coil or equipment schedule. |
| `coil_dp_psi`, `coil_dp_psi_source` | The coil's water pressure drop: its printed WPD in feet of water × 0.433 (`derived`). |
| `cv`, `cv_source` | The valve's Cv when the schedule prints one. Otherwise left for selection. |
| `valve_dp_psi`, `valve_dp_psi_source` | (GPM / Cv)² when both are known (`derived`). |
| `fail_position`, `fail_position_source` | Normally open, normally closed or last position, when given. |
| `steam_lb_hr`, `steam_lb_hr_source` | Steam flow, for a steam valve. |
| `steam_inlet_psig`, `steam_inlet_psig_source` | Steam inlet pressure, for a steam valve. |
| `signal`, `signal_source`, `voltage`, `voltage_source`, `close_off_psi`, `close_off_psi_source`, `pressure_class`, `pressure_class_source`, `glycol_pct`, `glycol_pct_source` | Left for selection or the specification. |
| responsibility, provenance and partner columns | See above. |

## damper_actuators.csv

Damper actuators (role `damper-actuator`).

| Column | Meaning |
|---|---|
| line key block | See above. |
| `service`, `service_source` | The damper's service. Library v1 carries it in the label only, so it is blank (`unknown`) and `label` names it. |
| `signal`, `signal_source` | `modulating` or `two_position`. |
| `fail_position`, `fail_position_source` | The fail position. |
| `spring_return`, `spring_return_source` | Whether the actuator is spring return. |
| `width_in`, `width_in_source`, `height_in`, `height_in_source`, `sections`, `sections_source`, `area_ft2`, `area_ft2_source`, `flow_cfm`, `flow_cfm_source`, `velocity_fpm`, `velocity_fpm_source`, `static_in_wc`, `static_in_wc_source` | The damper's size and duty. Blank (`unknown`) until a damper schedule is read. |
| `voltage`, `voltage_source`, `end_switches`, `end_switches_source`, `torque_in_lb`, `torque_in_lb_source` | Left for selection. |
| responsibility, provenance and partner columns | See above. |

## sensors.csv

Sensors and switches, by the variable each measures.

| Column | Meaning |
|---|---|
| line key block | See above. |
| `variable` | What the device measures, from its role: `temperature`, `relative_humidity`, `pressure`, `co2`, `airflow`, `occupancy`, `water_flow`, `level`, `smoke`, `low_temperature`, `pressure_switch`, `current`, `position`, `vibration`, `hood_face_velocity`, `electric_energy` or `utility_flow`. |
| `medium`, `medium_source` | Air or water, where the typical says. |
| `mounting`, `mounting_source` | The form: `duct`, `room`, `immersion`, `outdoor`, `duct_static`, … |
| `element`, `element_source` | The sensing element, where the typical says (for example a freezestat's). |
| `range`, `range_source`, `accuracy`, `accuracy_source`, `signal`, `signal_source`, `accessories`, `accessories_source` | Left for selection or the specification. |
| responsibility, provenance and partner columns | See above. |

## desigo_select_worksheet.csv

A hand-entry worksheet laid out the way Desigo Select asks for input. It
selects no controller or cabinet. Room automation counts the terminal units.
Plant automation has one row for each other unit with a typical or a printed
points list; a unit with neither has no points to count, and the
`desigo_cc` row's note says how many there were.

| Column | Meaning |
|---|---|
| `section` | `room_automation`, `plant_automation` or `desigo_cc`. |
| `building`, `floor` | Where the units are. |
| `group` | Room automation: the typical (`id@version`). Plant automation: the unit's tag. |
| `family` | The unit family. Room automation counts terminal units: VAV, FCU, unit heater, fin-tube radiation, heat pump and lab air valve. |
| `units` | Units in the group (the multipliers summed). For `desigo_cc`, the number of plant rows. |
| `AI`, `AO`, `BI`, `BO`, `PULSE`, `NET_IN`, `NET_OUT`, `SOFT` | Plant automation: the unit's points by type, from its printed list where there is one. |
| `field_points` | Hardwired points (AI, AO, BI, BO, pulse). For `desigo_cc`, the sum over the plant rows. |
| `points_from` | `drawing` (a printed list), `typical`, or `typical (record unresolved)`. |
| `integration_points` | Points on a network interface. |
| `note` | Lines that wait for a value, and what the worksheet leaves to the tool. |

## The library as CSV (assemblies-library.csv)

**Library → Export CSV** writes your whole assembly library (the starter and
your own records) as one CSV, one row per item, and **Import CSV…** reads it
back. Edit a copy in a spreadsheet: clone a starter record to a new version
first, because a starter record is read-only. An unchanged starter row is
skipped on import, and a changed one is refused with the reason. Every row of
your own is checked by the same gate as a profile's library, and every problem
is reported by row and column. A record with any problem is not imported.

Every row names its record with `row_type`, `assembly_id` and
`assembly_version`. `row_type` is one of:

| `row_type` | Columns it uses |
|---|---|
| `assembly` | `title`, `assembly_kind` (`equipment`, `project` or `part`), `families`, `selector`, `rank`, `layer`, `status` |
| `option` | `item_id`, `label`, `auto`, `default` (`true` or `false`), `note` |
| `variable` | `item_id`, `unit`, `from`, `default`, `prompt` |
| `line` | `item_id`, `line_kind`, `label`, `when`, `qty`, `unit`, `waste_pct`, `round`, `role`, `io`, `device_role_ref`, `sub_assembly`, `params`, `resp_furnish`, `resp_install`, `resp_wire_lv`, `resp_power`, `resp_program`, `resp_test`, `trade`, `profile_switch`, `labor_task`, `labor_driver`, `part_no`, `unit_cost`, `hours`, `labor_category`, `export_category`, `cost_code`, `source_ref`, `source_license`, `source_derivation` |
| `provenance` | `prov_source`, `prov_edition`, `prov_locator`, `source_license`, `source_derivation`, `prov_reviewer`, `prov_date` |

Typed cells are written so they read back exactly:
- `families`: one family's name, or a JSON array (`["AHU","RTU"]`);
- a variable's `default` and a line's `params`: JSON (`5`, `"manual"`,
  `{"size_in":"attr.hw_conn_in"}`);
- `role`: `vocab:id` (for example `ot:control-valve`);
- `sub_assembly`: `id@version`, or `id` for the newest;
- `round`: `none`, `ceil` or `increment:<n>`.

The partner columns (`part_no`, `unit_cost`, `hours`, `labor_category`) are
yours: the starter leaves them blank. What you enter reaches `lines.csv` and
the device files, labelled `partner-entered`. `lines.csv` extends it by each
line's quantity, and the report's PDF section sums the extended cost and the
extended hours by labor category under "Partner-entered cost and labor".
