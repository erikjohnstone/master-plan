"""Write bounded controls-context evidence for Colville rank 03.

These are deliberately authored source citations.  They neither derive field
I/O from sequence prose nor turn diagram symbols into additional equipment.
"""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "ground_truth" / "work" / "03__vol1__27"
IDENT = "03__vol1__27"


controls_context = {
    "document_id": IDENT,
    "module_role": "Source-bounded BAS network, diagram and written-sequence context for the White Sturgeon Fish Hatchery. The PLC I/O list remains the authoritative point ledger; written sequences are not expanded into unprinted field I/O or controller terminals.",
    "controls_sources": [
        "M-702 / PDF p18 — mechanical control diagrams and written fan, unit-heater and HWP-5/6 sequences",
        "M-703 / PDF p19 — White Sturgeon rearing-water sequence of operation",
        "E-501 / PDF p33 — control network and pump/lift-station diagrams",
        "E-702 / PDF p38 — White Sturgeon PLC I/O list",
    ],
    "network_architecture": {
        "literal_protocols": [
            {"protocol": "ETHERNET/IP", "source": "E-702 PLC I/O list; literal pump rows HWP-1 through EP-4"},
            {"protocol": "BACNET /IP", "source": "E-702 PLC I/O list; literal BS-1 PNL and WSHP-1 rows"},
            {"protocol": "MODBUS TCP/IP", "source": "E-702 PLC I/O list; literal Fish Hatchery Control Panel row"},
        ],
        "diagrammed_components": [
            "Allen-Bradley CompactLogix 5380 controller",
            "Compact 5000 I/O modules",
            "PanelView Plus 7 terminals",
            "Ethernet Tap",
            "two control-panel contexts and BACnet/IP/alarm connections",
        ],
        "not_stated": [
            "network addresses, subnet/VLAN values and controller card/terminal totals",
            "final field wiring termination count beyond the literal E-702 source rows",
        ],
    },
    "sequence_of_operations": {
        "M-702": {
            "sheet": "M-702", "page": 18,
            "systems": [
                "EF-1/EF-2 manual-switch and interlocked louver operation",
                "EF-3 continuous ventilation, refrigerant-detection response and alarms",
                "UH-1 through UH-7 thermostat/valve-position behavior",
                "HWP-5/HWP-6 lead/lag, outside-air enable and differential-pressure control",
            ],
            "assertion_ids": ["m702-ef12-manual", "m702-ef3-refrigerant", "m702-unit-heater-enable", "m702-hwp-oat-enable", "m702-hwp-dp-control"],
        },
        "M-703": {
            "sheet": "M-703", "page": 19,
            "systems": [
                "White Sturgeon rearing water temperature and redundancy logic",
                "BS-1 pressure booster / BACnet-IP status context",
                "WSHP-1 five-module master-control-panel coordination",
                "pump lead/lag, speed-control and flow/temperature control logic",
            ],
            "assertion_ids": ["m703-high-level-temperature", "m703-bs1-bacnet", "m703-wshp-modules", "m703-wshp-pump-start", "m703-wshp-pump-speed"],
        },
        "scope_warning": "Sequence assertions identify published behavior and setpoints. They do not assert every sentence in the drawings, derive all possible alarms, or create an installed I/O or actuator count beyond E-702 and the literal schedules.",
    },
    "control_diagram_bindings": [
        {"sheet": "M-702", "diagram": "EXHAUST FAN CONTROL DIAGRAM", "equipment_scope": "EF-1, EF-2 and LV-1/LV-2"},
        {"sheet": "M-702", "diagram": "MECH RM EXHAUST FAN CONTROL DIAGRAM", "equipment_scope": "EF-3 and LV-3; AO speed, DO start/stop and DI status are visually diagrammed"},
        {"sheet": "M-702", "diagram": "HYDRONIC PUMP CONTROL DIAGRAM", "equipment_scope": "HWP-5 and HWP-6; AI differential pressure, AO speed, DO start/stop and DI status are visually diagrammed"},
        {"sheet": "M-702", "diagram": "UNIT HEATER CONTROL DIAGRAMS", "equipment_scope": "UH-1 through UH-7; dedicated thermostat and valve position are visually diagrammed"},
    ],
    "sensor_and_zone_ledger": {
        "literal_sensors_and_controls": [
            "TE-300 outdoor-air temperature sensor in M-702 diagram and E-702 PLC I/O list",
            "DPIT-117 differential pressure in M-702 diagram and E-702 PLC I/O list",
            "dedicated thermostats for unit-heater diagrams; no source-wide physical thermostat quantity is inferred from diagram templates",
            "refrigerant detection shown for EF-3 and listed in E-702",
        ],
        "not_stated": ["facility-wide installed thermostat count", "CO2 sensor count", "space-sensor zoning count"],
    },
    "tables": [],
    "assertions": [
        {"id": "m702-ef12-manual", "page": 18, "bbox": [580, 680, 1180, 770], "expected": "THESE FANS AND ASSOCIATED LOUVERS SHALL BE OPERATED BY A MANUAL SWITCH", "mode": "contains"},
        {"id": "m702-ef3-refrigerant", "page": 18, "bbox": [580, 785, 1180, 940], "expected": "REFRIGERANT DETECTOR DETECTS A LEVEL OF REFRIGERANT ABOVE THE MAXIMUM ALLOWABLE LEVEL", "mode": "contains"},
        {"id": "m702-unit-heater-enable", "page": 18, "bbox": [1220, 680, 1840, 780], "expected": "IF THE ZONE TEMPERATURE DROPS BELOW SETPOINT", "mode": "contains"},
        {"id": "m702-hwp-oat-enable", "page": 18, "bbox": [1220, 775, 1840, 850], "expected": "PUMPS SHALL BE ENERGIZED WHEN OUTSIDE AIR TEMPERATURE IS BELOW SETPOINT", "mode": "contains"},
        {"id": "m702-hwp-dp-control", "page": 18, "bbox": [1220, 980, 1840, 1020], "expected": "MODULATE THE PUMP SPEED TO MAINTAIN THE END OF LINE DIFFERENTIAL PRESSURE SET POINT", "mode": "contains"},
        {"id": "m703-high-level-temperature", "page": 19, "bbox": [970, 315, 1540, 380], "expected": "SYSTEM WILL GENERATE TEMPERED AERATED WATER (TAW) AT 72°F", "mode": "contains"},
        {"id": "m703-bs1-bacnet", "page": 19, "bbox": [970, 410, 1530, 455], "expected": "BS-1 STATUS WILL BE MONITORED BY THE PLC BY A BACNET/IP INTERFACE", "mode": "contains"},
        {"id": "m703-wshp-modules", "page": 19, "bbox": [935, 465, 1530, 495], "expected": "WSHP-1 HAS FIVE MODULES AND A MASTER CONTROL PANEL (MCP) TO SEQUENCE THE MODULES", "mode": "contains"},
        {"id": "m703-wshp-pump-start", "page": 19, "bbox": [950, 495, 1530, 510], "expected": "MCP WILL START WSHP-1 AND CALL FOR THE CENTRAL PLC TO START HWP-1, HWP-2, HWP-3, HWP-4, EP-1, EP-2, EP-3, EP-4, CP-1, AND CP-2", "mode": "contains"},
        {"id": "m703-wshp-pump-speed", "page": 19, "bbox": [970, 510, 1530, 525], "expected": "MODULATE THE SPEED OF PUMPS EP-1, EP-2, HWP-1, AND HWP-2 TO MEET REQUIRED FLOW AT WSHP-1", "mode": "contains"},
    ],
}


def write(name, payload):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


write("controls_context_rank03.json", controls_context)
