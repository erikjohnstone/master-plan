"""Literal typed BAS point matrices from M7.02/M7.03, without device expansion."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "23__vol2__033"
OUT = AUDIT / "work" / IDENT / "points_m702_m703.json"
COLUMNS = ["point_name", "AI", "AO", "BI", "BO", "AV", "BV", "SCHED", "TREND", "ALARM", "SHOW_ON_GRAPHIC"]


def row(name, **flags):
    return "|".join([name] + [flags.get(key, "") for key in COLUMNS[1:]])


def table(id_, page, sheet, title, edges, ranges, rows):
    return {
        "id": id_, "page": page, "sheet": sheet, "title_as_printed": title,
        "columns": "|".join(COLUMNS), "x_edges": edges, "y_ranges": ranges,
        "rows": rows,
        "source_row_semantics": "Literal printed point-function row and printed hardware/software flags. This source matrix is not expanded into a final field-device, controller/card, terminal, wiring, network-object or physical-installation count.",
    }


def main():
    ahu = [
        row("VFD START / STOP", BO="X", SCHED="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("VFD FAN STATUS", BI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("VFD FAULT / FAILURE", BI="X", BV="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("SUPPLY FAN VFD SPEED", AO="X"), row("VFD HOA STATUS", BV="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("DUCT HIGH PRESSURE SAFETY, SPS-2", BI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("DOWNDUCT STATIC PRESSURE SENSOR, SPS-1", AI="X", BI="X"), row("SUPPLY DUCT SMOKE DETECTOR, STATUS (DSD-1)", BI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"),
        row("RETURN FAN POINTS LIST"), row("VFD START / STOP", BO="X", SCHED="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("VFD FAN STATUS", BI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("VFD FAULT / FAILURE", BI="X", BV="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("RETURN FAN VFD SPEED", AO="X"), row("VFD HOA STATUS", BV="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("SUPPLY AIR TEMPERATURE CONTROL"), row("FREEZE PROTECTION, FZ", BI="X"), row("SUPPLY AIR TEMPERATURE, T-1", AI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("SUPPLY AIR TEMPERATURE SET POINT", AV="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("LOW TEMPERATURE DETECTION, T-4", AI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("DAMPER CONTROL"), row("MIXED AIR TEMPERATURE, T-3", AI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("OUTSIDE AIR DAMPER POSITION, D-1", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("OUTSIDE AIR DAMPER OPEN/CLOSE, D-1", AO="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("OUTSIDE AIR FLOW SET POINT, D-1", AV="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("RETURN AIR DAMPER POSITION, D-2", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("RETURN AIR DAMPER OPEN/CLOSE, D-2", AO="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("RETURN AIR FLOW SET POINT, D-2", AV="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("RELIEF AIR DAMPER POSITION, D-3", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("RELIEF AIR DAMPER OPEN/CLOSE, D-3", AO="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("RELIEF AIR FLOW SET POINT, D-3", AV="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("MISCELLANEOUS POINTS"), row("RETURN AIR TEMPERATURE, T-2", AI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("RETURN AIR HUMIDITY, H-1", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("SUPPLY AIR HUMIDITY, H-2", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("HUMIDIFIER", AO="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("HUMIDIFIER ENABLE", BO="X", SHOW_ON_GRAPHIC="X"), row("OUTSIDE AIR FLOW MEASURING STATION", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("BUILDING STATIC PRESSURE", AI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("FILTER DIFFERENTIAL PRESSURE (MERV-8)", BI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("FILTER DIFFERENTIAL PRESSURE (MERV-11)", BI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("FILTER DIFFERENTIAL PRESSURE (MERV-15)", BI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("FILTER DIFFERENTIAL PRESSURE ALARM SET POINT", AV="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("OUTSIDE AIR DEW POINT TEMPERATURE, T-5 (NETWORK)", AI="X", AV="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("OUTSIDE AIR HUMIDITY SENSOR, H-3 (NETWORK)", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"), row("HEAT PUMP WATER SUPPLY TEMPERATURE, T-6", AI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("HEAT PUMP WATER RETURN TEMPERATURE, T-7", AI="X", TREND="X", ALARM="X", SHOW_ON_GRAPHIC="X"), row("HEAT PUMP STATUS", BI="X"), row("HEAT PUMP COMPRESSOR CONTROL", BO="X"),
    ]
    vav = [
        row("DISCHARGE AIR TEMPERATURE", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("ZONE SETPOINT ADJUST", AI="X", SHOW_ON_GRAPHIC="X"),
        row("AIRFLOW", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("ZONE TEMPERATURE", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("HOT WATER REHEAT VALVE", AO="X", SHOW_ON_GRAPHIC="X"),
        row("HOT WATER CONVECTOR VALVE", AO="X"),
        row("ZONE DAMPER", AO="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("ZONE OVERIDE", BI="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("AIRFLOW SETPOINT", AV="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("COOLING/HEATING SETPOINT", AV="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("DISCHARGE AIR TEMPERATURE HEATING LIMIT", AV="X"),
        row("HEATING/COOLING MODE", BV="X", TREND="X"),
        row("SCHEDULE OCCUPANCY", SCHED="X"),
        row("HIGH DISCHARGE AIR TEMPERATURE", ALARM="X"),
        row("HIGH ZONE TEMPERATURE", ALARM="X"),
        row("LOW DISCHARGE AIR TEMPERATURE", ALARM="X"),
        row("LOW ZONE TEMPERATURE", ALARM="X"),
    ]
    exhaust = [
        row("FAN STATUS", BI="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("FAN START/STOP", BO="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("SCHEDULE", SCHED="X"),
        row("FAN FAILURE", ALARM="X"),
        row("FAN IN HAND", ALARM="X"),
        row("FAN RUN TIME EXCEEDED", ALARM="X"),
    ]
    pump = [
        row("PUMP-12 STATUS", BI="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("PUMP-13 STATUS", BI="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("PUMP-12 START/STOP", BO="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("PUMP-13 START/STOP", BO="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("PUMP-12 LEAD/STANDBY", BI="X", SHOW_ON_GRAPHIC="X"),
        row("PUMP-13 LEAD/STANDBY", BI="X", SHOW_ON_GRAPHIC="X"),
        row("PUMP-12 VFD FAULT", BI="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("PUMP-12 VFD SPEED", AO="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("PUMP-13 VFD FAULT", BI="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("PUMP-13 VFD SPEED", AO="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("DIFFERENTIAL PRESSURE SETPOINT", AI="X", AV="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("ALARM"),
        row("PUMP-12 FAILURE", ALARM="X"),
        row("PUMP-13 FAILURE", ALARM="X"),
        row("PUMP-12 VFD FAULT", ALARM="X"),
        row("PUMP-13 VFD FAULT", ALARM="X"),
        row("HIGH DIFFERENTIAL PRESSURE", ALARM="X"),
        row("LOW DIFFERENTIAL PRESSURE", ALARM="X"),
    ]
    suh = [
        row("DISCHARGE AIR TEMP", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("ZONE SETPOINT ADJUST", AI="X", SHOW_ON_GRAPHIC="X"),
        row("ZONE TEMP", AI="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("HEATING VALVE", AO="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("FAN HIGH SPEED", BO="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("FAN LOW SPEED", BO="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("HEATING SETPOINT", AV="X", TREND="X", SHOW_ON_GRAPHIC="X"),
        row("SCHEDULE", SCHED="X"),
        row("HIGH DISCHARGE AIR TEMP", ALARM="X"),
        row("LOW DISCHARGE AIR TEMP", ALARM="X"),
        row("LOW ZONE TEMP", ALARM="X"),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Complete typed M7.02/M7.03 VAV, exhaust-fan, pump and suspended-unit-heater point matrices.",
        "tables": [
            table("M701-AHU-6", 70, "M7.01", "AIR HANDLING UNIT POINTS LIST", [1980, 2390, 2420, 2455, 2485, 2520, 2555, 2588, 2645, 2705, 2760, 2830], [[164 + 22.5*i, 184 + 22.5*i] for i in range(48)], ahu),
            table("M702-SUPPLY-VAV-TERMINAL-UNIT", 71, "M7.02", "SUPPLY VAV TERMINAL UNIT POINTS LIST", [1000, 1290, 1320, 1355, 1390, 1430, 1465, 1500, 1535, 1570, 1610, 1660], [[642 + 18*i, 660 + 18*i] for i in range(17)], vav),
            table("M702-EXHAUST-FAN", 71, "M7.02", "EXHAUST FAN POINTS LIST", [2070, 2260, 2290, 2330, 2360, 2400, 2435, 2470, 2525, 2585, 2665, 2740], [[779 + 14.6*i, 793 + 14.6*i] for i in range(6)], exhaust),
            table("M702-GEOTHERMAL-HEAT-PUMP-WATER-PUMPS", 71, "M7.02", "PUMP CONTROL POINTS", [450, 725, 750, 790, 820, 855, 890, 920, 970, 1010, 1055, 1100], [[1471 + 18.05*i, 1489 + 18.05*i] for i in range(18)], pump),
            table("M703-SUSPENDED-UNIT-HEATER", 72, "M7.03", "SUSPENDED UNIT HEATER POINTS LIST", [2080, 2270, 2300, 2340, 2370, 2405, 2440, 2470, 2535, 2595, 2655, 2710], [[1414 + 19.1*i, 1433 + 19.1*i] for i in range(11)], suh),
        ],
        "normalization": {"AI": "AI", "AO": "AO", "BI": "BI", "BO": "BO", "AV": "AV", "BV": "BV"},
        "assertions": [],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
