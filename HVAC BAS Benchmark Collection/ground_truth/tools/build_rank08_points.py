"""Literal capture of the two published Rank 08 BACnet point lists."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "08__vol2__044"
OUT = AUDIT / "work" / IDENT / "points_mi605_mi607.json"


def table(id_, sheet, page, title, columns, x_edges, rows, title_box):
    return {
        "id": id_, "sheet": sheet, "page": page,
        "title_as_printed": title, "columns": columns,
        "x_edges": x_edges,
        "y_ranges": [[a, b] for a, b, _ in rows],
        "rows": [text for _, _, text in rows],
        "row_reading_order": "right",
        "header_evidence": [{"bbox": title_box, "expected": title}],
        "source_row_semantics": "Complete literal source point-list row, including the printed point number, type and description. It is not an installed controller, terminal, wire, sensor, valve, or physical-I/O count.",
    }


def main():
    fuel_oil = [
        (958, 975, "1 AI PUMP #1 RUNTIME HRS"),
        (980, 998, "2 AI PUMP #2 RUNTIME HRS"),
        (1000, 1028, "3 DI PUMP 1 CALL FOR OPERATION-START/STOP"),
        (1040, 1065, "4 DI PUMP 1 FAULT-NORMAL/ALARM"),
        (1065, 1103, "5 DI PUMP 1 ON-OFF-AUTO SWITCH POSITION-ON-OFF/AUTO"),
        (1104, 1130, "6 DI PUMP 1 START OUTPUT-START/STOP"),
        (1132, 1149, "7 DI PUMP 1 STATUS-ON/OFF"),
        (1154, 1179, "8 DI PUMP 2 CALL FOR OPERATION-START/STOP"),
        (1180, 1206, "9 DI PUMP 2 FAULT-NORMAL/ ALARM"),
        (1207, 1244, "10 DI PUMP 2 ON-OFF-AUTO SWITCH POSITION-ON-OFF/AUTO"),
        (1246, 1271, "11 DI PUMP 2 START OUTPUT-START/STOP"),
        (1273, 1289, "12 DI PUMP 2 STATUS-ON/OFF"),
        (1295, 1311, "13 DI PUMP 1 LEAD-LEAD"),
        (1317, 1333, "14 DI PUMP 2 LEAD-LEAD"),
        (1338, 1363, "15 DI OIL FLOW SWITCH-FLOW/NO FLOW"),
        (1365, 1390, "16 DI STRAINER DIFFERENTIAL PRESSURE-NORMAL/ALARM"),
        (1402, 1428, "17 DI LEVER GATE VALVE-NORMAL/ALARM"),
        (1430, 1455, "18 DI PUMP SET LEAK-NORMAL/ALARM"),
        (1457, 1474, "19 DI DAY TANK-NORMAL/ALARM"),
        (1478, 1504, "20 DI DAY TANK VENT FLOW SWITCH-NORMAL/ALARM"),
        (1505, 1531, "21 DI DAY TANK HIGH LEVEL-NORMAL/ALARM"),
        (1533, 1558, "22 DI DAY TANK LOW LEVEL-NORMAL/ALARM"),
        (1560, 1585, "23 DI CONTAINMENT PIPE LEAK-NORMAL/ALARM"),
        (1588, 1612, "24 DI MODBUS REMOTE ALARM SILENCE"),
        (1614, 1639, "25 DI LEAD PUMP AUTO ROTATE MODE-ROTATE/MANUAL"),
        (1640, 1664, "26 DI PUMP FAULT RESET-RESET"),
        (1665, 1680, "27 AI GENERATOR RUN TIME"),
        (1683, 1710, "28 AI GENERATOR FUEL OIL CONSUMPTION LAST RUN"),
        (1711, 1748, "29 AI GENERATOR FUEL OIL CONSUMPTION CUMULATIVE"),
        (1750, 1775, "30 DI CONTROL VALVE COMMAND OPEN"),
        (1777, 1798, "31 DI CONTROL VALVE POSITION"),
        (1800, 1825, "32 DI CONTROL VALVE ALARM"),
        (1827, 1856, "33 DI CONTROL VALVE COMMAND CLOSE"),
    ]
    fuel_oil = [(a, b, "|".join((*text.split(" ", 2), "")))
                for a, b, text in fuel_oil]
    service_water = [
        "T1 - WATER IN TEMP AI 1", "T2 - WATER OUT TEMP AI 2", "T3 - STEAM IN TEMP AI 3",
        "T4 - CONDENSATE OUT TEMP AI 4", "T5 - HI LIM TEMP AI 5", "T5I - INDEPENDENT HI LIM AI 6",
        "ET - ENCLOSURE TEMP AI 7", "OUTSIDE TEMP AI 8", "REMOTE SETPOINT AI 9",
        "SYSTEM ENABLE EVENT COUNT AI 10", "SYSTEM HI LIM EVENT COUNT AI 11", "CPU BATTERY LEVEL AI 12",
        "VALVE V1 PERCENT POSITION AI 13", "VALVE V4 PERCENT POSITION AI 14", "ACTUAL CONTROL SETPOINT AI 15",
        "SV PID SETPOINT VARIABLE AI 16", "PV PID PROCESS VARIABLE AI 17", "CV PIC CONTROL VARIABLE AI 18",
        "FLOW RATE AI 19", "POWER USE AI 20", "SYSTEM HOURS RUN AI 21", "SYSTEM LAST SERVICE AI 22",
        "SYSTEM NEXT SERVICE AI 23", "STATUS: MODE OFF BI 24", "STATUS: MODE TIMED BI 25",
        "STATUS: MODE CONTINUOUS BI 26", "STATUS: RUNNING/STOPPED BI 27", "STATUS: DEGREES C SELECTED BI 28",
        "STATUS: DEGREES F SELECTED BI 29", "STATUS: FLOW IN KG/HR SELECTED BI 30",
        "STATUS: FLOW IN LBS/HR SELECTED BI 31", "STATUS: POWER IN KW SELECTED BI 32",
        "STATUS: POWER IN MBTU/HR SELECTED BI 33", "STATUS: POWER IN MJ/HR SELECTED BI 34",
        "STATUS: POWER IN KCAL/HR SELECTED BI 35", "STATUS: SPARE 40028.12 BI 36",
        "STATUS: SPARE 40028.13 BI 37", "STATUS: SPARE 40028.14 BI 38", "STATUS: SPARE 40028.15 BI 39",
        "ALARM: PT100 T1 SENSOR FAULT BI 40", "ALARM: PT100 T2 SENSOR FAULT BI 41",
        "ALARM: PT100 T3 SENSOR FAULT BI 42", "ALARM: PT100 T4 SENSOR FAULT BI 43",
        "ALARM: PT100 T5 SENSOR FAULT BI 44", "ALARM: ENCLOSURE TEMP SENSOR FAULT BI 45",
        "ALARM: V1 4-20MA FAILED BI 46", "ALARM: REM PID/ OUT WTHR 4 20MA FAIL BI 47",
        "ALARM: STEAM FLOMETER 4-20MA FAILED BI 48", "ALARM: TB45 4-20MA FAILED BI 49",
        "ALARM: BAND ALARM BI 50", "ALARM: DEVIATION ALARM BI 51", "ALARM: DIFFERENTIAL ALARM BI 52",
        "ALARM: HI LIM ALARM BI 53", "ALARM: INDEPENDENT HI LIM ALARM BI 54",
        "ALARM: RATE OF CHANGE ALARM BI 55", "ALARM: SPARE 40030.0 BI 56",
        "ALARM: SYSTEM IS DUE TO SERVICE BI 57", "ALARM: CPU BATTERY LO BI 58",
        "ALARM: VALPES BATTERY LO ALARM BI 59", "ALARM: CONDENSATE HI TEMP ALARM BI 60",
        "ALARM: V1 FAIL TO MOVE TO SP ALARM BI 61", "ALARM: MANUAL MODE SELECTED ALARM BI 62",
        "ENERGY COST PER UNIT OF ENERGY AI 91",
    ]
    service_rows = [(203 + 27 * i - 13, 203 + 27 * i + 13,
                     "|".join(text.rsplit(" ", 2)))
                    for i, text in enumerate(service_water)]
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal capture of both explicit Rank 08 BACnet point lists: fuel-oil system and packaged domestic-hot-water heaters.",
        "tables": [
            table("MI605-FUEL-OIL-BACNET", "MI-605", 29, "A FUEL OIL SYSTEM BACNET POINTS LIST:", "point_number|type_as_printed|description_as_printed|read_write_allowed_as_printed", [2450, 2530, 2625, 2790, 2885], fuel_oil, [2540, 895, 2760, 930]),
            table("MI607-SERVICE-WATER-HEATER", "MI-607", 31, "SERVICE WATER HEATER POINTS LIST", "point_name_as_printed|bacnet_object_type_as_printed|bacnet_object_id_as_printed", [2475, 2700, 2820, 2890], service_rows, [2420, 95, 2925, 150]),
        ],
        "assertions": [],
        "source_scope": "MI-605 contains 33 fuel-oil system point-list rows. MI-607 contains 63 published service-water-heater BACnet object rows, with object IDs 1 through 62 and 91 as printed.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
