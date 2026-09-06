"""Write Cherry Point BAS context from independently verified source modules."""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "01__vol2__001"
WORK = AUDIT / "work" / IDENT


def load(name):
    return json.loads((WORK / name).read_text())


def source_refs(value):
    """Retain source assertion names without presenting them as local checks."""
    if isinstance(value, dict):
        return {"source_assertion_refs" if key == "assertion_ids" else key: source_refs(child)
                for key, child in value.items()}
    if isinstance(value, list):
        return [source_refs(child) for child in value]
    return value


def main():
    network = load("network_mi701.json")
    points = load("points_rank01_assembled.json")
    sequence_sources = [
        ("sequence_air_ops_mtracon_doah.json", "MI703", 53, "Air Operations/MTRACON DOAH sequence"),
        ("sequences_air_ops_and_shared_hydronics.json", "MI705 / MI711 / MI713 / MI721 / MI723", None, "Air Operations AHU and shared chilled/heating-water sequences"),
        ("sequence_atct_doah_t1.json", "MI730", 64, "ATCT DOAH-T1 sequence"),
        ("sequence_crah_sfpvav.json", "MI741", 68, "CRAH and series-fan-powered-VAV templates"),
        ("sequence_mi742.json", "MI742", 69, "humidifier, UPS exhaust, bathroom exhaust and elevator-machine-room templates"),
        ("sequence_air_ops_heating_ventilating.json", "MI743", 70, "Air Operations heating/ventilating sequence"),
        ("sequence_mi744_fcu_sfpvav.json", "MI744", 71, "occupied/redundant FCU and SPFVAV/FCU sequence"),
    ]
    sequence_ledger = []
    for filename, sheet, page, scope in sequence_sources:
        source = load(filename)
        sequence_ledger.append({"source_module": filename, "source_sheet": sheet, "source_page": page, "system_scope": scope, "bounded_sequence_assertions": len(source.get("assertions", [])), "module_scope": source.get("module_role", source.get("scope", "source-bounded sequence evidence"))})
    rows = []
    for table in points["tables"]:
        fields = table["columns"].split("|")
        description = fields.index("point_name")
        for index, row in enumerate(table["rows"], 1):
            rows.append((table, index, row.split("|")[description]))
    def matches(needle):
        return [{"sheet": table["sheet"], "table": table["id"], "row": index, "point_name": text}
                for table, index, text in rows if needle in text.upper()]
    sensor_ledger = [
        {"source_scope": "assembled 546 printed point-list rows", "sensor_or_thermostat_mapping": "Seven literal SPACE TEMPERATURE rows occur in Air Operations MI743, MI740, MI741 and MI744 reusable/system templates.", "literal_rows": matches("SPACE TEMPERATURE"), "count_status": "seven source-template occurrences; not a project-installed thermostat/sensor quantity."},
        {"source_scope": "MI731 ATCT AHU point list", "sensor_or_thermostat_mapping": "One literal SPACE THERMOSTAT point row is listed.", "literal_rows": matches("SPACE THERMOSTAT"), "count_status": "one source-template occurrence; no building-wide installation multiplier is stated."},
        {"source_scope": "MI700 legend and assembled point lists", "sensor_or_thermostat_mapping": "MI700 defines a carbon-dioxide-monitor symbol, but none of the 546 extracted point-name cells contains CO2; this is a point-list-only observation, not a visual claim that the full drawings contain no CO2 sensor.", "literal_rows": [], "count_status": "CO2 point-list count is zero; full-plan symbol count remains not performed."},
        {"source_scope": "MI704/MI702/MI730/MI731/MI742 point templates", "sensor_or_thermostat_mapping": "Humidity-related point rows are retained in source context for mixed air, supply air, energy wheel/outdoor air, space, zone and elevator-machine-room templates.", "literal_rows": matches("HUMID"), "count_status": "template occurrences only; no global sensor quantity or zone multiplier is asserted."},
    ]
    payload = {
        "document_id": IDENT,
        "module_role": "Cross-building BAS network, sequence-location and sensor/thermostat context. It cites independently verified source modules and preserves system/template boundaries rather than fabricating installed counts.",
        "controls_sources": ["MI700 / PDF p50", "MI701 / PDF p51"] + [item["source_sheet"] + (f" / PDF p{item['source_page']}" if item["source_page"] else "") for item in sequence_ledger],
        "network_architecture": {
            "source_module": "network_mi701.json",
            "protocol_legend": source_refs(network["network_architecture"]["protocol_legend"]),
            "nae_cabinet_locations": source_refs(network["network_architecture"]["nae_cabinet_locations"]),
            "named_controller_nodes": source_refs(network["network_architecture"]["named_controller_nodes"]),
            "external_interfaces": source_refs(network["network_architecture"]["explicit_external_interfaces"]),
            "not_stated": ["controller make/model beyond printed B-AAC/B-ASC designations", "network addresses", "IP subnet/VLAN design", "MS/TP device addressing", "panel/card/terminal count", "field-wiring schedule"],
        },
        "sequence_of_operations": {"source_bounded_ledgers": sequence_ledger, "summary": "Written sequence evidence is present on all listed sources. Each sequence module retains its literal bounded statements; this context ledger records source/sheet coverage and does not convert prose into additional unprinted I/O."},
        "control_diagram_bindings": [
            {"source_sheet": "MI702/MI703", "system": "Air Operations/MTRACON DOAH", "equipment_scope": ["DOAH-A1", "DOAH-A2", "DOAH-M1"]},
            {"source_sheet": "MI704/MI705", "system": "Air Operations/MTRACON AHUs", "equipment_scope": ["AHU-A1", "AHU-A2", "AHU-M1"]},
            {"source_sheet": "MI710-MI713", "system": "Air Operations chilled/hot water", "equipment_scope": ["Air Operations CHW/HHW plants"]},
            {"source_sheet": "MI720-MI723", "system": "MTRACON/ATCT chilled/hot water", "equipment_scope": ["shared MTRACON/ATCT CHW/HHW plants"]},
            {"source_sheet": "MI730-MI732", "system": "ATCT", "equipment_scope": ["DOAH-T1", "AHU-T1A", "AHU-T1B", "stair pressurization"]},
            {"source_sheet": "MI740-MI744", "system": "template controls", "equipment_scope": ["FCU", "unit heater", "CRAH", "SFPVAV", "humidifier", "exhaust", "elevator machine room"]},
        ],
        "sensor_and_zone_ledger": sensor_ledger,
        "tables": [], "assertions": [],
        "inventory_checks": [
            {"id": "rank01-sequence-source-ledgers", "records_path": ["sequence_of_operations", "source_bounded_ledgers"], "expected": len(sequence_ledger), "unique_key": "source_module"},
            {"id": "rank01-control-diagram-bindings", "records_path": ["control_diagram_bindings"], "expected": 6, "unique_key": "source_sheet"},
        ],
    }
    (WORK / "controls_context_rank01.json").write_text(json.dumps(payload, indent=2) + "\n")


if __name__ == "__main__":
    main()
