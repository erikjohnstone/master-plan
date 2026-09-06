"""Bounded H-601 sequence clauses and E-603 controller-wiring context for Rank 20."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "20__vol2__097"
OUT = AUDIT / "work" / IDENT / "controls_context_rank20.json"


def a(id_, page, bbox, expected):
    return {"id": id_, "page": page, "bbox": bbox, "expected": expected, "mode": "contains"}


def main():
    assertions = [
        a("h601-controls-discipline-split", 13, [1726, 160, 2115, 182], "CONTROL WORK IS DIVIDED BETWEEN THE PROJECT ELECTRICIAN (DIV. 26)"),
        a("h601-labeled-terminal-strips", 13, [1726, 688, 2020, 709], "ALL WIRING SHALL TERMINATE AT LABELED TERMINAL STRIPS."),
        a("h601-mau-enables-exf", 13, [1726, 799, 2158, 820], "WHENEVER MAU-1 RUNS, EXF-1 IS ENABLED TO RUN IN LOW OR HIGH MODE TO MATCH"),
        a("h601-mau-low-mode", 13, [1726, 829, 2110, 850], "IN AUTO, MAU-1 IS ENABLED TO RUN IN LOW MODE (2,000 CFM) WHENEVER:"),
        a("h601-mau-factory-thermostat", 13, [1735, 844, 2060, 865], "COOLING/HEATING IS CALLED FOR BY THE FACTORY THERMOSTAT."),
        a("h601-mau-tork-timer", 13, [1735, 874, 1952, 895], "A TORK TIMER (STYLE 8009A) IS ENABLED."),
        a("h601-mau-high-mode", 13, [1726, 889, 2070, 910], "MAU-1 IS ENABLED TO RUN IN HIGH MODE (4,000 CFM) WHENEVER:"),
        a("h601-mau-vfd-safety", 13, [1726, 1009, 2125, 1031], "INTERLOCK THE SUPPLY VARIABLE FREQUENCY DRIVE TO THE SAFETIES RELAY TO"),
        a("h601-mau-smoke-freeze", 13, [1726, 1024, 2145, 1046], "SHUTDOWN THE UNIT UPON SMOKE DETECTION OR FREEZING CONDITIONS"),
        a("h601-hv-enables-fans", 13, [1726, 1094, 2040, 1115], "WHENEVER HV-1 RUNS, EF-1 AND EF-2 ARE ENABLED TO RUN."),
        a("h601-hv-auto", 13, [1726, 1110, 1972, 1131], "IN AUTO, HV-1 IS ENABLED TO RUN WHENEVER:"),
        a("h601-hv-smoke-freeze", 13, [1726, 1214, 2125, 1236], "INTERLOCK THE SUPPLY VARIABLE FREQUENCY DRIVE TO THE SAFETIES RELAY TO"),
        a("h601-louvers-powered-open", 13, [1726, 1305, 2060, 1327], "WHENEVER EF-3 AND EF-4 RUN, L-1 AND L-2 ARE POWERED OPEN."),
        a("h601-ef3ef4-auto", 13, [1726, 1320, 2027, 1342], "IN AUTO, EF-3 AND EF-4 ARE ENABLED TO RUN WHENEVER:"),
        a("h601-ef3ef4-cooling", 13, [1735, 1335, 1975, 1357], "COOLING IS CALLED FOR BY THE THERMOSTAT."),
        a("h601-unit-heater-sequence", 13, [1726, 1456, 2158, 1478], "WHEN THE THERMOSTAT CALLS FOR HEATING, UNIT HEATERS UH-1 AND UH-2 SHALL BE"),
        a("h601-unit-heater-setpoint", 13, [1726, 1501, 2145, 1523], "SET THERMOSTAT SET POINT TO 45°F (ADJUSTABLE)."),
        a("e603-factory-thermostat", 25, [525, 210, 600, 243], "FACTORY THERMOSTAT"),
        a("e603-chlorine-tork-timer", 25, [528, 360, 596, 382], "TORK TIMER"),
        a("e603-chlorine-run-low", 25, [810, 248, 865, 271], "RUN LOW"),
        a("e603-chlorine-run-high", 25, [810, 528, 855, 550], "RUN HI"),
        a("e603-hf-controller-links", 25, [1823, 233, 1938, 255], "TO HV-1 CONTROLLER"),
        a("e603-hf-ef1-controller", 25, [1823, 323, 1938, 345], "TO EF-1 CONTROLLER"),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Source-bounded H-601 control sequences and E-603 wiring-diagram context.",
        "tables": [], "assertions": assertions,
        "network_architecture": {
            "published_integration": [
                "H-601 divides control work between the project electrician and specialty controls contractor and says wiring terminates at labeled terminal strips.",
                "E-603 visibly names factory thermostats, Tork timers, high/low-speed commands, and controller link destinations in its wiring diagrams.",
            ],
            "boundary": "The supplied set does not publish a BAS protocol, controller-address list, point-to-controller binding, I/O-card layout, LAN topology, network-media specification, final terminal count, or field-device count.",
            "assertion_ids": ["h601-controls-discipline-split", "h601-labeled-terminal-strips", "e603-hf-controller-links", "e603-hf-ef1-controller"],
        },
        "sequence_inventory": [
            {"id": "mau-1-and-exf-1-low-high-control", "sheet": "H-601", "assertion_ids": [x["id"] for x in assertions[2:9]]},
            {"id": "hv-1-ef-1-ef-2-control", "sheet": "H-601", "assertion_ids": [x["id"] for x in assertions[9:12]]},
            {"id": "ef-3-ef-4-louver-control", "sheet": "H-601", "assertion_ids": [x["id"] for x in assertions[12:15]]},
            {"id": "unit-heater-control", "sheet": "H-601", "assertion_ids": [x["id"] for x in assertions[15:17]]},
            {"id": "speed-controller-wiring-context", "sheet": "E-603", "assertion_ids": [x["id"] for x in assertions[17:]]},
        ],
        "sensors_and_control_symbol_context": {
            "published_context": "H-601 sequences explicitly use factory thermostats, a Tork timer, smoke/freezing safeties, and VFD safety interlocks; E-603 depicts the related controller-wiring labels.",
            "assertion_ids": ["h601-mau-factory-thermostat", "h601-mau-tork-timer", "h601-mau-smoke-freeze", "e603-factory-thermostat"],
            "boundary": "The published control functions and wiring labels are not expanded into counted sensors, timers, relays, actuators, controllers, terminals, conductors, I/O or zone quantities.",
        },
        "control_boundaries": [
            "Control language is preserved as printed. No source clause is transformed into a physical device/actuator/valve/damper/controller/card/wire count.",
            "The wiring drawings show functional relationships but are not a final controller bill of materials, connection schedule, field termination schedule or BAS network design.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
