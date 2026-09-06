"""Bounded Rank 08 fuel-oil and packaged-water-heater control context."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "08__vol2__044"
OUT = AUDIT / "work" / IDENT / "controls_sequences.json"


def a(id_, page, bbox, expected):
    return {"id": id_, "page": page, "bbox": bbox, "expected": expected, "mode": "exact"}


def main():
    assertions = [
        a("mi605-general-scope", 29, [1820, 270, 2315, 287], "1. THIS SEQUENCE APPLIES TO THE FUEL OIL SYSTEM FEEDING THE NEW EMERGENCY GENERATOR."),
        a("mi605-general-availability", 29, [1820, 282, 2150, 298], "2. SYSTEM SHALL BE AVAILABLE FOR OPERATIONAL AT ALL TIMES."),
        a("mi605-general-standby-power", 29, [1820, 293, 2320, 310], "3. ALL EQUIPMENT ASSOCIATED WITH THE GENERATOR SHALL BE CONNECTED TO STANDBY POWER."),
        a("mi605-critical-low-level", 29, [1820, 338, 2345, 356], "1. CRITICAL LOW LEVEL SWITCH AT 20% SHALL GENERATE A CRITICAL DAY TANK LEVEL ALARM AT THE BMS."),
        a("mi605-low-level", 29, [1820, 350, 2210, 368], "2. LEVEL SWITCH AT 40% SHALL GENERATE A LOW LEVEL ALARM AT THE BMS."),
        a("mi605-high-level-90", 29, [1820, 361, 2372, 379], "3. LEVEL SWITCH AT 90% SHALL CAUSE THE SHUT DOWN OF THE PUMPS AND CLOSURE OF THE DAY TANK. VALVE."),
        a("mi605-high-level-95", 29, [1820, 373, 2256, 390], "4. HIGH LEVEL AT 95% SHALL ENERGIZED THE RETURN PUMP ON UNTIL IT DROPS TO 90%."),
        a("mi605-leak-detector", 29, [1820, 408, 2440, 423], "6. LEAK DETECTOR SHALL CAUSE THE SHUTDOWN OF THE PUMPS. THE OIL IN RUPTURE VESSEL ALARM SHALL BE GENERATED AT"),
        a("mi605-pump-failure-delay", 29, [1820, 465, 2420, 480], "1. PUMP FAILURE ALARM SHALL BE GENERATED AT THE BMS IF THE PUMP IS COMMANDED TO RUN AND AFTER 15 SECONDS"),
        a("mi605-containment-low-points", 29, [1820, 522, 2330, 538], "1. LEAK DETECTION SHALL BE PLACED AT ALL LOW POINTS IN THE FOS AND FOR CONTAINMENT PIPING."),
        a("mi605-day-tank-lead-start", 29, [1820, 568, 2399, 582], "1. CONTROL VALVE TO OPEN, PROVEN OPEN AND LOW LEVEL SWITCH AT 50% SHALL CAUSE THE LEAD PUMP TO START."),
        a("mi605-day-tank-90-close", 29, [1820, 602, 2360, 618], "3. HIGH LEVEL SWITCH AT 90% FULL SHALL CAUSE THE PUMP TO SHUT DOWN AND CONTROL VALVE TO CLOSE."),
        a("mi605-day-tank-95-return", 29, [1820, 614, 2405, 630], "4. HIGH LEVEL SWITCH AT 95% SHALL ENERGIZE THE RETURN PUMP AND SHALL REMAIN ON UNTIL LEVEL DROPS TO 90%."),
        a("mi605-day-tank-lead-lag", 29, [1820, 637, 2410, 652], "6. THE BAS SYSTEM SHALL ALTERNATE THE LEAD/LAG POSITION OF THE PUMPS IN THE DUPLEX PAIR AFTER EACH CYCLE."),
        a("mi605-existing-panel", 29, [1820, 681, 2015, 699], "1. THE CONTROL PANEL IS EXISTING."),
        a("mi605-six-leak-sensors", 29, [1820, 704, 2260, 721], "3. CONTROL PANEL SHALL BE EQUIPPED TO MONITOR 6 DISCRIMINATING LEAK SENSORS."),
        a("mi605-building-bas", 29, [1820, 808, 2305, 824], "7. SYSTEM SHALL HAVE THE CAPABILITY TO SIMULTANEOUSLY COMMUNICATE WITH BUILDING BAS."),
        a("mi605-alc-tie-in", 29, [1820, 820, 2205, 837], "8. ALL CONTROL POINTS SHOWN SHALL BE TIED INTO ALC CONTROL SYSTEM,"),
        a("mi607-bacnet-interface", 31, [370, 1766, 1010, 1782], "1. DOMESTIC HOT WATER HEATER PACKAGE PROVIDED BY DIV.22. CONTROLLER IS BEING PROVIDED WITH BACNET/IP INTERFACE."),
        a("mi607-package-sequence", 31, [370, 1812, 950, 1828], "2. SEQUENCE OF OPERATION: ALL CONTROL SEQUENCES SHALL BE PERFORMED BY THE PACKAGE CONTROL SYSTEM"),
        a("mi607-alc-tie-in", 31, [370, 1835, 800, 1852], "3. ALL CONTROL POINTS SHOWN SHALL BE TIED INTO BOILER ALC CONTROL SYSTEM,"),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Source-bounded controls context for the MI-605 generator fuel-oil system and the MI-607 packaged domestic-water-heater interface.",
        "tables": [], "assertions": assertions,
        "network_architecture": {
            "published_transport_and_integration": [
                "MI-605 says the fuel-oil system can simultaneously communicate with building BAS and that its shown points tie into the ALC control system.",
                "MI-607 states that the package controller is provided with a BACnet/IP interface and that shown points tie into the boiler ALC control system.",
            ],
            "boundary": "The supplied sheets do not publish a final BAS network topology, controller address list, I/O-card layout, terminal schedule, wiring diagram, or definitive field-device count.",
        },
        "sequence_inventory": [
            {"id": "generator-fuel-oil-system", "sheet": "MI-605", "assertion_ids": [a["id"] for a in assertions[:18]]},
            {"id": "packaged-domestic-water-heater", "sheet": "MI-607", "assertion_ids": [a["id"] for a in assertions[18:]]},
        ],
        "control_boundaries": [
            "The source's apparent wording and grammar, including 'SHALL ENERGIZED' and 'DAY TANK. VALVE.', are retained exactly in bounded assertions rather than silently corrected.",
            "The published point lists and sequence clauses are not expanded into physical controller, I/O, sensor, valve, actuator, wiring, or installation counts.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
