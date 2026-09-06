"""Bounded M-702 sequences and M-703 DDC-context clauses for Rank 13."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "13__vol2__017"
OUT = AUDIT / "work" / IDENT / "controls_context_rank13.json"


def a(id_, page, bbox, expected):
    return {"id": id_, "page": page, "bbox": bbox, "expected": expected, "mode": "contains"}


def main():
    assertions = [
        # ACU A-1's published sequence family, M-702 right column.
        a("m702-a1-fan-time-schedule", 16, [2194, 329, 2730, 347],
          "THE DDC ACU CONTROLLER SHALL START AND STOP THE SUPPLY AND RETURN FANS BASED ON A TIME SCHEDULE"),
        a("m702-a1-preheat-low-outdoor", 16, [2194, 397, 2660, 413],
          "THE PREHEAT COIL VALVE SHALL BE OPEN WHEN OUTSIDE AIR TEMPERATURE IS BELOW 36 DEG. F."),
        a("m702-a1-freezestat-smoke-safety", 16, [2194, 419, 2768, 435],
          "SAFETY CONTROLS: PROVIDE A FREEZE STAT (FZ) AND SMOKE DETECTOR SAFETY DEVICES"),
        a("m702-a1-economizer", 16, [2194, 656, 2735, 672],
          "THE ECONOMIZER MODE WILL BE ALLOWED. IN ECONOMIZER MODE"),
        a("m702-a1-cooling-valve", 16, [2194, 701, 2752, 717],
          "MECHANICAL COOLING BY MODULATING THE COOLING COIL VALVE (V2)"),
        a("m702-a1-night-setback", 16, [2194, 847, 2757, 864],
          "A NIGHT SETBACK MODE SHALL BE PROVIDED FOR UNOCCUPIED HOURS."),
        a("m702-a1-night-setup", 16, [2194, 1005, 2747, 1021],
          "A NIGHT SETUP MODE SHALL BE PROVIDED FOR UNOCCUPIED HOURS."),
        a("m702-a1-airflow-stations", 16, [2194, 1343, 2765, 1359],
          "THE AIR FLOW MEASURING STATIONS (AFMS) FOR THE SUPPLY AIR, RETURN AIR AND OUTSIDE AIR FLOWS"),
        a("m702-a1-humidifier-high-limit", 16, [2194, 1545, 2765, 1561],
          "HUMIDIFIER OUTPUT SHALL BE SUBJECT TO DUCT HUMIDISTAT HIGH LIMIT SETPOINT (85%, ADJ.)."),
        # ACU A-2, M-702 center column: distinct reheat and zone-sensor sequence.
        a("m702-a2-reheat-preheat", 16, [870, 386, 1440, 413],
          "THE REHEAT VALVE IS CLOSE. THE PREHEAT COIL VALVE SHALL MODULATE TO MAINTAIN T2"),
        a("m702-a2-cooling-valve", 16, [870, 836, 1448, 852],
          "MECHANICAL COOLING BY MODULATING THE COOLING COIL VALVE (V2)"),
        a("m702-a2-zone-night-setback", 16, [870, 903, 1448, 920],
          "WHEN THE DDC SYSTEM ZONE SENSOR INDICATES THAT THE SPACE TEMPERATURE HAS FALLEN BELOW THE NIGHT SETBACK TEMPERATURE"),
        a("m702-a2-zone-night-setup", 16, [870, 1027, 1430, 1044],
          "WHEN THE DDC SYSTEM ZONE SENSOR INDICATES THAT THE SPACE TEMPERATURE HAS RISEN ABOVE THE NIGHT SETUP TEMPERATURE"),
        a("m702-a2-afms", 16, [870, 1308, 1443, 1325],
          "THE AIR FLOW MEASURING STATIONS (AFMS) FOR THE SUPPLY AIR, RETURN AIR AND OUTSIDE AIR FLOWS"),
        # ACU A-3/A-4/A-5/A-6, M-702 left-center column: separate exhaust-fan system family.
        a("m702-a3a6-fan-time-schedule", 16, [1551, 329, 2090, 347],
          "THE DDC ACU CONTROLLER SHALL START AND STOP THE SUPPLY AND EXHAUST FANS BASED ON A TIME SCHEDULE"),
        a("m702-a3a6-night-setback", 16, [1551, 847, 2115, 864],
          "A NIGHT SETBACK MODE SHALL BE PROVIDED FOR UNOCCUPIED HOURS."),
        a("m702-a3a6-afms", 16, [1551, 1274, 2123, 1291],
          "THE AIR FLOW MEASURING STATIONS (AFMS) FOR THE SUPPLY AIR, RETURN AIR AND OUTSIDE AIR FLOWS"),
        # M-703 governs how the published source matrices may be used.
        a("m703-existing-reference-only", 17, [1898, 685, 2210, 702],
          "ALL POINTS ARE EXISTING TO REMAIN AND SHOWN FOR REFERENCE ONLY."),
        a("m703-alarm-email", 17, [1898, 714, 2238, 731],
          "ALARM SIGNALS SHALL NOTIFY UP TO 3 PEOPLE VIA E-MAIL AS DIRECTED BY NIST."),
        a("m703-campus-ddc-visible", 17, [1898, 724, 2155, 741],
          "ALL POINTS SHALL BE VISIBLE TO THE CAMPUS DDC SYSTEM."),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Source-bounded M-702 ACU sequences and M-703 DDC source-matrix integration context.",
        "tables": [], "assertions": assertions,
        "network_architecture": {
            "published_integration": [
                "M-703 says all points are visible to the Campus DDC system.",
                "M-703 says alarm signals shall notify up to three people by e-mail as directed by NIST.",
            ],
            "boundary": "Neither M-702 nor M-703 publishes controller addresses, controller/card assignment, terminal counts, wiring, protocol configuration, network-media design, or a physical I/O/device total.",
            "assertion_ids": ["m703-alarm-email", "m703-campus-ddc-visible"],
        },
        "sequence_inventory": [
            {"id": "acu-a1-sequence", "sheet": "M-702", "assertion_ids": [x["id"] for x in assertions[:9]]},
            {"id": "acu-a2-sequence", "sheet": "M-702", "assertion_ids": [x["id"] for x in assertions[9:14]]},
            {"id": "acu-a3-a6-sequence", "sheet": "M-702", "assertion_ids": [x["id"] for x in assertions[14:17]]},
            {"id": "m703-existing-template-boundary", "sheet": "M-703", "assertion_ids": [x["id"] for x in assertions[17:]]},
        ],
        "sensors_and_control_symbol_context": {
            "published_context": "M-702 specifies freeze-stat and smoke-detector safety devices, zone-temperature-sensor involvement, and AFMS monitoring in the retained ACU sequence clauses.",
            "assertion_ids": ["m702-a1-freezestat-smoke-safety", "m702-a2-zone-night-setback", "m702-a1-airflow-stations"],
            "boundary": "These are source sequence contexts, not a counted equipment, zone, sensor, actuator, or field-device inventory.",
        },
        "control_boundaries": [
            "The text is retained as printed conditional control logic; no design intent is expanded into device, actuator, valve, damper, terminal, controller, wiring, or installed-I/O quantities.",
            "M-703 explicitly scopes its points as existing-to-remain reference information. Its 60 literal matrix rows are therefore not a final physical point, controller, or field-device takeoff.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
