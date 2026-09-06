"""Author literal published M6.2/M6.3 control point lists for rank 04."""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "ground_truth" / "work" / "04__vol2__062"
IDENT = "04__vol2__062"


def points_table(identifier, sheet, page, heading, x0, x1, ranges, rows, access, scope):
    return {
        "id": identifier,
        "sheet": sheet,
        "page": page,
        "title_as_printed": heading,
        "columns": "source_item",
        "x_edges": [x0, x1],
        "y_ranges": ranges,
        "rows": rows,
        "point_access_as_printed": access,
        "ownership_scope": scope,
        "classification_boundary": "This point list prints functional access/status text. It does not label every individual row as AI, DI, AO or DO, so no unprinted I/O type or field-terminal count is inferred.",
    }


def main():
    ahu_writeable = [
        "a. UNIT ENABLE / DISABLE",
        "b. DUCT STATIC PRESSURE RESET SET POINT",
        "c. SUPPLY AIR TEMPERATURE RESET SET POINT",
        "d. BUILDING STATIC PRESSURE SET POINT",
        "e. OUTSIDE AIR MINIMUM POSITION",
    ]
    ahu_readable = [
        "a. SUPPLY AIR TEMPERATURE",
        "b. OUTSIDE AIR TEMPERATURE",
        "c. SUPPLY FAN(S) STATUS",
        "d. SUPPLY FAN(S) VFD FREQUENCY",
        "e. BUILDING PRESSURE",
        "f. COMPRESSOR(S) SUCTION PRESSURE",
        "g. COMPRESSOR(S) DISCHARGE PRESSURE",
        "h. COMPRESSOR(S) SATURATED CONDENSING TEMPERATURE",
        "i. COMPRESSOR(S) SATURATED SUCTION TEMPERATURE",
        "j. ALARMS",
        "k. FILTER STATUS",
    ]
    boiler_points = [
        "1. STATUS.",
        "2. ALARM.",
        "3. CAPACITY FEEDBACK.",
        "4. FIRING RATE.",
        "5. SET POINT.",
    ]
    vfd_points = [
        "1. ENABLE/DISABLE.",
        "2. STATUS.",
        "3. SPEED CONTROL.",
        "4. ALARMS.",
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Source-bounded published point-list rows for the heating-water boiler/VFD controls and AHU-1. These rows retain the source's Writeable/Readable or list semantics and do not manufacture a final hardware I/O, controller-card, terminal, wiring or instance count.",
        "point_list_summary": {
            "M6.2": "M6.2 publishes five boiler-system points and four VFD-interface points, each expressly non-exhaustive.",
            "M6.3": "M6.3 publishes five AHU Writeable points and eleven AHU Readable points for AHU-1.",
            "classification_status": "The drawings also show AI/DI/AO diagram symbols, but these published list rows are not individually mapped to those types in text. The point lists are retained exactly as printed rather than guessed into AI/DI/AO/DO buckets.",
        },
        "tables": [
            points_table("M62-BOILER-PUBLISHED-POINTS", "M6.2", 18, "BOILER POINTS LIST", 1525, 1650,
                         [[547, 558], [559, 570], [571, 582], [583, 594], [595, 606]], boiler_points,
                         "PUBLISHED LIST (POINT TYPE NOT INDIVIDUALLY PRINTED)", "Boiler-system interface to the operator's workstation."),
            points_table("M62-VFD-PUBLISHED-POINTS", "M6.2", 18, "VFD POINTS LIST", 1525, 1650,
                         [[639, 649], [650, 661], [662, 673], [674, 687]], vfd_points,
                         "PUBLISHED LIST (POINT TYPE NOT INDIVIDUALLY PRINTED)", "Heating-water VFD control-interface point list."),
            points_table("M63-AHU-WRITEABLE-POINTS", "M6.3", 19, "AHU POINTS LIST - WRITEABLE POINTS", 1685, 1950,
                         [[166, 180], [180, 191], [191, 203], [203, 214], [214, 226]], ahu_writeable,
                         "WRITEABLE", "AHU-1 published Writeable point list."),
            points_table("M63-AHU-READABLE-POINTS", "M6.3", 19, "AHU POINTS LIST - READABLE POINTS", 1685, 1950,
                         [[247, 259], [259, 271], [271, 283], [283, 294], [294, 306], [306, 317], [317, 328], [328, 340], [340, 351], [351, 362], [363, 374]], ahu_readable,
                         "READABLE", "AHU-1 published Readable point list."),
        ],
        "assertions": [
            {"id": "m62-boiler-points-title", "page": 18, "bbox": [1510, 498, 1620, 520], "expected": "BOILER POINTS LIST :", "mode": "exact"},
            {"id": "m62-vfd-points-title", "page": 18, "bbox": [1510, 613, 1620, 635], "expected": "VFD POINTS LIST :", "mode": "exact"},
            {"id": "m63-ahu-points-title", "page": 19, "bbox": [1655, 140, 1750, 162], "expected": "AHU POINTS LIST :", "mode": "exact"},
            {"id": "m63-ahu-writeable-heading", "page": 19, "bbox": [1680, 154, 1780, 171], "expected": "1. WRITEABLE POINTS:", "mode": "exact"},
            {"id": "m63-ahu-readable-heading", "page": 19, "bbox": [1680, 234, 1780, 251], "expected": "2. READABLE POINTS:", "mode": "exact"},
        ],
        "inventory_checks": [{"id": "rank04-published-point-lists", "records_path": ["tables"], "expected": 4, "unique_key": "id"}],
    }
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "points_m62_m63.json").write_text(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
