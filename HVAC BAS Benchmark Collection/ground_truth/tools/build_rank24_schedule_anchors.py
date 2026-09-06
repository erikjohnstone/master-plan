"""Build pre-authored rank-24 schedule-tag anchor modules from retained raw words.

This helper does not discover a schedule or choose tags.  Its fixed table
configuration was authored from M7.1-M7.3 visual review; it only obtains the
coordinate bounds for those declared literal marks.  The resulting modules are
then rechecked against both MuPDF and Poppler by verify_tables.py.
"""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "24__vol2__019"


def table(page, ident, title, classification, tags, x, y):
    words = json.loads((AUDIT / "evidence" / IDENT / "mupdf" / f"{page:04d}.json").read_text())["words"]
    expected = set(tags)
    selected = [word for word in words if word["text"] in expected
                and x[0] <= (word["bbox"][0] + word["bbox"][2]) / 2 <= x[1]
                and y[0] <= (word["bbox"][1] + word["bbox"][3]) / 2 <= y[1]]
    found = [word["text"] for word in selected]
    if sorted(found) != sorted(tags) or len(found) != len(tags):
        raise ValueError(f"{ident}: fixed expected marks do not match source bounds: {found}")
    selected.sort(key=lambda word: (word["bbox"][1] + word["bbox"][3]) / 2)
    centers = [(word["bbox"][1] + word["bbox"][3]) / 2 for word in selected]
    if len(centers) == 1:
        ys = [[centers[0] - 8, centers[0] + 8]]
    else:
        mids = [(left + right) / 2 for left, right in zip(centers, centers[1:])]
        ys = [[centers[0] - (mids[0] - centers[0]), mids[0]]]
        ys.extend([[mids[index - 1], mids[index]] for index in range(1, len(mids))])
        ys.append([mids[-1], centers[-1] + (centers[-1] - mids[-1])])
    xmin = min(word["bbox"][0] for word in selected) - 5
    xmax = max(word["bbox"][2] for word in selected) + 5
    return {
        "id": ident, "page": page, "sheet": {14: "M7.1", 15: "M7.2", 16: "M7.3"}[page],
        "title": title, "classification": classification, "columns": "mark",
        "x_edges": [round(xmin, 3), round(xmax, 3)],
        "y_ranges": [[round(a, 3), round(b, 3)] for a, b in ys],
        "rows": [word["text"] for word in selected],
    }


def detail_table(page, ident, title, classification, marks, x_edges, y):
    """Serialize fixed, visually reviewed M7.3 row/column cells.

    The supplied marks, cell boundaries and column order are declared below;
    this routine does not detect tables or synthesize values.  It only copies
    the already-declared literal cell text, which the normal verifier then
    checks against both retained extraction engines.
    """
    anchor = table(page, ident + "-ANCHORS", title, classification, marks,
                   (x_edges[0], x_edges[1]), y)
    source = json.loads((AUDIT / "evidence" / IDENT / "mupdf" / f"{page:04d}.json").read_text())["words"]
    rows = []
    for y0, y1 in anchor["y_ranges"]:
        cells = []
        for left, right in zip(x_edges, x_edges[1:]):
            words = [word for word in source
                     if left <= (word["bbox"][0] + word["bbox"][2]) / 2 <= right
                     and y0 <= (word["bbox"][1] + word["bbox"][3]) / 2 <= y1]
            words.sort(key=lambda word: word["bbox"][0])
            cells.append(" ".join(word["text"] for word in words))
        rows.append("|".join(cells))
    if any(not cell for row in rows for cell in row.split("|")):
        raise ValueError(f"{ident}: fixed source cell boundary produced an empty cell")
    return {
        "id": ident, "page": page, "sheet": {14: "M7.1", 15: "M7.2", 16: "M7.3"}[page],
        "title": title, "classification": classification,
        "columns": "mark|inlet_diameter|minimum_airflow_cfm|maximum_airflow_cfm|radiated_sound_nc|discharge_sound_nc|min_inlet_sp_iwg|max_air_pd_iwg|entering_air_temp_f|leaving_air_temp_f|entering_water_temp_f|leaving_water_temp_f|sensible_capacity_btuh|flow_gpm|pipe_connection_in|max_water_pd_ft_h2o|manufacturer|model",
        "x_edges": x_edges,
        "y_ranges": anchor["y_ranges"],
        "rows": rows,
    }


