"""Author source-bounded M6.4/M6.5 laboratory control-zone bindings."""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "ground_truth" / "work" / "04__vol2__062"
IDENT = "04__vol2__062"


def mapping_table(identifier, sheet, page, title, columns, x_edges, y_ranges, rows, scope):
    return {
        "id": identifier,
        "sheet": sheet,
        "page": page,
        "title_as_printed": title,
        "columns": columns,
        "x_edges": x_edges,
        "y_ranges": y_ranges,
        "rows": rows,
        "binding_scope": scope,
        "row_semantics": "One printed laboratory/control-system mapping row. Repeated room text is retained under its M6.4/M6.5 source context; it is not silently collapsed into a global device or point count.",
    }


def main():
    data = {
        "document_id": IDENT,
        "module_role": "Cell-bounded laboratory-zone control bindings from M6.4 and M6.5. These tables preserve the printed room-to-air-valve/reheat-coil/control-valve relationships while keeping separate systems and source scopes distinct.",
        "sensor_and_zone_context": {
            "source_scoped_sensor_context": [
                "M6.4 multiple-hood and snorkel system prose explicitly names a space temperature and humidity sensor, and its diagrams visually show space temperature/humidity sensor, hood-switch and valve-control contexts.",
                "M6.5 general-exhaust system prose explicitly names a space temperature and humidity sensor; the visual schematic adds a space-pressure sensor only for D-1 Lab 123.",
                "M6.5 electric-unit-heater sequence uses a thermostat/room-temperature sensor context for EH-1 through EH-9.",
            ],
            "count_boundary": "The printed mapping tables bind nine control-zone rows but do not establish a project-wide installed count of temperature/humidity sensors, CO2 sensors, smart thermostats, controller terminals or field wiring. No multiplier is inferred from a repeated schematic template.",
            "source_system_boundary": "M6.4's snorkel mappings and M6.5's general-exhaust mappings can reference the same room name under distinct printed control-system contexts; this record preserves both instead of deduplicating them.",
        },
        "tables": [
            mapping_table("M64-MULTIPLE-HOODS-LAB-BINDINGS", "M6.4", 20, "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM", "lab_space|supply_air_valve|general_exhaust_valve|snorkel_exhaust_valve|heating_coil|heating_valve", [170, 275, 330, 400, 480, 550, 610],
                          [[234, 250], [250, 261], [261, 273], [273, 285]], [
                              "ASPHALT LAB 117|SAV-7|GEV-5|SEV-5|HC-7|CV-7",
                              "ASPHALT LAB 124|SAV-3|GEV-1|SEV-3|HC-3|CV-3",
                              "GENERAL LAB 125|SAV-9|GEV-2|N/A|HC-9|CV-9",
                              "RESIDENCY LAB 131|SAV-1|GEV-1|SEV-1|HC-1|CV-1",
                          ], "M6.4 multiple-hood laboratory ventilation system."),
            mapping_table("M64-SNORKEL-LAB-BINDINGS", "M6.4", 20, "LAB VENTILATION WITH SNORKEL HOOD SYSTEM", "lab_space|supply_air_valve|snorkel_exhaust_valve|heating_coil|heating_valve", [1235, 1370, 1420, 1500, 1560, 1620],
                          [[260, 277], [277, 292]], [
                              "RESIDENCY NOISE ROOM 130|SAV-8|SEV-2|HC-8|CV-8",
                              "MATERIAL LAB 118|SAV-6|SEV-4|HC-6|CV-6",
                          ], "M6.4 snorkel-hood laboratory ventilation system."),
            mapping_table("M65-GENERAL-EXHAUST-LAB-BINDINGS", "M6.5", 21, "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM", "lab_space|supply_air_valve|general_exhaust_valve|heating_coil|heating_valve", [450, 560, 615, 690, 750, 800],
                          [[286, 303], [303, 314], [314, 326]], [
                              "CONCRETE 119|SAV-5|GEV-6|HC-5|CV-5",
                              "MATERIAL LAB 118|SAV-2|GEV-7|HC-2|CV-2",
                              "D-1 LAB 123|SAV-4|GEV-4|HC-4|CV-4",
                          ], "M6.5 general-exhaust laboratory ventilation system."),
        ],
        "assertions": [
            {"id": "m64-multiple-hood-sensor", "page": 20, "bbox": [170, 85, 650, 116], "expected": "SPACE TEMPERATURE AND HUMIDITY SENSOR. THE CONTROL CONTRACTOR SHALL PROVIDE A NEW DDC CONTROL PACKAGE DEDICATED TO THE", "mode": "contains"},
            {"id": "m64-integration-gateway", "page": 20, "bbox": [170, 132, 650, 150], "expected": "THE AIR VALVE MANUFACTURER SHALL PROVIDE AN INTEGRATION GATEWAY TO FACILITATE COMMUNICATION BETWEEN", "mode": "exact"},
            {"id": "m65-general-exhaust-sensor", "page": 21, "bbox": [450, 105, 900, 125], "expected": "INDEPENDENT GENERAL EXHAUST VALVE, AND A SPACE TEMPERATURE AND HUMIDITY SENSOR. THE CONTROL", "mode": "exact"},
            {"id": "m65-unit-heater-thermostat", "page": 21, "bbox": [1660, 870, 2050, 892], "expected": "WHEN THE ABOVE CONDITION EXISTS THE THERMOSTAT SHALL SEQUENCE THE FOLLOWING:", "mode": "exact"},
        ],
        "inventory_checks": [{"id": "rank04-lab-zone-binding-tables", "records_path": ["tables"], "expected": 3, "unique_key": "id"}],
    }
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "controls_lab_zone_bindings.json").write_text(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
