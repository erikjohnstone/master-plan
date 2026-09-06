"""Literal H-001 schedule transcription for Rank 20."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "20__vol2__097"
OUT = AUDIT / "work" / IDENT / "schedules_h001.json"


def table(id_, title, x0, x1, ranges, rows):
    return {
        "id": id_, "sheet": "H-001", "page": 2, "title_as_printed": title,
        "columns": "literal_source_row_as_printed", "x_edges": [x0, x1],
        "y_ranges": ranges, "rows": rows, "row_reading_order": "right",
        "source_row_semantics": "Complete literal printed schedule row. It is not expanded into plan placement, installed multiplicity, BAS ownership, controller I/O, wiring, or a physical takeoff total.",
    }


def main():
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal H-001 equipment and air-outlet schedule-row capture.",
        "tables": [
            table("H001-PACKAGED-HEATING-VENTILATING", "PACKAGED HEATING AND VENTILATING UNIT (100% OUTSIDE AIR)", 500, 2200, [[210, 260]], [
                "HV-1 2,300 0.5 208 168 0 80 208 1 60 0.46 11.5 15 1,500 IGX-P115-H12 1, 2, 3, 4, 5, 6, 7, 8, 9",
            ]),
            table("H001-PACKAGED-MAKEUP-AIR", "PACKAGED MAKEUP AIR A/C UNIT (100% OUTSIDE AIR)", 500, 2200, [[555, 605]], [
                "MAU-1 175 172 98 / 63 48.2 / 44.6 4,000 0.5 333 270 0 74 460 3 60 .91 41 60 8.3 3,500 RV-45-15K 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12",
            ]),
            table("H001-VENTILATION-FANS", "VENTILATION FANS", 590, 2230, [[895, 935], [935, 970], [970, 1005], [1005, 1040], [1040, 1075]], [
                "EXF-1 4,000 0.5 1660 460 3 60 1-1/2 DIRECT 165R17D (VF2) CHLORINE DIOXIDE 88 99 94 86 79 79 73 67 90 78 32 220 2, 4, 5 BLDGS",
                "1,700 115 1/4 HYDROFLOUROSILICIC 77 79 75 66 64 60 55 49 71 59 1, 2, 5 EF-1 0.25 1010 1 60 DIRECT 150R17D (VF) 10.2 110",
                "EF-2 600 0.25 1550 115 1 60 1/4 DIRECT 100W17DEC HYDROFLOUROSILICIC 68 72 77 69 62 58 52 47 71 60 9.7 40 2, 3, 5 CHEMICAL",
                "EF-3 1,100 0.25 1260 115 1 60 1/6 DIRECT 120W17D (VF) PRIMARY COAGULANT 64 86 72 61 61 65 54 48 73 61 12.1 50 2, 3",
                "EF-4 1,100 0.25 1260 115 1 60 1/6 DIRECT 120W17D (VF) PRIMARY COAGULANT 64 86 72 61 61 65 54 48 73 61 12.1 50 2, 3",
            ]),
            table("H001-GRILLE-DIFFUSER", "GRILLE AND DIFFUSER SCHEDULE", 80, 520, [[1235, 1270]], [
                "- S-1 SEE DRAWINGS SIDEWALL KRUEGER 5880",
            ]),
            table("H001-ELECTRIC-UNIT-HEATERS", "ELECTRIC UNIT HEATER SCHEDULE", 590, 2000, [[1275, 1305], [1305, 1335]], [
                "- UH-1 34,130 700 480 60 3 12.1 10 P3P5510T PRIMARY COAGULANT",
                "- UH-2 34,130 700 480 60 3 12.1 10 P3P5510T PRIMARY COAGULANT",
            ]),
            table("H001-COMBINATION-LOUVERS", "COMBINATION LOUVER", 590, 2230, [[1445, 1480], [1480, 1520]], [
                "REPLACE OLD LOUVER WITH NEW. FIELD COORDINATE EXACT LOUVER SIZE AND LOCATION TO FIT WITHIN EXISTING OPENING. FURNISH WITH 120 VOLT BELIMO ACTUATOR SIZED TO ACCOMMODATE LOUVER SIZE. L-1 36\"x36\" OPEN ELC6375DAX PRIMARY COAGULANT INTERLOCK WITH EF-3. OR EQUAL BY GREENHECK OR POTTORFF.",
                "REPLACE OLD LOUVER WITH NEW. FIELD COORDINATE EXACT LOUVER SIZE AND LOCATION TO FIT WITHIN EXISTING OPENING. FURNISH WITH 120 VOLT BELIMO ACTUATOR SIZED TO ACCOMMODATE LOUVER SIZE. L-2 36\"x36\" OPEN ELC6375DAX PRIMARY COAGULANT INTERLOCK WITH EF-4. OR EQUAL BY GREENHECK OR POTTORFF.",
            ]),
        ],
        "assertions": [],
        "schedule_scope": "All twelve H-001 schedule rows are retained as literal source rows: one packaged heating/ventilating unit, one makeup-air unit, five ventilation fans, one grille/diffuser, two electric unit heaters, and two combination louvers. The source rows remain reference/specification evidence, not a derived physical takeoff.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
