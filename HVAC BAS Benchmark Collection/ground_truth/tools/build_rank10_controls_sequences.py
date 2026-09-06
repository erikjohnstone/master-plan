"""Bounded Rank 10 FMCS terminal-air-box, VFD, steam-meter, and trap sequences."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "10__vol2__040"
OUT = AUDIT / "work" / IDENT / "controls_sequences.json"


def a(id_, page, bbox, expected):
    return {"id": id_, "page": page, "bbox": bbox, "expected": expected, "mode": "exact"}


def main():
    assertions = [
        a("m401-tab-temperature-control", 44, [1272, 662, 1730, 714], "FMCS TAB CONTROLLER SHALL MODULATE THE TAB DAMPER AND TAB HW REHEAT COIL CONTROL VALVE TO MAINTAIN SPACE TEMPERATURE OF 72°F (ADJ.) WITH 2°F (ADJ.) DEAD BAND BASED ON A SIGNAL FROM A WALL MOUNTED TEMPERATURE SENSOR. SEE DRAWINGS FOR TEMPERATURE SENSOR REQUIREMENTS. SPACES WITH ADJUSTABLE THERMOSTATS WILL ALLOW A +/- 3°F (ADJ.) OFFSET FROM THE DDC SETPOINT."),
        a("m401-tab-full-cooling", 44, [1272, 716, 1709, 736], "AT FULL COOLING, THE TAB SHALL BE OPEN TO MAXIMUM CFM POSITION. THE REHEAT COIL CONTROL VALVE SHALL BE CLOSED."),
        a("m401-tab-reheat-sequence", 44, [1272, 738, 1726, 834], "UPON A FALL IN SPACE TEMPERATURE, THE TAB SHALL MODULATE CLOSED UNTIL SPACE SETPOINT IS MAINTAINED, OR UNTIL IT REACHES ITS MINIMUM SCHEDULED CFM POSITION PER THE TAB SCHEDULE. THE REHEAT COIL CONTROL VALVE SHALL BE CLOSED. UPON A FURTHER FALL IN SPACE TEMPERATURE, THE REHEAT COIL CONTROL VALVE SHALL MODULATE OPEN TO MAINTAIN SPACE SETPOINT UNTIL THE SUPPLY AIR TEMPERATURE IS 20°F ABOVE ROOM TEMPERATURE SETPOINT. UPON A FURTHER FALL IN SPACE TEMPERATURE, TAB SHALL OPEN TO MAINTAIN SETPOINT UNTIL TAB AIRFLOW REACHES ITS MAXIMUM HEATING SETTING. THE REHEAT CONTROL VALVE SHALL CONTINUE TO MODULATE OPEN TO MAINTAIN MAXIMUM DELTA T LISTED ABOVE."),
        a("m401-tab-static-pressure-reset", 44, [1272, 836, 1705, 856], "THE FMCS SHALL UTILIZE OUTPUT FROM ALL TERMINAL AIR BOX POSITIONS TO RESET THE SUPPLY DUCT DIFFERENTIAL STATIC PRESSURE."),
        a("m401-floating-valve-auto-zero", 44, [1272, 858, 1723, 888], "WHEN FLOATING CV'S ARE USED, FMCS SHALL PERFORM AN AUTO-ZERO FUNCTION EVERY NIGHT DURING UNOCCUPIED TIMES. THE FMCS SHALL STAGGER AUTO-ZERO SEQUENCES SO THAT ALL VALVES DO NOT SIMULTANEOUSLY CLOSE."),
        a("m401-exhaust-tab-offset", 44, [1254, 923, 1732, 975], "FMCS TAB CONTROLLER (OR AIR FLOW STATION/ MOTOR OPERATED DAMPER COMBINATION) SHALL MODULATE THE TAB DAMPER TO MAINTAIN A CONSTANT VOLUME OFFSET. INITIAL CFM OFFSET SHALL BE THE DIFFERENCE BETWEEN THE TAB MAXIMUM VALUES ON THE DRAWINGS BUT SHOULD BE ADJUSTED BY THE TCC AND BALANCING CONTRACTOR TO ENSURE PROPER AIR FLOW DIRECTION. OFFSET CFM SHALL BE ADJUSTABLE THROUGH THE FMCS OPERATOR INTERFACE."),
        a("m401-tab-space-temperature-alarm", 44, [1254, 1010, 1730, 1030], "SEND AN ALARM TO THE FMCS OPERATOR INTERFACE IF THE SPACE TEMPERATURE IS MORE THAN 10°F (ADJ.) ABOVE OR BELOW SETPOINT."),
        a("m401-report-command", 44, [2375, 1366, 2849, 1408], "TERMINAL AIR BOX REPORT & DUCT MOUNTED HOT WATER REHEAT COIL GENERATION: DDC FMCS SHALL BE PROGRAMMED TO GENERATE THE FOLLOWING REPORT BASED ON A MANUAL COMMAND FROM THE DDC FMCS WORKSTATION BY CLICKING ON A GRAPHICAL BUTTON. UPON INITIATING COMMAND THE DDC FMCS SHALL COMPILE A REPORT AS FOLLOWS:"),
        a("m401-report-scope", 44, [2375, 1464, 2816, 1495], "WHEREAS THE SAMPLE REPORT ABOVE SHOWS ONLY A COUPLE TAB/COILS, THE FINAL PROGRAMMED REPORT SHALL LIST ALL TABS/COILS SERVED BY A SINGLE AHU. A SEPARATE REPORT SHALL BE PROGRAMMED FOR EACH AHU AND FOR EACH FLOOR."),
        a("m401-report-airflow-total", 44, [2375, 1507, 2782, 1527], "AFTER THE REPORT PRINTS OUT ALL TAB/HEATING COIL DATA, THE DDC FMCS SHALL AUTOMATICALLY TOTAL ALL THE INDIVIDUAL TAB AIRFLOW TO A SINGLE VALUE."),
        a("m401-report-ahu", 44, [2375, 1540, 2840, 1571], "AFTER PRINTING THE SUM OF THE TAB/HEATING COIL AIRFLOW CFM, THE DDC FMCS SHALL THEN AUTOMATICALLY PRINT OUT THE AIR HANDLER REPORT FOR THE AHU WHICH SERVES THE TABS/HEATING COILS LISTED IN THE REPORT."),
        a("m401-report-mass-setpoint-command", 44, [2375, 1584, 2846, 1636], "DDC FMCS SHALL ALLOW THE DDC FMCS OPERATOR TO ISSUE A SINGLE COMMAND THAT WILL AUTOMATICALLY CHANGE THE LOCAL SETPOINT FOR EACH TAB SERVED BY A AHU TO A SINGLE VALUE (E.G. A SINGLE COMMAND WILL SET ALL TABS/HEATING COILS SERVED BY AHU-A TO 80°F). A SEPARATE TAB/HEATING COIL SETPOINT OVERRIDE COMMAND SHALL BE PROGRAMMED IN THE FMCS FOR EACH AHU."),
        a("m402-vfd-fmcs-communications", 45, [2025, 1215, 2558, 1267], "SEQUENCE OF OPERATION: FMCS SHALL CONTROL EACH VFD AS DESCRIBED IN THE SEQUENCE OF OPERATION OF THE EQUIPMENT. DRIVE SHALL BE EQUIPPED BY THE VFD MANUFACTURER WITH A COMMUNICATION CARD THAT IS COMPATIBLE WITH THE FMCS CONTROL SYSTEM. TCC SHALL PROVIDE COMMUNICATIONS WIRING AND PROGRAMMING AS REQUIRED FOR THE FMCS TO COMMUNICATE WITH EACH VFD AS DESCRIBED BELOW."),
        a("m402-vfd-bypass-current-relay", 45, [2025, 1476, 2536, 1496], "TCC SHALL PROVIDE A CURRENT SENSING RELAY ON ANY VFD EQUIPPED WITH A BYPASS WHERE THE VFD STATUS OUTPUT DOES INDICATE THE MOTOR IS RUNNING WHEN THE VFD IS OPERATING IN BYPASS MODE."),
        a("m402-vfd-fault-alarm", 45, [2025, 1519, 2541, 1539], "AN ALARM SHALL BE INDICATED TO THE FMCS OPERATOR WORKSTATION IN THE EVENT A FAULT OR ERROR CONDITION OCCURS AT ANY VFD."),
        a("m402-vfd-minimum-rpm", 45, [2025, 1552, 2548, 1572], "TCC SHALL PROGRAM VFD TO ENSURE MOTOR RPM DOES NOT DROP BELOW MINIMUM REQUIRED BY MOTOR MANUFACTURER."),
        a("m403-steam-metered-via-ddc", 46, [1586, 1370, 1827, 1380], "THE STEAM IS METERED THROUGH DDC VIA FMCS."),
        a("m403-steam-trap-monitor", 46, [2275, 1381, 2738, 1391], "STEAM TRAP SHALL BE MONITORED BY ELECTRONIC TRAP PERFORMANCE MONITORING DEVICE."),
        a("m403-steam-trap-alarm", 46, [2275, 1414, 2749, 1434], "FMCS SHALL MONITOR ALARM CONTACTS PROVIDED WITH MONITORING. FMCS SHALL INDICATE AN ALARM AT THE FMCS OPERATOR INTERFACE IN THE EVENT IT RECEIVES ONE OF THE FOLLOWING"),
        a("m403-steam-trap-failure", 46, [2293, 1446, 2361, 1456], "TRAP FAILURE"),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Source-bounded control contexts and sequences for M401 terminal air boxes, M402 variable-frequency drives, and M403 steam metering/trap monitoring.",
        "tables": [], "assertions": assertions,
        "network_architecture": {
            "published_integration": [
                "M401 identifies a DDC FMCS workstation, terminal-air-box controller functions, graphical-button reporting, controller resets and setpoint override commands.",
                "M402 requires a VFD communication card compatible with the FMCS and communication wiring/programming by TCC.",
                "M403 states that steam is metered through DDC via FMCS and that trap-monitor contacts are monitored at the FMCS operator interface.",
            ],
            "boundary": "The supplied pages do not publish final network topology, controller addresses, I/O-card layout, field terminal schedule, protocol configuration, network media design or wire schedule.",
        },
        "sequence_inventory": [
            {"id": "terminal-air-box-reheat-and-static-reset", "sheet": "M401", "assertion_ids": [a["id"] for a in assertions[:7]]},
            {"id": "terminal-air-box-reporting", "sheet": "M401", "assertion_ids": [a["id"] for a in assertions[7:12]]},
            {"id": "vfd-integration-and-safeties", "sheet": "M402", "assertion_ids": [a["id"] for a in assertions[12:16]]},
            {"id": "steam-meter-and-trap-monitoring", "sheet": "M403", "assertion_ids": [a["id"] for a in assertions[16:]]},
        ],
        "control_boundaries": [
            "The source's terminology is retained exactly, including FMCS, TCC, TAB, HW, CV, DDC, and the printed conditional sequence language.",
            "Control clauses are not expanded into field-device, actuator, valve, damper, sensor, terminal, wire, controller, network, or installed-I/O counts.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