def write(name, role, page, tables, details):
    payload = {
        "document_id": IDENT,
        "module_role": role,
        "source_sheet": {14: "M7.1", 15: "M7.2", 16: "M7.3"}[page],
        "source_page": page,
        "tables": tables,
        "schedule_detail_records": details,
        "tables_note": "Every listed mark is a literal schedule identity anchored to its own bounded word cell. A schedule mark is not silently multiplied into plan placements, actuator counts, controller terminals or field-I/O counts.",
        "assertions": [],
        "inventory_checks": [{"id": f"{name}-families", "records_path": ["tables"], "expected": len(tables), "unique_key": "id"}],
    }
    target = AUDIT / "work" / IDENT / f"{name}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2) + "\n")


def main():
    m71 = [
        table(14, "M71-AHU", "AIR HANDLING UNIT SCHEDULE", "scheduled air-handling unit", ["AHU-1"], (1080, 1150), (150, 190)),
        table(14, "M71-AHU-FANS", "AIR HANDLING UNIT FAN SCHEDULE", "scheduled AHU supply/relief fan", ["RF-1", "RF-2", "SF-1", "SF-2"], (1420, 1490), (350, 440)),
        table(14, "M71-CHILLER", "CHILLER SCHEDULE (ELECTRIC AIR-COOLED)", "scheduled air-cooled chiller", ["CH-1"], (440, 500), (750, 805)),
        table(14, "M71-BOILER", "HOT WATER CONDENSING BOILER SCHEDULE", "scheduled condensing boiler", ["B-1", "B-2"], (1210, 1270), (975, 1045)),
        table(14, "M71-PUMP", "PUMP SCHEDULE", "scheduled pump", ["CP-1", "CP-2", "CP-3", "CP-4", "CP-5", "CP-6", "CWP-1", "CWP-2", "HWP-1", "HWP-2", "HWRP-1"], (455, 540), (1135, 1325)),
        table(14, "M71-GENERAL-FAN", "GENERAL FAN SCHEDULE", "scheduled exhaust fan", ["EF-1", "EF-2", "EF-3", "EF-4"], (410, 475), (1465, 1565)),
        table(14, "M71-AIR-SEPARATOR", "AIR SEPARATOR SCHEDULE", "scheduled air separator", ["AS-1", "AS-2"], (1770, 1840), (1685, 1740)),
    ]
    write("schedules_m71", "M7.1 schedule-tag registry for AHU-1, its supply/relief fans, plant equipment, general fans and air separators. It carries concise literal performance summaries while retaining the source table rows as the authoritative schedule identity anchors.", 14, m71, {
        "AHU-1": "MECH ROOM AHU; 20,150 CFM minimum supply/25,000 CFM design supply/6,500 CFM minimum outside air/21,000 CFM design return air; two supply and two relief fans; HWC/CHWC; air-to-air energy-recovery wheel; Daikin CAC/CAH.",
        "CH-1": "UTILITY ENCLOSURE air-cooled R410A chiller; 110 tons minimum net cooling, 54/44 F water, 271 GPM design water flow, two passes, 9.20 ft H2O water-side maximum pressure drop, 460 V three phase.",
        "B-1_and_B-2": "MECHANICAL ROOM condensing boilers: 750 MBH input each, 92% minimum efficiency at 25% firing rate, 42.50 GPM design flow, 110/140 F entering/leaving water, 750 MBH natural gas, 120 V one phase.",
        "pumps": "The M7.1 pump schedule contains six condensate pumps CP-1 through CP-6, CWP-1/CWP-2 chilled-water centrifugal pumps, HWP-1/HWP-2 heating-water centrifugal pumps, and HWRP-1 AHU-1 heating-water return pump. All rows retain literal schedule marks; numerical values remain source-table scoped.",
        "fans_and_separators": "EF-1 through EF-4 are scheduled general exhaust fans. AS-1 chilled-water and AS-2 heating-hot-water are flanged in-line air separators; the source prints 271 GPM and 85 GPM respectively, each with 5 ft w.c. maximum pressure drop."
    })

    m72 = [
        table(15, "M72-GRD", "GRILLE, REGISTER, AND DIFFUSER SCHEDULE", "scheduled air device", ["S1-1", "S1-2", "S1-3", "S1-4", "S3-1", "S2-1", "S2-2", "S2-4", "S2-5", "S2-6", "S2-7", "S4-1", "R1-1", "R1-2", "R1-3", "R1-4", "R1-5", "R3-1", "R3-2", "R3-3", "E1-1", "E1-2", "E1-3"], (1570, 1640), (120, 485)),
        table(15, "M72-FCU", "HOT WATER FAN COIL UNIT SCHEDULE", "scheduled hot-water fan-coil unit", ["FCU-1"], (960, 1025), (630, 680)),
        table(15, "M72-CONDENSING", "AIR-COOLED CONDENSING UNIT SCHEDULE", "scheduled air-cooled condensing unit", ["CU-1", "CU-2", "CU-3", "CU-4", "CU-5", "CU-6"], (1160, 1225), (790, 890)),
        table(15, "M72-EXPANSION-TANK", "EXPANSION TANK SCHEDULE", "scheduled expansion tank", ["ET-1", "ET-2"], (865, 925), (1045, 1105)),
        table(15, "M72-DX-FCU", "DX FAN COIL UNIT SCHEDULE", "scheduled DX fan-coil unit", ["EV-1", "EV-2", "EV-3", "EV-4", "EV-5", "EV-6"], (720, 780), (1210, 1345)),
        table(15, "M72-UNIT-HEATER", "UNIT HEATER SCHEDULE (HOT WATER)", "scheduled hot-water unit heater", ["UH-1", "UH-2"], (800, 855), (1470, 1535)),
        table(15, "M72-SILENCER", "SILENCER SCHEDULE", "scheduled silencer", ["S-1", "S-2"], (745, 795), (1660, 1730)),
        table(15, "M72-RADIATOR", "FIN TUBE RADIATION SCHEDULE", "scheduled finned-tube radiator", ["FTR-1", "FTR-1B", "FTR-2", "FTR-2B"], (865, 935), (1800, 1890)),
        table(15, "M72-LOUVER", "ARCHITECTURAL LOUVERED PENTHOUSE SCHEDULE", "scheduled architectural louvered penthouse", ["ALP-1", "ALP-2", "ALP-3"], (1605, 1665), (1995, 2050)),
    ]
    write("schedules_m72", "M7.2 schedule-tag registry for air devices, fan-coil/condensing/DX equipment, tanks, heaters, silencers, radiators and penthouses. It preserves every printed schedule mark without creating unsupported device-placement quantities.", 15, m72, {
        "air_devices": "M7.2 contains 23 air-device type rows across supply, return and exhaust marks. These are schedule types/marks, not an installed terminal or damper-actuator count.",
        "FCU-1": "VESTIBULE horizontal concealed hot-water fan-coil unit; 200 CFM, CV volume control, 0.50 in. w.g. external, 75 W, 120 V one phase, 55/95 F air, 140/110 F water, 0.60 GPM, 5.50 ft H2O maximum pressure drop.",
        "CU-1_through_CU-6": "Six roof air-cooled R410A condensing units, each 2 tons, 95 F nominal ambient, one condenser fan at 2,101 CFM, 208 V one phase, 12 FLA and 20 MOCP.",
        "DX_and_heat_equipment": "EV-1 through EV-6 are 600-CFM DX wall-mounted fan-coil units associated with CU-1 through CU-6. UH-1/UH-2 are 950/1,100-CFM horizontal-discharge hot-water unit heaters. FTR-1/FTR-1B/FTR-2/FTR-2B are finned-tube-radiator schedule identities.",
        "tanks_silencers_louvers": "ET-1 hot-water and ET-2 chilled-water expansion tanks, S-1/S-2 silencers and ALP-1/ALP-2/ALP-3 louvered penthouses are literal M7.2 schedule identities."
    })

    vav_marks = [f"VAV-{index}" for index in range(1, 59)]
    m73 = [table(16, "M73-VAV", "VOLUME CONTROL BOX SCHEDULE", "scheduled volume control box", vav_marks, (1160, 1240), (140, 915))]
    m73_performance = [detail_table(16, "M73-VAV-PERFORMANCE", "VOLUME CONTROL BOX SCHEDULE", "literal VAV schedule performance row", vav_marks,
                                    [1160, 1235, 1325, 1380, 1460, 1570, 1680, 1770, 1840, 1885, 1930, 1970, 2020, 2090, 2135, 2195, 2280, 2400, 2475],
                                    (140, 915))]
    write("schedules_m73", "M7.3 complete VAV schedule-tag registry. The 58 literal schedule marks are retained individually; no terminal, damper-actuator, control-valve or BAS-I/O multiplier is inferred from them.", 16, m73, {
        "VAV-1_through_VAV-58": "M7.3 schedules 58 Price SDV volume-control-box rows. Each row provides inlet diameter, minimum/maximum airflow, radiated sound, discharge sound, inlet/max pressure loss, entering/leaving water temperatures, sensible capacity, flow, pipe size and maximum water pressure drop; source-row values are intentionally not generalized across different VAV marks."
    })
    write("schedules_m73_performance", "M7.3 complete literal VAV schedule performance rows for all 58 tagged volume-control boxes. Each printed field is preserved as a dual-engine rechecked source cell.", 16, m73_performance, {
        "row_scope": "Each performance row is paired by the printed mark with schedules_m73.M73-VAV. It duplicates those marks only to retain the source performance cells; it is not a second equipment identity registry."
    })


if __name__ == "__main__":
    main()
