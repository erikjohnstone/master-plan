"""Literal selected Rank 09 central-equipment schedules from M0.2 and M0.4."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "09__vol2__014"
OUT = AUDIT / "work" / IDENT / "schedules_core_equipment.json"


def r(y0, y1, *cells):
    return (y0, y1, "|".join(cells))


def table(id_, sheet, page, title, columns, x_edges, rows, title_box):
    return {
        "id": id_, "sheet": sheet, "page": page,
        "title_as_printed": title, "columns": columns, "x_edges": x_edges,
        "y_ranges": [[a, b] for a, b, _ in rows],
        "rows": [line for _, _, line in rows],
        "row_reading_order": "right",
        "header_evidence": [{"bbox": title_box, "expected": title}],
        "source_row_semantics": "Complete literal schedule row. It retains printed schedule cells and continuations without inferring procurement, plan placement, installed multiplicity, physical I/O, wiring, or controller allocation.",
    }


def main():
    condensing_units = [
        r(1236, 1249, "CU-A1", "ALTERNATE 1", "AHU-A1", "AAON", "CNA-105", "1,169", "12.9 21", "R-410A", "40°F", "2 VARIABLE SPEED", "8", "152", "152", "142", "104", "5,905", "SEE BELOW"),
        r(1264, 1277, "CU-A2", "BASE BID OR ALT. 3", "AHU-A2", "AAON", "CFA-025", "282.5", "- 11.2", "R-410A", "44°F", "1 VAR. + 1 ON/OFF", "4", "91", "58.25", "61.25", "62", "1,519", "SEE BE LOW"),
        r(1282, 1305, "CU-B1", "BASE BID", "(E) B WING MZ AHU", "AAON", "CFA-050", "566.7", "- 11.5", "R-410A", "44°F", "1 VAR. + 1 ON/OFF", "4", "120 .5", "104.5", "82.25", "68.5", "2,547", "SEE BELOW"),
    ]
    boilers = [
        r(465, 478, "B-A1", "2,500", "2,300", "92.0%", "FIRE-TUBE", "LOCHINVAR", "CREST FBN2500", "8\"", "9\"", "20:1", "2\"", "40% PROPYLENE GLYCOL", "3652", "SEE BELOW"),
        r(488, 501, "B-A2", "2,500", "2,300", "92.0%", "FIRE-TUBE", "LOCHINVAR", "CREST FBN2500", "8\"", "9\"", "20:1", "2\"", "40% PROPYLENE GLYCOL", "3652", "SEE BELOW"),
    ]
    steam_generators = [
        r(481, 505, "SG-A1", "SAM-A1 IN AHU-A1", "NORTEC", "GSTC-400", "560", "HOT SURFACE", "5\"", "420", "25", "ATMOSPHERIC", "4\"", "992", "ALL BELOW"),
        r(508, 532, "SG-A2", "SAM-A2 IN AHU-A1", "NORTEC", "GSTC-400", "560", "HOT SURFACE", "5\"", "420", "25", "ATMOSPHERIC", "4\"", "992", "ALL BELOW"),
        r(533, 557, "SG-A3", "SAM-A3 IN AHU-A1", "NORTEC", "GSTC-400", "560", "HOT SURFACE", "5\"", "420", "25", "ATMOSPHERIC", "4\"", "992", "ALL BELOW"),
    ]
    pumps = [
        r(923, 945, "HWP-1", "HOT WATER", "TACO", "FI 2510C", "BASE-MOUNTED, END-SUCTION", "40% PROPYLENE GLYCOL", "162.5", "50", "1750", "7", "VFD", "SEE BELOW"),
        r(945, 969, "HWP-2", "HOT WATER", "TACO", "FI 2510C", "BASE-MOUNTED, END-SUCTION", "40% PROPYLENE GLYCOL", "162.5", "50", "1750", "7", "VFD", "SEE BELOW"),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal-row capture of selected high-value M0.2/M0.4 central-equipment schedules: air-cooled condensing units, condensing boilers, gas-fired steam generators and hot-water pumps.",
        "tables": [
            table("M02-AIR-COOLED-CONDENSING-UNITS", "M0.2", 2, "AIR-COOLED CONDENSING UNIT SCHEDULE", "mark|base_bid_or_alternate|serves|manufacturer|model_number|capacity_mbh|eer_ahri_design|refrigerant|suction_temperature|cooling_stages|condenser_fans|length_top_inches|length_base_inches|width_inches|height_inches|weight_lbs|additional_details", [102, 170, 320, 400, 485, 580, 650, 745, 820, 905, 1010, 1080, 1160, 1240, 1280, 1325, 1370, 1450], condensing_units, [102, 1147, 650, 1181]),
            table("M04-CONDENSING-BOILERS", "M0.4", 4, "CONDENSING BOILER SCHEDULE", "mark|input_mbh|output_mbh|ahri_thermal_efficiency|type|manufacturer|model_number|combustion_air|vent|turndown|gas_connection|working_fluid|wet_weight_lbs|additional_details", [117, 175, 255, 340, 415, 495, 580, 690, 780, 860, 960, 1098, 1230, 1280, 1390], boilers, [117, 376, 527, 411]),
            table("M04-GAS-FIRED-STEAM-GENERATORS", "M0.4", 4, "GAS-FIRED STEAM GENERATOR SCHEDULE", "mark|serves|manufacturer|model_number|gas_input_max_mbh|ignition|vent_flue_size|steam_output_max_lbhr|steam_output_min_lbhr|steam_pressure|outlet_diameter|weight_lbs|notes", [1413, 1470, 1530, 1590, 1660, 1705, 1800, 1860, 1925, 1980, 2070, 2125, 2190, 2300], steam_generators, [1413, 384, 1956, 419]),
            table("M04-HOT-WATER-PUMPS", "M0.4", 4, "PUMP SCHEDULE", "mark|system|manufacturer|model_number|type|working_fluid|flow_rate_gpm|head_loss_ft|motor_speed_rpm|impeller_dia_inches|variable_speed|additional_details", [117, 170, 250, 340, 450, 565, 710, 810, 910, 1040, 1165, 1270, 1400], pumps, [117, 860, 332, 894]),
        ],
        "assertions": [],
        "schedule_scope": {
            "captured_schedule_corpus": "This module completely captures the four selected high-value tables. M0.2-M0.4 contain other visually reviewed schedules, which are retained as source context but are not silently represented as transcribed rows here.",
            "control_valve_schedule": "No standalone schedule titled CONTROL VALVE SCHEDULE is asserted from the supplied set. Boiler and pump schedule/control notes are retained in the bounded controls-context module.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
