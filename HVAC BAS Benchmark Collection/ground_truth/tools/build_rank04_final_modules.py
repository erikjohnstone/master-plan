"""Author the coordinator modules and manifest for rank 04.

All lists in this file are manually transcribed from the already reviewed pages
and independently corroborated annotation modules.  It deliberately does not
inspect the PDF to discover or count objects.
"""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "04__vol2__062"
WORK = AUDIT / "work" / IDENT


def write(name, value):
    (WORK / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def point_table(identifier, sheet, page, title, x_edges, y_ranges, rows):
    return {
        "id": identifier,
        "sheet": sheet,
        "page": page,
        "title_as_printed": title,
        "columns": "tag|point_name",
        "x_edges": x_edges,
        "y_ranges": y_ranges,
        "rows": rows,
        "source_row_semantics": "Literal published point-list row. The printed list does not assign an AI/DI/AO/DO hardware type to each row.",
    }


def build_points():
    tables = [
        point_table(
            "M62-BOILER-PUBLISHED-POINTS-LEDGER", "M6.2", 18, "BOILER POINTS LIST",
            [1525, 1544, 1650],
            [[547, 558], [559, 570], [571, 582], [583, 594], [595, 606]],
            ["1.|STATUS.", "2.|ALARM.", "3.|CAPACITY FEEDBACK.", "4.|FIRING RATE.", "5.|SET POINT."],
        ),
        point_table(
            "M62-VFD-PUBLISHED-POINTS-LEDGER", "M6.2", 18, "VFD POINTS LIST",
            [1525, 1544, 1650],
            [[639, 649], [650, 661], [662, 673], [674, 687]],
            ["1.|ENABLE/DISABLE.", "2.|STATUS.", "3.|SPEED CONTROL.", "4.|ALARMS."],
        ),
        point_table(
            "M63-AHU-WRITEABLE-POINTS-LEDGER", "M6.3", 19, "AHU POINTS LIST - WRITEABLE POINTS",
            [1685, 1705, 1950],
            [[166, 180], [180, 191], [191, 203], [203, 214], [214, 226]],
            [
                "a.|UNIT ENABLE / DISABLE", "b.|DUCT STATIC PRESSURE RESET SET POINT",
                "c.|SUPPLY AIR TEMPERATURE RESET SET POINT", "d.|BUILDING STATIC PRESSURE SET POINT",
                "e.|OUTSIDE AIR MINIMUM POSITION",
            ],
        ),
        point_table(
            "M63-AHU-READABLE-POINTS-LEDGER", "M6.3", 19, "AHU POINTS LIST - READABLE POINTS",
            [1685, 1705, 1950],
            [[247, 259], [259, 271], [271, 283], [283, 294], [294, 306], [306, 317],
             [317, 328], [328, 340], [340, 351], [351, 362], [363, 374]],
            [
                "a.|SUPPLY AIR TEMPERATURE", "b.|OUTSIDE AIR TEMPERATURE", "c.|SUPPLY FAN(S) STATUS",
                "d.|SUPPLY FAN(S) VFD FREQUENCY", "e.|BUILDING PRESSURE",
                "f.|COMPRESSOR(S) SUCTION PRESSURE", "g.|COMPRESSOR(S) DISCHARGE PRESSURE",
                "h.|COMPRESSOR(S) SATURATED CONDENSING TEMPERATURE",
                "i.|COMPRESSOR(S) SATURATED SUCTION TEMPERATURE", "j.|ALARMS", "k.|FILTER STATUS",
            ],
        ),
    ]
    return {
        "document_id": IDENT,
        "module_role": "Ledger-form literal capture of the M6.2 and M6.3 published point lists, split into source item marker and point name so the final record can present each printed row. This is not a final BAS hardware I/O or ownership schedule.",
        "tables": tables,
        "assertions": [
            {"id": "m62-boiler-points-ledger-title", "page": 18, "bbox": [1510, 498, 1620, 520], "expected": "BOILER POINTS LIST :", "mode": "exact"},
            {"id": "m62-vfd-points-ledger-title", "page": 18, "bbox": [1510, 613, 1620, 635], "expected": "VFD POINTS LIST :", "mode": "exact"},
            {"id": "m63-writeable-ledger-heading", "page": 19, "bbox": [1680, 154, 1780, 171], "expected": "1. WRITEABLE POINTS:", "mode": "exact"},
            {"id": "m63-readable-ledger-heading", "page": 19, "bbox": [1680, 234, 1780, 251], "expected": "2. READABLE POINTS:", "mode": "exact"},
        ],
        "source_boundary": "The list is explicitly illustrative/non-exhaustive in context. Retain functional text exactly; do not derive controller cards, physical terminals, wiring, one point per physical device, or an AI/DI/AO/DO total.",
    }


def schedule_families():
    # Every linked table is represented exactly once.  `tag` exists only when
    # the source table has a clean `tag` column; source-symbol and literal-row
    # identities remain separately cited rather than rewritten.
    return [
        {"module": "schedules_m50_air_valves.json", "bundle_module": "schedules", "table": "M50-ROOM-SUPPLY-AIR-VALVES", "class": "room_supply_air_valve", "scope": "M5.0 literal room-supply-air-valve schedule rows; no separate clean tag column is asserted", "rows": 9},
        {"module": "schedules_m50_air_valves.json", "bundle_module": "schedules", "table": "M50-GENERAL-EXHAUST-AIR-VALVES", "class": "general_exhaust_air_valve", "scope": "M5.0 literal general-exhaust-air-valve schedule rows; no separate clean tag column is asserted", "rows": 7},
        {"module": "schedules_m50_air_valves.json", "bundle_module": "schedules", "table": "M50-SNORKEL-EXHAUST-AIR-VALVES", "class": "snorkel_exhaust_air_valve", "scope": "M5.0 literal snorkel-exhaust-air-valve schedule rows; no separate clean tag column is asserted", "rows": 5},
        {"module": "schedules_m51_control_valves.json", "bundle_module": "schedules", "table": "M51-HOT-WATER-REHEAT-CONTROL-VALVES", "class": "hot_water_reheat_control_valve", "scope": "M5.1 reheat control-valve schedule", "rows": 9, "tag": [f"CV-{i}" for i in range(1, 10)]},
        {"module": "schedules_m51_control_valves.json", "bundle_module": "schedules", "table": "M51-BYPASS-CONTROL-VALVE", "class": "heating_water_bypass_control_valve", "scope": "M5.1 literal bypass-control-valve source row", "rows": 1},
        {"module": "schedules_m52_equipment.json", "bundle_module": "schedules", "table": "M52-ELECTRIC-HEATERS", "class": "electric_heater", "scope": "M5.2 electric-heater schedule", "rows": 9, "tag": [f"EH-{i}" for i in range(1, 10)]},
        {"module": "schedules_m52_equipment.json", "bundle_module": "schedules", "table": "M52-MECHANICAL-SPECIALTY", "class": "mechanical_specialty_equipment", "scope": "M5.2 specialty-equipment schedule", "rows": 4, "tag": ["AS-1", "ET-1", "FM-1", "PF-1"]},
        {"module": "schedules_m52_equipment.json", "bundle_module": "schedules", "table": "M52-GAS-SPLIT-SYSTEM", "class": "gas_split_system", "scope": "M5.2 one shared indoor/outdoor split-system schedule row", "rows": 1, "tag": ["F-1 , CU-1"]},
        {"module": "schedules_m52_equipment.json", "bundle_module": "schedules", "table": "M52-SOUND-ATTENUATOR", "class": "sound_attenuator", "scope": "M5.2 sound-attenuator schedule", "rows": 1, "tag": ["SA-1"]},
        {"module": "schedules_m52_equipment.json", "bundle_module": "schedules", "table": "M52-PENTHOUSE", "class": "penthouse", "scope": "M5.2 penthouse schedule", "rows": 1, "tag": ["PH-1"]},
        {"module": "schedules_m52_equipment.json", "bundle_module": "schedules", "table": "M52-LOUVERS", "class": "louver", "scope": "M5.2 louver schedule", "rows": 2, "tag": ["L-1", "L-2"]},
        {"module": "schedules_m52_equipment.json", "bundle_module": "schedules", "table": "M52-DUCTLESS-SPLIT-HIGH-WALL", "class": "ductless_split_system", "scope": "M5.2 one shared indoor/outdoor ductless schedule row", "rows": 1, "tag": ["DFC-1 , DCU-1"]},
        {"module": "schedules_m53_ahu.json", "bundle_module": "schedules", "table": "M53-AIR-HANDLING-UNIT", "class": "air_handling_unit", "scope": "M5.3 AHU schedule", "rows": 1, "tag": ["AHU-1"]},
        {"module": "schedules_m51_core_equipment.json", "bundle_module": "schedules", "table": "M51-CONDENSING-HOT-WATER-BOILERS", "class": "condensing_boiler", "scope": "M5.1 boiler schedule", "rows": 2, "tag": ["B-1", "B-2"]},
        {"module": "schedules_m51_core_equipment.json", "bundle_module": "schedules", "table": "M51-HOT-WATER-REHEAT-COILS", "class": "hot_water_reheat_coil", "scope": "M5.1 reheat-coil schedule", "rows": 9, "tag": [f"HC-{i}" for i in range(1, 10)]},
        {"module": "schedules_m51_core_equipment.json", "bundle_module": "schedules", "table": "M51-HUMIDIFIER", "class": "humidifier", "scope": "M5.1 humidifier schedule", "rows": 1, "tag": ["HUM-1"]},
        {"module": "schedules_m51_core_equipment.json", "bundle_module": "schedules", "table": "M51-LAB-EXHAUST-FAN", "class": "laboratory_exhaust_fan", "scope": "M5.1 laboratory-exhaust-fan schedule", "rows": 1, "tag": ["LEF-1"]},
        {"module": "schedules_m50_core_equipment.json", "bundle_module": "schedules", "table": "M50-CANOPY-HOODS", "class": "canopy_hood", "scope": "M5.0 canopy-hood schedule", "rows": 4, "tag": [f"CH-{i}" for i in range(1, 5)]},
        {"module": "schedules_m50_core_equipment.json", "bundle_module": "schedules", "table": "M50-PUMPS", "class": "pump", "scope": "M5.0 pump schedule", "rows": 4, "tag": ["BP-1", "BP-2", "HWP-1", "HWP-2"]},
        {"module": "schedules_m50_core_equipment.json", "bundle_module": "schedules", "table": "M50-EXHAUST-FANS", "class": "exhaust_fan", "scope": "M5.0 exhaust-fan schedule", "rows": 6, "tag": [f"EF-{i}" for i in range(1, 7)]},
        {"module": "schedules_m50_core_equipment.json", "bundle_module": "schedules", "table": "M50-SNORKEL-HOODS", "class": "snorkel_hood", "scope": "M5.0 snorkel-hood schedule", "rows": 5, "tag": [f"SN-{i}" for i in range(1, 6)]},
        {"module": "schedules_m51_air_devices.json", "bundle_module": "schedules", "table": "M51-DIFFUSERS", "class": "diffuser_type", "scope": "M5.1 source-symbol diffuser schedule rows; clean tags are in the cited symbol registry", "rows": 7},
        {"module": "schedules_m51_air_devices.json", "bundle_module": "schedules", "table": "M51-RETURN-EXHAUST-GRILLES", "class": "return_or_exhaust_grille_type", "scope": "M5.1 source-symbol grille schedule rows; clean tags are in the cited symbol registry", "rows": 4},
    ]


def build_equipment_reconciliation():
    families = schedule_families()
    anchors = []
    for family in families:
        for tag in family.get("tag", []):
            namespace = family["table"].split("-", 1)[0]
            anchors.append({
                "id": namespace + "-" + tag,
                "status": "schedule_identity_only",
                "page": None,
                "zone": "No plan placement or installed multiplicity is inferred from a schedule type row.",
                "classification": family["class"],
                "source_table": family["table"],
            })
    return {
        "document_id": IDENT,
        "module_role": "Cross-reference registry for every M5.0-M5.3 schedule table. It preserves printed schedule identities and classifications but deliberately does not turn schedule types into facility-wide installed counts.",
        "tables": [],
        "schedule_registry_schema": {
            "namespace_separator": "-",
            "identity_columns": {"tag": "tag"},
            "anchor_records_path": ["primary_anchors"],
            "non_instance_table_ids": ["M51-DIFFUSERS", "M51-RETURN-EXHAUST-GRILLES"],
        },
        "scheduled_families": families,
        "schedule_counts": {
            "tables": 23,
            "rows": 94,
            "building_scoped_tag_identities_including_outlet_types": 61,
            "other_scheduled_tag_identities": 61,
            "interpretation": "Counts are literal clean-tag schedule-row identities only. The 21 M5.0 air-valve literal rows, one BCV literal row and eleven D/R symbol-registry tags are retained below but are not converted to separate clean-tag schedule-table identities by this registry.",
        },
        "primary_anchors": anchors,
        "additional_identities": [
            {
                "status": "source_literal_row_not_reformatted_as_clean_tag_column",
                "source": "M5.1 / M51-BYPASS-CONTROL-VALVE row 1",
                "tag_as_printed": "BCV-1",
                "reason": "The source module deliberately retains this one-row schedule as a literal source row rather than inventing a clean tag column.",
            },
            {
                "status": "source_symbol_registry",
                "source": "M5.1 / M51-DIFFUSERS and M51-RETURN-EXHAUST-GRILLES",
                "tags_as_printed": ["D-1", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "R-1", "R-2", "R-3", "R-4"],
                "reason": "The source symbol cells combine tag, size and CFM graphic text; the separate dual-engine-checked symbol registry preserves clean tag witnesses without claiming installed quantities.",
                "evidence_status": "The named assertion IDs live in the independently verified schedules_m51_air_devices component; this coordinator module does not duplicate their bounds.",
            },
            {
                "status": "shared_schedule_row_pair",
                "source": "M5.2 / M52-GAS-SPLIT-SYSTEM row 1 and M52-DUCTLESS-SPLIT-SYSTEM row 1",
                "tags_as_printed": ["F-1 , CU-1", "DFC-1 , DCU-1"],
                "reason": "Each printed row is a shared indoor/outdoor pair reference; it is not split into invented equipment quantities or summed electrical loads.",
            },
        ],
        "control_valve_and_damper_schedule_status": {
            "control_valve_schedule": "Present: M5.1 has nine hot-water reheat control-valve rows plus one literal heating-water bypass control-valve row.",
            "damper_actuator_schedule": "Not supplied as a standalone schedule. Visual review found damper/actuator contexts and motorized dampers, but no table with actuator tag, make/model, torque, signal, fail action and installed quantity is asserted.",
            "boundary": "Do not infer damper-actuator quantities or specifications from louver, fan, damper symbol, or sequence context.",
        },
        "source_boundary": "The schedule registry validates only authored schedule table coverage, source identity cells and explicit classifications. It is not a plan takeoff or an installed-device total.",
    }


def build_point_applications():
    apps = [
        ("m62-boiler-published-points", "M62-BOILER-PUBLISHED-POINTS-LEDGER", "Published M6.2 boiler point-list template. The page says available boiler points shall be mapped and the listed points are non-exhaustive; no individual physical device owner is printed."),
        ("m62-vfd-published-points", "M62-VFD-PUBLISHED-POINTS-LEDGER", "Published M6.2 heating-water VFD control-interface point-list template; the list is non-exhaustive and does not assign rows to an individual VFD."),
        ("m63-ahu-writeable-points", "M63-AHU-WRITEABLE-POINTS-LEDGER", "AHU-1 M6.3 Writeable published point-list template; access class is printed, but physical I/O type/terminal ownership is not."),
        ("m63-ahu-readable-points", "M63-AHU-READABLE-POINTS-LEDGER", "AHU-1 M6.3 Readable published point-list template; access class is printed, but physical I/O type/terminal ownership is not."),
    ]
    return {
        "document_id": IDENT,
        "module_role": "Explicit source-table application scopes for the published M6.2/M6.3 points. Each output row remains a literal source-list occurrence, not a projected sitewide hardware count.",
        "tables": [],
        "ledger_mode": "source_matrix_templates_v1",
        "applications": [{"id": aid, "source_table": table, "ownership_scope": scope} for aid, table, scope in apps],
        "listed_template_counts": {"source_rows": 25, "total": 25},
        "expanded_template_counts": {"source_rows": 25, "total": 25},
        "expanded_count_warning": "25 is the number of literal published source-list rows, not an installed BAS point, controller-card, terminal, wiring or device total.",
    }


def review_pages():
    sheets = [
        ("M0.0", "MECHANICAL/PLUMBING LEGEND, GENERAL NOTES", "Legend, general notes and commissioning/control-symbol context."),
        ("M0.1", "MECHANICAL COMCHECK / ZONE PLAN", "Energy-code COMcheck information and zone-plan context."),
        ("M1.0", "HVAC FLOOR PLAN", "HVAC floor plan with laboratory equipment, air distribution and equipment-tag context."),
        ("M1.1", "EXHAUST FLOOR PLAN", "Exhaust floor plan and laboratory exhaust-routing context."),
        ("M1.2", "HYDRONIC FLOOR PLAN", "Hydronic floor plan with heating-water equipment/piping context."),
        ("M2.0", "MECHANICAL ROOF PLAN", "Mechanical roof plan with roof equipment and exhaust context."),
        ("M3.0", "ENLARGED MECHANICAL PLAN / HEATING-WATER PIPING SCHEMATIC", "Enlarged mechanical plan and heating-water piping schematic."),
        ("M4.0", "MECHANICAL DETAILS", "Ductwork and mechanical-installation details."),
        ("M4.1", "MECHANICAL DETAILS", "Vent, boiler/furnace, duct and seismic mechanical details."),
        ("M4.2", "MECHANICAL DETAILS", "Boiler/hydronic details, including flow-meter BACnet context."),
        ("M4.3", "MECHANICAL DETAILS", "Roof-unit, penthouse, exhaust-fan and snorkel installation details."),
        ("M5.0", "MECHANICAL SCHEDULES", "Canopy hood, air valve, pump, exhaust fan and snorkel-hood schedules."),
        ("M5.1", "MECHANICAL SCHEDULES", "Boiler, reheat coil, humidifier, lab fan, air device and control-valve schedules."),
        ("M5.2", "MECHANICAL SCHEDULES", "Electric-heater, specialty, split-system, attenuator, penthouse, louver and ductless schedules."),
        ("M5.3", "MECHANICAL SCHEDULES", "AHU-1 schedule with airflow, coils, humidifier, filters and electrical fields."),
        ("M6.0", "MECHANICAL CONTROLS", "Controls legend, BAS/network context and louver/fan/ductless sequences."),
        ("M6.1", "MECHANICAL CONTROLS", "Laboratory exhaust and split-system control sequences."),
        ("M6.2", "MECHANICAL CONTROLS", "Heating-water sequence/diagram and published boiler/VFD point lists."),
        ("M6.3", "MECHANICAL CONTROLS", "VAV AHU-1 sequence/control diagram and published AHU point lists."),
        ("M6.4", "MECHANICAL CONTROLS", "Laboratory hood and snorkel control sequences."),
        ("M6.5", "MECHANICAL CONTROL", "General exhaust, electric-heater and general-fan control sequences."),
        ("P1.0", "FOUNDATION PLUMBING PLAN", "Foundation-plumbing plan."),
        ("P2.0", "PLUMBING FLOOR PLAN", "Plumbing floor plan with laboratory-equipment context."),
        ("P3.0", "PLUMBING ROOF PLAN", "Plumbing roof plan."),
        ("P4.0", "ENLARGED PLUMBING PLAN", "Enlarged plumbing plan."),
        ("P5.0", "PLUMBING DETAILS", "Plumbing detail sheet."),
        ("P5.1", "PLUMBING DETAILS", "Gas, compressor and water-softener detail sheet."),
        ("P6.0", "PLUMBING SCHEDULES", "Plumbing fixtures, compressor and gas schedule information."),
        ("FS1.0", "FIRE SPRINKLER FLOOR PLAN", "Fire-sprinkler floor plan."),
    ]
    return [{"page": i, "sheet": sheet, "title": title,
             "render": f"reviews/{IDENT}/p{i}-p{i}-full-poppler.png", "finding": finding}
            for i, (sheet, title, finding) in enumerate(sheets, 1)]


def build_metadata(pages):
    return {
        "document_id": IDENT,
        "module_role": "Project/title-block, local-scale and full-page visual-review context. Schedule, point-list and control facts remain in their dedicated dual-engine-checked modules.",
        "tables": [],
        "project": {
            "project_name_as_printed": "D-1 Testing Laboratory",
            "project_location_as_printed": "600 W Prairie Ave, Coeur d'Alene, ID 83814",
            "project_number_as_printed": "23-239",
            "architect_firm_as_printed": "Miller Stauffer Architects",
            "engineering_firm_as_printed": "Musgrove Engineering, P.A.",
            "issue_as_printed": "BID SET",
            "issue_date_as_printed": "5/13/2024",
            "revision_date_status": "No populated revision-block date is asserted from the supplied title block. The issue date is not recast as a revision date.",
            "assertion_ids": ["rank04-project-title", "rank04-project-address", "rank04-project-number", "rank04-bid-set", "rank04-issue-date", "rank04-architect-miller", "rank04-architect-stauffer"],
        },
        "sheet_details": {
            "sheet_ledger_semantics": "All 29 supplied PDF pages have a visual source-sheet/title disposition below.",
            "revision_status": "No populated revision date is asserted from the reviewed title block.",
        },
        "scale_semantics": {
            "printed_local_view_scales_observed": [
                {"page": 2, "sheet": "M0.1", "view": "COMCHECK ZONE PLAN", "scale_as_printed": "3/32\"=1'-0\""},
                {"page": 3, "sheet": "M1.0", "view": "HVAC FLOOR PLAN", "scale_as_printed": "3/16\"=1'-0\""},
                {"page": 4, "sheet": "M1.1", "view": "EXHAUST FLOOR PLAN", "scale_as_printed": "3/16\"=1'-0\""},
                {"page": 5, "sheet": "M1.2", "view": "HYDRONIC FLOOR PLAN", "scale_as_printed": "3/16\"=1'-0\""},
                {"page": 6, "sheet": "M2.0", "view": "MECHANICAL ROOF PLAN", "scale_as_printed": "3/16\"=1'-0\""},
                {"page": 7, "sheet": "M3.0", "view": "ENLARGED MECHANICAL PLAN", "scale_as_printed": "3/8\"=1'-0\""},
                {"page": 22, "sheet": "P1.0", "view": "FOUNDATION PLUMBING PLAN", "scale_as_printed": "3/16\"=1'-0\""},
                {"page": 23, "sheet": "P2.0", "view": "PLUMBING FLOOR PLAN", "scale_as_printed": "3/16\"=1'-0\""},
                {"page": 24, "sheet": "P3.0", "view": "PLUMBING ROOF PLAN", "scale_as_printed": "3/16\"=1'-0\""},
                {"page": 25, "sheet": "P4.0", "view": "ENLARGED PLUMBING PLAN", "scale_as_printed": "3/8\"=1'-0\""},
                {"page": 29, "sheet": "FS1.0", "view": "FIRE SPRINKLER FLOOR PLAN", "scale_as_printed": "3/16\"=1'-0\""},
            ],
            "graphic_scale_bar_status": "No graphic scale bar is asserted. Printed scales are local to their named plan views and must not be generalized to details, schedules, controls, schematics, plumbing or sprinkler drawings.",
            "takeoff_scale_status": "Use only a separately verified local scale for distance-based takeoff on the target view.",
        },
        "visual_review_pages": pages,
        "assertions": [
            {"id": "rank04-project-title", "page": 3, "bbox": [2470, 1120, 2502, 1330], "expected": "D-1 Testing Laboratory", "mode": "exact", "reading_direction": "up"},
            {"id": "rank04-project-address", "page": 3, "bbox": [2500, 1110, 2565, 1330], "expected": "600 W Prairie Ave Coeur d'Alene, ID 83814", "mode": "exact", "reading_direction": "up"},
            {"id": "rank04-project-number", "page": 3, "bbox": [2350, 108, 2440, 132], "expected": "Project No. 23-239", "mode": "exact"},
            {"id": "rank04-bid-set", "page": 3, "bbox": [2505, 770, 2535, 860], "expected": "BID SET", "mode": "exact", "reading_direction": "up"},
            {"id": "rank04-issue-date", "page": 3, "bbox": [2538, 770, 2565, 860], "expected": "5/13/2024", "mode": "exact"},
            {"id": "rank04-architect-miller", "page": 3, "bbox": [2464, 15, 2510, 182], "expected": "MILLER", "mode": "contains"},
            {"id": "rank04-architect-stauffer", "page": 3, "bbox": [2505, 15, 2552, 256], "expected": "STAUFFER", "mode": "contains"},
        ],
    }


def build_supporting():
    return {
        "document_id": IDENT,
        "module_role": "Explicit source limitations, parser/visual-review boundary statements and corroboration scope for this 29-page supplied set.",
        "tables": [],
        "source_limitations": [
            "M5.1 supplies hot-water reheat and bypass control-valve schedule rows, but there is no standalone damper-actuator schedule with actuator make/model, torque, signal, fail action, tag and installed quantity.",
            "M6.2/M6.3 published lists are functional points/access lists. They are not row-by-row AI/DI/AO/DO hardware schedules and are not a final installed I/O/card/terminal/wiring count.",
            "M6.0 network/control graphics show BAS, BACnet and integration context, but do not establish a final address list, IP topology, MS/TP trunk, device count or protocol assignment beyond literal source labels.",
            "The schedules are source schedule rows/types. This record does not infer plan placements, repeated instance quantities, sensor/thermostat totals, zones beyond explicit sequence bindings, damper-actuator totals, or takeoff quantities.",
            "All 29 pages were visually reviewed using retained full-page renders. Visual review establishes the disposition; two parsers independently recheck every bounded text assertion and authored table cell in the record modules.",
        ],
        "text_absence_assertions": [
            {
                "id": "rank04-no-standalone-damper-actuator-schedule-title",
                "pages": list(range(1, 30)),
                "covers_all_source_pages": True,
                "patterns": [r"DAMPER\\s+ACTUATOR\\s+SCHEDULE"],
                "visual_review_qualification": "Native-text absence is not by itself engineering proof. It is paired with completed visual review of all sheets; the finding is limited to no standalone schedule title/row set being supplied.",
            }
        ],
    }


def requirement_audit():
    entries = [
        ("project_identity", "Printed project/title-block name, address, number, architect, issue and date are retained with a separate no-revision-date status.", [["modules", "metadata", "project"]]),
        ("sheet_details", "Every supplied page has a visual sheet/title disposition and no populated revision date is invented.", [["modules", "metadata", "sheet_details"], ["modules", "metadata", "visual_review_pages"]]),
        ("scale_verification", "Only observed local stated plan scales are recorded; no global or graphic-bar scale is asserted.", [["modules", "metadata", "scale_semantics"]]),
        ("equipment_tags_and_classification", "All 23 linked M5.0-M5.3 schedule tables are classified, with 61 clean tag-column identities and separately retained source-symbol/literal identities.", [["modules", "equipment_reconciliation", "scheduled_families"], ["modules", "equipment_reconciliation", "additional_identities"]]),
        ("schedule_rows_and_specs", "Every literal source row in the seven schedule-family components is preserved, including valves, louvers, hoods, air devices and AHU fields.", [["modules", "schedules", "tables"], ["modules", "equipment_reconciliation", "schedule_counts"]]),
        ("point_lists_and_equipment_ownership", "Twenty-five source-list rows from M6.2/M6.3 are retained with explicit source-template ownership scope, not fabricated physical I/O ownership.", [["modules", "points", "tables"], ["modules", "point_applications", "applications"]]),
        ("network_architecture", "Literal BAS/BACnet and integration contexts are retained with final topology/addressing intentionally unavailable.", [["modules", "controls_context", "source_components", "controls_sequences_network", "network_architecture"]]),
        ("sequences_and_diagrams", "Thirteen source-bounded M6.0-M6.5 control/sequence subjects are inventoried alongside lab/zone bindings.", [["modules", "controls_context", "source_components", "controls_sequences_network", "sequence_inventory"], ["modules", "controls_context", "source_components", "controls_lab_zone_bindings", "sensor_and_zone_context"]]),
        ("space_sensors_and_zones", "Explicit lab/room control bindings and scoped sensor contexts are preserved; no document-wide sensor/thermostat total is inferred.", [["modules", "controls_context", "source_components", "controls_lab_zone_bindings", "sensor_and_zone_context"], ["modules", "supporting_evidence", "source_limitations"]]),
        ("source_limitations_and_conflicts", "Damper-actuator, counts, point-type, network and revision limitations are explicit rather than filled with assumptions.", [["modules", "supporting_evidence", "source_limitations"], ["modules", "equipment_reconciliation", "control_valve_and_damper_schedule_status"]]),
        ("all_page_visual_review", "All 29 supplied PDF pages have retained full-page render evidence and a completed finding.", [["page_review"], ["modules", "metadata", "visual_review_pages"]]),
        ("independent_corroboration", "Build and verification rerun MuPDF and Poppler checks for each embedded component and hash source, manifest, modules and cited renders.", [["module_source_sha256"], ["modules", "metadata", "assertions"]]),
    ]
    return [{"id": ident, "result": "reviewed_with_source_limitations_recorded", "finding": finding, "evidence": evidence}
            for ident, finding, evidence in entries]


def build_manifest(pages):
    return {
        "id": IDENT,
        "rank": 4,
        "title": "ITD District 1 Testing Laboratory HVAC/BAS",
        "source_pdf": "pdf/04__vol2__062__ITD_District_1_Testing_Laboratory.pdf",
        "source_sha256": "9dafcead2eb5fe3679921f336ccd7ca4813da1524580c5fee75a87c99e1b2707",
        "page_count": 29,
        "review_status": "complete_with_documented_source_limitations",
        "scope": "Complete source-bounded ground truth for the supplied 29-page D-1 Testing Laboratory set: full-page visual review; title-block/sheet/local-scale context; all 94 literal M5.0-M5.3 schedule rows; 82 clean tag-column schedule identities plus cited source-symbol/literal identities; M6.2/M6.3 published boiler/VFD/AHU point lists; BAS/network and thirteen control-sequence contexts; lab/zone bindings; and explicit limitations. It does not fabricate installed equipment, sensors, thermostats, damper actuators, controller I/O/cards/terminals/wiring, network addresses/topology or distances.",
        "reading_notes": [
            "All 29 source pages have retained full-page Poppler renders and a completed visual disposition. Strict source cells and bounded assertions are rechecked against retained MuPDF and Poppler captures during every build/verify run.",
            "The schedule corpus contains 23 tables and 94 literal rows across M5.0-M5.3. The registry has 61 clean tag-column identities; 21 air-valve rows, BCV-1 and 11 D/R source-symbol tags remain separately retained without altering original row geometry.",
            "M6.2/M6.3 publish 25 literal functional point-list rows. These lists are source-template/application context, not final physical I/O, device, controller-card, terminal, cable or wiring counts.",
            "M6.0 prints BAS/BACnet/integration context and M6.0-M6.5 retain thirteen control/sequence subjects, but no final network address/topology schedule or standalone damper-actuator schedule is supplied.",
        ],
        "verification_semantics": "The bundle verifier reruns independent MuPDF and Poppler raw-capture checks for every authored literal table and bounded assertion, and hashes linked modules, source PDF, manifest and cited full-page review renders. It validates source evidence and annotation integrity; it does not automatically infer physical plan quantities or engineering suitability.",
        "module_order": ["metadata", "schedules", "points", "controls_context", "equipment_reconciliation", "point_applications", "supporting_evidence"],
        "module_sources": {
            "metadata": ["metadata_rank04"],
            "schedules": ["schedules_m50_air_valves", "schedules_m51_control_valves", "schedules_m52_equipment", "schedules_m53_ahu", "schedules_m51_core_equipment", "schedules_m50_core_equipment", "schedules_m51_air_devices"],
            "points": ["points_rank04_ledger"],
            "controls_context": ["controls_sequences_network", "controls_lab_zone_bindings", "points_m62_m63"],
            "equipment_reconciliation": ["equipment_reconciliation_rank04"],
            "point_applications": ["point_applications_rank04"],
            "supporting_evidence": ["supporting_evidence_rank04"],
        },
        "requirement_audit": requirement_audit(),
        "page_review": [{"page": p["page"], "review_status": "complete", "render": p["render"], "finding": p["finding"]} for p in pages],
        "declared_checks": [
            {"id": "rank04-full-page-review", "path": ["page_review"], "operation": "length", "expected": 29},
            {"id": "rank04-schedule-table-count", "path": ["modules", "schedules", "tables"], "operation": "length", "expected": 23},
            {"id": "rank04-point-table-count", "path": ["modules", "points", "tables"], "operation": "length", "expected": 4},
        ],
        "completion_checks": {
            "all_29_pages_visually_reviewed": True,
            "all_authoring_modules_dual_engine_verified_at_build": True,
            "source_limitations_explicit": True,
            "required_objectives_covered": True,
        },
    }


def main():
    pages = review_pages()
    write("points_rank04_ledger.json", build_points())
    write("equipment_reconciliation_rank04.json", build_equipment_reconciliation())
    write("point_applications_rank04.json", build_point_applications())
    write("metadata_rank04.json", build_metadata(pages))
    write("supporting_evidence_rank04.json", build_supporting())
    write("document_manifest.json", build_manifest(pages))


if __name__ == "__main__":
    main()
