"""Bounded MI700 BACnet architecture and controls-symbol context for Rank 11."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "11__vol1__05"
OUT = AUDIT / "work" / IDENT / "controls_context.json"


def a(id_, bbox, expected):
    return {"id": id_, "page": 49, "bbox": bbox, "expected": expected, "mode": "exact"}


def main():
    assertions = [
        a("mi700-temperature-transmitter", [298, 224, 440, 234], "TEMPERATURE TRANSMITTER"),
        a("mi700-static-pressure-sensor", [298, 362, 430, 372], "STATIC PRESSURE SENSOR"),
        a("mi700-pressure-differential-transmitter", [298, 528, 491, 538], "PRESSURE DIFFERENTIAL TRANSMITTER"),
        a("mi700-low-freezestat", [298, 695, 509, 704], "TEMPERATURE SWITCH, LOW (FREEZESTAT)"),
        a("mi700-high-freezestat", [298, 727, 511, 737], "TEMPERATURE SWITCH, HIGH (FREEZESTAT)"),
        a("mi700-carbon-dioxide", [741, 279, 894, 288], "CARBON DIOXIDE TRANSMITTER"),
        a("mi700-variable-speed-controller", [741, 456, 929, 466], "VARIABLE SPEED MOTOR CONTROLLER"),
        a("mi700-valve-damper-position", [298, 628, 505, 638], "VALVE OR DAMPER POSITION CONTROLLER"),
        a("mi700-bacnet-install-software", [1995, 549, 2224, 569], "INSTALL NEW BACNET SOFTWARE ON EXISTING ENGINEERING CONTROL CENTER (ECC)."),
        a("mi700-bacnet-reuse-network", [1995, 570, 2215, 580], "REUSE EXISTING COMMUNICATION NETWORK."),
        a("mi700-bacnet-multiple-building-controllers", [1995, 592, 2275, 602], "INSTALL MULTIPLE BUILDING CONTROLLERS AS REQUIRED."),
        a("mi700-bacnet-new-controllers", [1995, 603, 2277, 613], "INSTALL NEW CONTROLLERS (B-AAC, B-ASC) AS REQUIRED."),
        a("mi700-bacnet-architecture-title", [1661, 649, 1942, 667], "BACNET SYSTEM ARCHITECTURE"),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Source-bounded MI700 BACnet network-architecture and controls-symbol context.",
        "tables": [], "assertions": assertions,
        "network_architecture": {
            "published_protocol": "BACnet",
            "published_integration": [
                "MI700 directs installation of new BACnet software on existing controllers that remain and reuse of the existing communication network.",
                "MI700 calls for multiple building controllers and new B-AAC/B-ASC controllers as required.",
            ],
            "boundary": "The architecture diagram does not publish a final controller address list, point-to-controller assignment, I/O-card layout, terminal schedule, network-media engineering, wire schedule, or physical point count.",
        },
        "sensors_and_control_symbol_context": {
            "legend_assertion_ids": [a_["id"] for a_ in assertions[:8]],
            "boundary": "The legend states available symbol meanings; it does not establish installed device quantities or per-zone totals.",
        },
        "sequence_inventory": [{"id": "bacnet-system-architecture", "sheet": "MI700", "assertion_ids": [a_["id"] for a_ in assertions[8:]]}],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

if __name__ == "__main__":
    main()
