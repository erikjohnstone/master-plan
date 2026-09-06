"""Source-bounded M701 chiller sequence, BAS, and controls-interface context."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "22__vol2__012"
OUT = AUDIT / "work" / IDENT / "controls_context_rank22.json"


def a(id_, page, bbox, expected):
    return {"id": id_, "page": page, "bbox": bbox, "expected": expected, "mode": "contains"}


def main():
    assertions = [
        a("m601-bacnet-mstp", 19, [580, 340, 870, 357], "PROVIDE UNIT WITH BACnet MS/TP COMMUNICATION INTERFACE."),
        a("m701-primary-secondary-system", 20, [1674, 195, 2300, 211], "GENERAL: THE CHILLED WATER SYSTEM IS A PRIMARY-SECONDARY FLOW SYSTEM WITH THREE (3) CHILLERS, THREE (3) PRIMARY CHILLED"),
        a("m701-system-redundancy", 20, [1674, 218, 2310, 245], "FOR N+1 REDUNDANCY. THE COOLING SYSTEM SHALL BE CONTROLLED FROM THE BUILDING AUTOMATION CONTROL SYSTEM (BAS) AS"),
        a("m701-seasonal-operator-enable", 20, [1745, 263, 2295, 279], "OPERATOR SHALL HAVE ON/OFF SEASONAL ENABLE/DISABLE THAT REQUIRES OPERATOR INTERVENTION."),
        a("m701-oat-enable-threshold", 20, [1674, 274, 2300, 301], "OVERRIDE IS SET TO ENABLE AND IF THE OUTSIDE AIR TEMPERATURE IS ABOVE 55 DEGREES (ADJUSTABLE) WITH A 5 DEGREE DEADBAND"),
        a("m701-bas-chiller-control", 20, [1760, 308, 2280, 324], "THE BAS SHALL CONTROL THE STARTING AND STOPPING OF THE CHILLERS, SET THE CHILLED WATER SETPOINT"),
        a("m701-operator-selectable-leadlag", 20, [1674, 320, 2290, 346], "CHILLER STATUS, AND MONITOR CHILLER LOAD CAPACITY.  THE CHILLERS SHALL BE CONTROLLED BY A LEAD/LAG STRATEGY WHICH IS"),
        a("m701-lead-valve-pump-sequencing", 20, [1674, 388, 2300, 414], "PROVEN. THE CHILLED WATER ISOLATION VALVE FOR THE LEAD CHILLER SHALL OPEN AND THE LEAD CHILLED WATER PUMP SHALL START"),
        a("m701-lead-chiller-flow-proven", 20, [1674, 445, 2160, 461], "WATER AND CONDENSER WATER FLOW SWITCHES MAKE, THE CHILLER SHALL START VIA INTERNAL LOGIC."),
        a("m701-lag-chiller-minimum-flow", 20, [1674, 479, 2310, 505], "LAG CHILLER SHALL SLOWLY OPEN WHILE THE LAG PRIMARY CHILLED WATER PUMP IS ENABLED AND THE SPEED IS SLOWLY INCREASED NOT"),
        a("m701-secondary-dp-vfd", 20, [1674, 626, 2310, 653], "MODULATE THE LEAD SECONDARY CHILLED WATER PUMP VFD TO MAINTAIN CHILLED WATER SYSTEM DIFFERENTIAL SETPOINT. INITIALLY SE"),
        a("m701-secondary-dp-alarm", 20, [1674, 649, 2310, 676], "SYSTEM BALANCING.  IF A SYSTEM DP READING FALLS OUTSIDE THE RANGE OF 9-15 PSI (ADJUSTABLE) THE CONTROLLER SHALL GENERATE A"),
        a("m701-lag-pump-alarm", 20, [1674, 672, 2310, 699], "AT THE BAS.  THE LAG CHILLED WATER PUMP SHALL BE ENABLED IF THE LEAD CHILLED WATER PUMP IS IN AN ALARM CONDITION PREVENTIN"),
        a("m701-stage-up-capacity", 20, [1674, 717, 2310, 733], "ACTUAL CHILLER CAPACITY OF LEAD CHILLER IS >70% (ADJ.) FOR 5 MINUTES (ADJ.) AND ONLY (1) CHILLER IS CURRENTLY RUNNING, THE BAS"),
        a("m701-stage-down-capacity", 20, [1674, 740, 2290, 767], "CONDITION PREVENTING IT FROM OPERATING. THE BAS SHALL STAGE DOWN FROM (2) CHILLERS TO (1) IF THE ACTUAL CAPACITY OF ALL"),
        a("m701-two-chiller-limit", 20, [1674, 751, 2280, 778], "ACTIVE CHILLERS IS <25% FOR 10 MINUTES (ADJ.). ONLY (2) CHILLERS SHALL BE ALLOWED TO OPERATE AT ANY TIME."),
        a("m701-chws-reset", 20, [1674, 786, 2280, 812], "THE CHILLED WATER SUPPLY TEMPERATURE SETPOINT SHALL BE RESET LINEARLY BASED ON"),
        a("m701-chws-reset-75f", 20, [1700, 830, 1850, 846], "75 deg F 44 deg F"),
        a("m701-chws-reset-65f", 20, [1700, 842, 1850, 858], "65 deg F 48 deg F"),
        a("m701-tower-wetbulb-reset", 20, [1790, 865, 2270, 880], "AN OUTSIDE AIR WET BULB TEMPERATURE SHALL BE CALCULATED BY THE BAS AND SHALL RESET THE"),
        a("m701-tower-wetbulb-60f", 20, [1680, 909, 1840, 926], "60 deg F 65 deg F"),
        a("m701-tower-wetbulb-75f", 20, [1680, 921, 1840, 938], "75 deg F 85 deg F"),
        a("m701-tower-vfd-modulation", 20, [1674, 944, 2310, 971], "SETPOINT BY MODULATING THE COOLING TOWER FAN VFD.  COOLING TOWER FAN SPEED SHALL INCREASE IF THE WATER TEMPERATURE IS"),
        a("m701-bypass-in-cold", 20, [1674, 1000, 2305, 1028], "OPERATING AND THE OUTSIDE AIR TEMPERATURE IS BELOW 45 DEGREES THE BYPASS VALVE SHALL COMMANDED TO 100% OPEN"),
        a("m701-condenser-pump-lead-command", 20, [1830, 1035, 2300, 1050], "THE LEAD CONDENSER WATER PUMP SHALL BE ENABLED BY A COMMAND BEING SENT TO A CHILLER."),
        a("m701-condenser-pump-lag-alarm", 20, [1674, 1068, 2300, 1096], "BY AN OPERATOR AT THE BAS.  THE LAG CONDENSER WATER PUMP SHALL BE ENABLED IF THE LEAD CONDENSER WATER PUMP IS IN AN"),
        a("m701-tower-level-monitoring", 20, [1790, 1126, 2300, 1153], "THE  BAS SHALL MONITOR THE COOLING TOWER BASIN FILL LEVELS. TOWER FILL SHALL BE BY MECHANICAL FILL"),
        a("m701-tower-high-level-alarm", 20, [1674, 1171, 2165, 1187], "IF THE WATER LEVEL IN THE BASIN REACHES THE HIGH LEVEL SETPOINT, AN ALARM SHALL BE GENERATED."),
        a("m701-tower-low-level-alarm", 20, [1674, 1193, 2165, 1210], "IF THE WATER LEVEL IN THE BASIN REACHES THE LOW LEVEL SET POINT, AN ALARM SHALL BE GENERATED."),
        a("m701-runtime-weekly-manual-switchover", 20, [1674, 1227, 2310, 1255], "HAVE SELECT LEAD/LAG SWITCHOVER FROM THE FOLLOWING OPTIONS: RUNTIME HOURS (168 HOURS, ADJUSTABLE), WEEKLY (TUESDAYS @"),
        a("m701-refrigerant-purge", 20, [1800, 1273, 2305, 1300], "UPON RECEIVING AN ALARM SIGNAL FROM THE REFRIGERANT MONITORING SYSTEM, THE BAS SHALL INITIATE"),
        a("m701-purge-equipment-logic", 20, [1674, 1307, 2275, 1334], "PURGE MODE: ALL EQUIPMENT IN MECHANICAL ROOM WILL SHUT DOWN. SF-1 DAMPER WILL OPEN AND SF-1 AND EF-2"),
        a("m702-retain-existing-sensor", 21, [1895, 130, 2260, 158], "EXISTING SENSOR/DEVICE TO REMAIN. CONTROLS CONTRACTOR SHALL VERIFY"),
        a("m702-new-temperature-sensor", 21, [1895, 175, 2260, 193], "PROVIDE NEW TEMPERATURE SENSOR IN EXISTING TO REMAIN THERMOWELL."),
        a("e601-vfd-division-26", 27, [960, 435, 1260, 452], "VFD TO BE PROVIDED BY DIVISION 26 AND INSTALLED BY DIVISION 26."),
        a("e601-vfd-controls-interface", 27, [960, 463, 1530, 479], "PROVIDE WITH CONTROLS INTERFACE BOARD FOR SINGLE TERMINATION BY CONTROLS CONTRACTOR FOR START/STOP, PROOF, SPEED"),
        a("e601-vfd-controls-interface-input", 27, [960, 475, 1280, 491], "OUTPUT, AND SPEED INPUT. COORDINATE WITH CONTROLS CONTRACTOR."),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Source-bounded M701 staged-chiller sequence of operation, M601 BACnet interface note, M702 water-controls diagram sensor notes, and E601 VFD controls-interface context.",
        "tables": [], "assertions": assertions,
        "network_architecture": {
            "published_integration": [
                "M601 requires a BACnet MS/TP communication interface for the scheduled chillers.",
                "M701 says the cooling system is controlled from the building automation control system (BAS).",
                "E601 requires a VFD controls interface board for a single controls-contractor termination for start/stop, proof, speed output and speed input.",
            ],
            "assertion_ids": ["m601-bacnet-mstp", "m701-system-redundancy", "e601-vfd-controls-interface", "e601-vfd-controls-interface-input"],
            "boundary": "The supplied sheets do not publish controller addresses, router/network topology, trunk/media design, controller/card assignment, terminal schedules, wiring terminations, device serial numbers, BACnet object lists, or installed controller quantities.",
        },
        "sequence_inventory": [
            {"id": "m701-chiller-enable-lead-lag-and-staging", "sheet": "M701", "assertion_ids": ["m701-primary-secondary-system", "m701-seasonal-operator-enable", "m701-bas-chiller-control", "m701-lead-valve-pump-sequencing", "m701-lag-chiller-minimum-flow", "m701-stage-up-capacity", "m701-stage-down-capacity", "m701-two-chiller-limit"]},
            {"id": "m701-secondary-chilled-water-dp", "sheet": "M701", "assertion_ids": ["m701-secondary-dp-vfd", "m701-secondary-dp-alarm", "m701-lag-pump-alarm"]},
            {"id": "m701-temperature-and-tower-control", "sheet": "M701", "assertion_ids": ["m701-chws-reset", "m701-chws-reset-75f", "m701-chws-reset-65f", "m701-tower-wetbulb-reset", "m701-tower-vfd-modulation", "m701-bypass-in-cold"]},
            {"id": "m701-condenser-pumps-tower-level-and-rotation", "sheet": "M701", "assertion_ids": ["m701-condenser-pump-lead-command", "m701-condenser-pump-lag-alarm", "m701-tower-level-monitoring", "m701-tower-high-level-alarm", "m701-tower-low-level-alarm", "m701-runtime-weekly-manual-switchover"]},
            {"id": "m701-refrigerant-monitor-purge", "sheet": "M701", "assertion_ids": ["m701-refrigerant-purge", "m701-purge-equipment-logic"]},
        ],
        "sensors_and_control_symbol_context": {
            "published_context": "M701 references outside-air dry-bulb and wet-bulb calculations, chilled-water and condenser-water differential-pressure control, flow switches, basin level monitoring and refrigerant monitoring. M702 says existing sensors/devices remain and calls for a new temperature sensor in an existing thermowell.",
            "assertion_ids": ["m701-oat-enable-threshold", "m701-lead-chiller-flow-proven", "m701-secondary-dp-vfd", "m701-tower-wetbulb-reset", "m701-tower-level-monitoring", "m701-refrigerant-purge", "m702-retain-existing-sensor", "m702-new-temperature-sensor"],
            "boundary": "The sequence and diagram notes are not transformed into a counted physical sensor, thermostat, zone, actuator, damper, valve, controller, terminal, relay, wire, or I/O-device inventory. M701's separately retained formal point matrix is the authoritative source for listed points and its printed hardwired I/O flags.",
        },
        "control_boundaries": [
            "All conditional control logic remains source-bounded. No source clause is expanded into physical equipment or field-device quantities.",
            "The M601 BACnet note and E601 VFD controls-interface notes establish only the quoted integration/interface requirements, not a complete BAS design or connection schedule.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
