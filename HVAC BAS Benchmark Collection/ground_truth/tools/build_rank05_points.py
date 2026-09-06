"""Strict capture of every published DDC point-list row on M-801 through M-804.

The apparent AI/AO/BI/BO/AV/MI identifiers and duplicated identifiers are
retained exactly as printed.  They are source list rows, not projected
controller-terminal counts.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "05__vol2__009"
OUT = AUDIT / "work" / IDENT / "points_m801_m804.json"


COLS = "point_id|description|trend_mark|alarm_mark|graphic_mark"


def points(identifier, sheet, page, title, xs, ys, rows, **extra):
    return {
        "id": identifier, "sheet": sheet, "page": page,
        "title_as_printed": title, "columns": COLS,
        "x_edges": xs, "y_ranges": ys, "rows": rows,
        "source_row_semantics": "Literal published point-list row. A point identifier can intentionally repeat; no unique-controller-address, card, terminal, wire or installed device quantity is inferred.",
        **extra,
    }


def main():
    vfd_rows = [
        "AI1|FREQUENCY SETPOINT REFERENCE (HZ)|●||●", "AI2|FREQUENCY STATUS (HZ)|●||●",
        "AI3|MOTOR SPEED (RPM)|●||●", "AI4|OUTPUT VOLTAGE (V)|●||●",
        "AI5|OUTPUT CURRENT (A)|●||●", "AI6|OUTPUT POWER (KW)|●||●",
        "AI7|TORQUE (%)|●||●", "AO1|SPEED COMMAND (%)|●||●",
        "AV1|MINIMUM FREQUENCY (HZ)|●||●", "AV2|MAXIMUM FREQUENCY (HZ)|●||●",
        "AV3|ACCELERATION TIME (S)|●||●", "AV4|DECELERATION TIME (S)|●||●",
        "BI1|VFD STATUS|●|●|●", "BI2|VFD FAULT|●|●|●", "BI3|VFD ALARM|●|●|●",
        "BO1|START / STOP COMMAND|●||●", "BO2|FAULT RESET|●||●", "MI1|HOA MODE STATUS|●|●|●",
    ]
    ahu1_rows = [
        "AI1|RETTURN AIR TEMPERATURE (°F)|●||●", "AI2|RETURN AIR DAMPER POSITION (%)|●||●",
        "AI3|OUTDOOR AIR DAMPER POSITION (%)|●||●", "AI3|OUTDOOR AIR TEMPERATURE (°F)|●||●",
        "AI4|OUTDOOR AIRFLOW (CFM)|●|●|●", "AI5|MIXED AIR TEMPERATURE (°F)|●||●",
        "AI6|FILTER DIFFERENTIAL PRESSURE (IN WG)|●|●|●", "AI7|CHILLED WATER CONTROL VALVE POSITION (%)|●||●",
        "AI8|SUPPLY AIR TEMPERATURE (°F)|●|●|●", "AI9|DOWN DUCT STATIC PRESSURE (IN WG)|●|●|●",
        "AO1|RETURN AIR DAMPER COMMAND (%)|●||●", "AO2|OUTDOOR AIR DAMPER COMMAND (%)|●||●",
        "AO3|CHILLED WATER CONTROL VALVE COMMAND (%)|●||●", "AO4|FAN SPEED COMMAND (%)|●||●",
        "BI1|DUCT SMOKE DETECTOR|●|●|●", "BI2|SUPPLY FAN STATUS|●|●|●",
        "BI3|DISCHARGE STATIC PRESSURE SWITCH|●|●|●",
    ]
    chiller_rows = [
        "AI1|CHILLED WATER SUPPLY TEMPERATURE (°F)|●|●|●", "AI2|CHILLED WATE RETURN TEMPERATURE (°F)|●||●",
        "AI3|PUMP MOTOR CURRENT|●|●|●", "AI4|PUMP MOTOR CURRENT|●|●|●",
        "BI1|PUMP STATUS|●|●|●", "BI3|PUMP STATUS|●|●|●",
        "BI5|CHILLER DIFFERENTIAL PRESSURE (PSI)|●|●|●", "BO1|CHILLER ENABLE / DISABLE|●||●",
        "BO2|PUMP START/STOP|●||●", "BO3|PUMP START/STOP|●||●",
        "MI1|CHILLER INTERGRATION POINTS||●|●",
    ]
    ahu2_rows = [
        "AI1|FILTER DIFFERENTIAL PRESSURE (IN WG)|●|●|●", "AI2|OUTDOOR AIR TEMPERATURE (°F)|●||●",
        "AI3|CHILLED WATER CONTROL VALVE POSITION (%)|●||●", "AI4|SUPPLY AIR TEMPERATURE (°F)|●|●|●",
        "AI4|DOWN DUCT STATIC PRESSURE (IN WG)|●|●|●", "AO1|CHILLED WATER CONTROL VALVE COMMAND (%)|●||●",
        "AO2|SUPPLY FAN SPEED (%)|●||●", "BI1|OUTDOOR AIR DAMPER END SWITCH|●|●|●",
        "BI2|SUPPLY FAN STATUS|●||●", "BI2|DUCT SMOKE DETECTOR|●|●|●",
        "BO1|OUTDOOR AIR DAMPER OPEN/CLOSE|●||●",
    ]
    lab_rows = ["AI1|FAN STATUS|●|●|●", "AO1|FAN SPEED COMMAND|●||●"]
    scheduled_rows = ["BI1|FAN STATUS|●|●|●", "BO1|START / STOP COMMAND|●||●"]
    electric_rows = [
        "AI1|ELECTRIC HEAT DISCHARGE AIR TEMPERATURE|●||●", "AI2|SPACE TEMPERATURE (°F)|●|●|●",
        "AI3|ZONE LOCAL SETPOINT ADJUST (°F)|●|●|●", "BI1|AIRFLOW SWITCH|●||●",
        "BI1|LOCAL OCCUPANCY OVERRIDE|●|●|●", "BO1|ELECTRIC HEAT STAGE (ON/OFF)|●||●",
    ]
    vav_rows = [
        "AI1|ZONE PRIMARY AIRFLOW (CFM)|●||●", "AI2|PRIMARY AIR DAMPER STATUS (%)|●||●",
        "AI4|SUPPLY AIR TEMPERATURE (°F)|●|●|●", "AI5|ZONE TEMPERATURE (°F)|●|●|●",
        "AI6|ZONE LOCAL SETPOINT ADJUST (°F)|●||●", "AO1|PRIMARY AIR DAMPER COMMAND (%)|●||●",
        "BI1|LOCAL OCCUPANCY OVERRIDE|●||●", "BO2|ELECTRIC HEAT STAGE (ON/OFF)|●||●",
    ]
    tables = [
        points("M801-VFD-BACNET-INTERFACE", "M-801", 19, "VARIABLE FREQUENCY DRIVE BACNET INTERFACE SCHEDULE",
               [1280, 1320, 1650, 1745, 1800, 1850],
               [[170,189],[189,206],[206,223],[223,241],[241,258],[258,275],[275,292],[309,326],[343,360],[360,378],[378,395],[395,412],[429,447],[447,464],[464,481],[498,516],[516,533],[550,567]], vfd_rows,
               header_evidence=[{"bbox": [1270, 85, 1855, 150], "expected": "VARIABLE FREQUENCY DRIVE BACNET INTERFACE SCHEDULE"}]),
        points("M802-AHU1-DDC", "M-802", 20, "AHU-1 DDC POINTS LIST",
               [1935, 1975, 2325, 2390, 2445, 2510],
               [[432,449],[449,466],[466,483],[483,500],[501,518],[518,535],[535,552],[552,569],[570,587],[587,604],[621,638],[638,656],[656,673],[673,690],[708,725],[725,742],[742,759]], ahu1_rows),
        points("M802-CHILLER-PLANT-DDC", "M-802", 20, "CHILLER PLANT DDC POINTS LIST",
               [2070, 2110, 2460, 2525, 2580, 2645],
               [[1720,1737],[1737,1755],[1755,1772],[1772,1789],[1807,1824],[1824,1841],[1841,1858],[1876,1893],[1893,1910],[1910,1927],[1945,1962]], chiller_rows),
        points("M803-AHU2-DDC", "M-803", 21, "AHU-2 DDC POINTS LIST",
               [2112, 2150, 2500, 2570, 2625, 2685],
               [[1584,1602],[1602,1619],[1619,1636],[1636,1653],[1653,1671],[1688,1705],[1705,1722],[1740,1757],[1757,1774],[1774,1791],[1809,1826]], ahu2_rows),
        points("M803-LAB-EXHAUST-DDC", "M-803", 21, "LAB EXHAUST FANS DDC POINTS LIST",
               [866, 910, 1260, 1325, 1380, 1435], [[656,673],[691,708]], lab_rows),
        points("M803-SCHEDULED-EXHAUST-DDC", "M-803", 21, "SCHEDULED EXHAUST FAN DDC POINTS LIST",
               [2135, 2175, 2525, 2595, 2650, 2710], [[840,857],[875,892]], scheduled_rows),
        points("M804-ELECTRIC-UNIT-HEATER-DDC", "M-804", 22, "ELECTRIC UNIT HEATER DDC POINTS LIST",
               [2100, 2140, 2505, 2565, 2620, 2680], [[374,391],[391,408],[408,425],[443,460],[460,477],[495,512]], electric_rows),
        points("M804-VAV-TERMINAL-DDC", "M-804", 22, "VAV TERMINAL DDC POINTS LIST",
               [2100, 2140, 2505, 2565, 2620, 2680], [[1588,1605],[1605,1622],[1622,1639],[1639,1656],[1656,1674],[1691,1708],[1726,1743],[1760,1777]], vav_rows),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal capture of the eight published controls point-list matrices on M-801 through M-804, including source trend/alarm/graphic marks and source-printed repeated identifiers.",
        "tables": tables,
        "assertions": [
            {"id":"m801-vfd-typical-each", "page":19, "bbox":[1280,585,1650,604], "expected":"1. POINTS ARE TYPICAL FOR EACH VARIABLE FREQUENCY DRIVE (VFD).", "mode":"exact"},
            {"id":"m801-vfd-alarm-scope", "page":19, "bbox":[1280,615,1735,645], "expected":"ALARMS: THE FOLLOWING ALARMS SHALL BE ANNUNCIATED TO THE DDC SYSTEM FOR EACH VFD:", "mode":"exact"},
            {"id":"m802-chiller-vfd-reference", "page":20, "bbox":[2065,1968,2605,2012], "expected":"NOTES: 1. REFER TO THE CHILLER BACNET INTERFACE SCHEDULE ON M-801 FOR ADDITIONAL POINTS FOR EACH CHILLER.", "mode":"exact"},
            {"id":"m802-ahu1-vfd-reference", "page":20, "bbox":[1930,766,2495,811], "expected":"NOTES: 1. REFER TO THE VFD BACNET INTERFACE SCHEDULE ON M-801 FOR ADDITIONAL POINTS FOR EACH FAN.", "mode":"exact"},
            {"id":"m803-ahu2-vfd-reference", "page":21, "bbox":[2105,1830,2650,1870], "expected":"NOTES: 1. REFER TO THE VFD BACNET INTERFACE SCHEDULE ON M-801 FOR ADDITIONAL POINTS FOR EACH FAN.", "mode":"exact"},
            {"id":"m803-ef56-existing-note", "page":21, "bbox":[2130,899,2540,928], "expected":"NOTES: 1. EF-5 & 6 ARE EXISTING FANS. PROVIDE STARTERS AND CURRENT SWITCHES.", "mode":"exact"},
            {"id":"m804-vav-existing-controls-note", "page":22, "bbox":[2095,1783,2665,1832], "expected":"NOTES: 1. VAV CONTROLS ARE EXISTING TO REMAIN, ENSURE THEY ARE INTEGRATED INTO DDC GRAPHICS, PROVIDE SPACE AND DISCHARGE AIR SENSORS.", "mode":"exact"},
        ],
        "source_boundary": "AI/AO/AV/BI/BO/MI are the printed point identifiers. The schedules do not provide controller panel names, BACnet instance numbers, wiring terminal numbers, physical I/O card assignment, or a final sitewide BAS point total. Repeated AI3, AI4, BI1 and BI2 labels are retained exactly and must not be auto-deduplicated.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
