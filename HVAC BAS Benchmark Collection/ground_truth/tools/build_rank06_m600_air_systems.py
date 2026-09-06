"""Strict literal-row capture of every M600 air-system schedule."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "06__vol2__096"
OUT = AUDIT / "work" / IDENT / "schedules_m600_air_systems.json"


def table(id_, title, x0, ys, rows, title_box):
    return {
        "id": id_, "sheet": "M600", "page": 19, "title_as_printed": title,
        "columns": "source_row_as_printed", "x_edges": [x0, 2700],
        "y_ranges": ys, "rows": rows, "row_reading_order": "left_to_right",
        "header_evidence": [{"bbox": title_box, "expected": title}],
        "source_row_semantics": "Complete literal left-to-right nonblank source row. The wide printed schedule uses merged/vertical headings; this record retains the source values and order without a fabricated normalization or installed plan quantity.",
    }


def main():
    index = [
        'DOAS-1 OUTSIDE POD - MULIZONE DOAS POD SF-1A/B EF-1A/B 9000 9000 100.00% PHC-1 - CC-1 - OAF-1/RF-1 SA-1A/B HE-1 13,000 414" 88" 96" 460 3 60 32.4 34.8 40 YES INNOVENT ERU-SS-PL-9000-HW-CW-SL-SL-460 1,2,4',
        'DOAS-2 MECHANICAL C166 MULIZONE DOAS EXISTING JAIL/BOOKING SF-2A/B EF-2A/B 12000 12000 100.00% PHC-2 - CC-2 - OAF-2/RF-2 SA-2A/B HE-2 15,000 384" 88" 116" 460 3 60 43 46 50 YES INNOVENT ERU-OU-PL-12000-HW-CW-SL-SL-460 1,2,3,4',
        'DOAS-3 OUTSIDE KITCHEN - SINGLE ZONE DOAS KITCHEN SF-3 - 3000 3000 100.00% RHC-3 CC-3 - OAF-3 - - 7,500 460 3 60 6 7.5 12 YES PACE PAO-36X45 1,2,4',
        'AHU-4 MECHANICAL B107 VAV ADMIN SF-4A/B RF-4A/B 8000 2000 25.00% PHC-3 - CC-4 - PF-4 SA-4A/B - 2,500 148" 45" 36" 460 3 60 25.2 31.6 40 YES PACE PAI-42X84 1,2,3,4',
    ]
    supply = [
        'SF-1A DOAS-1 4500 2.00 5.55 PLENUM II SWSI 450 2493 5.6 VFD 7.5 1800 460 3 SINGLE POINT YES GREENHECK - 1,2,3',
        'SF-1B DOAS-1 4500 2.00 5.55 PLENUM II SWSI 450 2493 5.6 VFD 7.5 1800 460 3 SINGLE POINT YES GREENHECK - 1,2,3',
        'SF-2A DOAS-2 6000 2.00 5.97 PLENUM II SWSI 500 2314 8 VFD 10 1800 460 3 SINGLE POINT YES GREENHECK - 1,2,3',
        'SF-2B DOAS-2 6000 2.00 5.97 PLENUM II SWSI 500 2314 8 VFD 10 1800 460 3 SINGLE POINT YES GREENHECK - 1,2,3',
        'SF-3 DOAS-3 3000 1.50 4.20 PLENUM II SWSI 135 3660 3.41 VFD 5 3600 460 3 SINGLE POINT YES LAU DDPG2 1,2,3',
        'SF-4A AHU-4 4000 2.00 3.85 PLENUM II SWSI 122 4243 4.84 VFD 5 3600 460 3 SINGLE POINT YES LAU DDPG2 1,2,3',
        'SF-4B AHU-4 4000 2.00 3.85 PLENUM II SWSI 122 4243 4.84 VFD 5 3600 460 3 SINGLE POINT YES LAU DDPG2 1,2,3',
    ]
    returns = [
        'EF-1A DOAS-1 EXHAUST FAN 4500 1.75 3.62 PLENUM II SWSI 450 2182 3.6 VFD 5 1800 460 3 SINGLE POINT Yes GREENHECK - 1,2,3',
        'EF-1B DOAS-1 EXHAUST FAN 4500 1.75 3.62 PLENUM II SWSI 450 2182 3.6 VFD 5 1800 460 3 SINGLE POINT Yes GREENHECK - 1,2,3',
        'EF-2A DOAS-2 EXHAUST FAN 6000 1.50 3.59 PLENUM II SWSI 500 1985 4.8 VFD 7.5 1800 460 3 SINGLE POINT Yes GREENHECK - 1,2,3',
        'EF-2B DOAS-2 EXHAUST FAN 6000 1.50 3.59 PLENUM II SWSI 500 1985 4.8 VFD 7.5 1800 460 3 SINGLE POINT Yes GREENHECK - 1,2,3',
        'RF-4A AHU-4 RETURN FAN 4000 1.75 2.48 AF II SWSI 150 2532 2.7 VFD 5 1800 460 3 SINGLE POINT Yes LUA DDPG2 1,2,3',
        'RF-4B AHU-4 RETURN FAN 4000 1.75 2.48 AF II SWSI 150 2532 2.7 VFD 5 1800 460 3 SINGLE POINT Yes LUA DDPG2 1,2,3',
    ]
    cooling = [
        'CC-1 DOAS-1 9000 682 302 486 1.49 10 1 9 82.4 74.6 52.0 52.0 30% PG 96.4 40 55 23.5',
        'CC-2 DOAS-2 12000 923 409 500 1.66 10 1 10 82.6 74.7 51.8 51.8 30% PG 130.5 40 55 21.7',
        'CC-3 DOAS-3 3000 244 129 476 1.07 10 1 11 95.0 78.0 525.0 52.1 30% PG 48.3 40 51 18.6',
        'CC-4 AHU-4 8000 275 203 491 0.82 10 1 10 76.6 64.2 52.1 51.8 30% PG 39.6 40 55 16.5',
    ]
    heating = [
        'PHC-1 DOAS-1 PRE-HEAT 9000 428 500 0.17 2 1 7 16.1 60.0 WATER 28.9 140 110 8.6',
        'PHC-2 DOAS-2 PRE-HEAT 12000 622 500 0.20 2 1 8 16.1 63.9 WATER 41.9 140 110 3.4',
        'PHC-3 DOAS-3 PRE-HEAT 3000 333 476 0.28 4 1 9 -10.0 84.7 WATER 22.7 140 110 3.1',
        'PHC-4 AHU-4 PRE-HEAT 8000 312 491 0.11 2 1 8 36.8 71.7 WATER 21.2 140 110 1.5',
    ]
    heat_exchangers = [
        'HE-1 DOAS-1 9000 9000 95.0 78.0 82.4 74.6 0.87 75.0 50.0 87.5 33.4 0.85 -10.0 -10.0 33.8 23.5 0.71 60.0 30.0 21.1 100.0 0.71 BYPASS @ 16.1 °F INNOVENT H-1-50B-1500',
        'HE-2 DOAS-2 12000 12000 95.0 78.0 82.6 74.7 1.09 75.0 50.0 87.3 33.6 1.07 -10.0 -10.9 33.2 23.1 0.91 60.0 30.0 21.4 100.0 0.98 BYPASS @ 16.1 °F INNOVENT H-1-50B-1650',
    ]
    filters = [
        'OAF-1 DOAS-1 9000 MERV-8 422 0.24 0.62 PLEATED GALVANIZED 8 16X24',
        'RAF-1 DOAS-1 9000 MERV-8 422 0.24 0.62 PLEATED GALVANIZED 8 16X24',
        'OAF-2 DOAS-2 12000 MERV-8 450 0.24 0.62 PLEATED GALVANIZED 8 20X24',
        'RAF-2 DOAS-2 12000 MERV-8 450 0.24 0.62 PLEATED GALVANIZED 8 20X24',
        'OAF-3 DOAS-3 3000 MERV-8 500 0.26 1 PLEATED GALVANIZED - 6.0 SF',
        'PF-4 AHU-4 8000 MERV-8 500 0.27 1 PLEATED GALVANIZED 12 16.0 SF',
    ]
    sound = [
        'SA-1A DOAS-1 SUPPLY 9000 341 47 85 24 0.1 6 9 15 21 17 14 14 12',
        'SA-1B DOAS-1 RETURN 9000 341 47 85 24 0.1 6 9 15 21 17 14 14 12',
        'SA-2A DOAS-2 SUPPLY 12000 393 83 53 24 0.1 6 9 15 21 17 14 14 12',
        'SA-2B DOAS-2 RETURN 12000 393 83 53 24 0.1 6 9 15 21 17 14 14 12',
        'SA-4A AHU-4 SUPPLY 8000 706 78 36 36 0.09 3.4 5.7 14.4 22.8 25.9 23.5 17.9 11',
        'SA-4B AHU-4 RETURN 8000 706 78 36 36 0.09 2.5 5.7 13.5 22.1 25.2 23.5 18.9 13',
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal-row capture of every M600 air-handling equipment schedule: system index, supply/return/exhaust fans, cooling/heating coils, heat exchangers, filters and sound attenuators.",
        "tables": [
            table("M600-AHU-SYSTEM-INDEX", "AIR HANDLING UNIT SYSTEM INDEX SCHEDULE", 110, [[258,273],[273,286],[286,300],[300,314]], index, [800,70,1900,115]),
            table("M600-AHU-SUPPLY-FANS", "AHU SUPPLY FAN SCHEDULE", 1240, [[566,580],[580,593],[593,606],[606,619],[619,632],[632,645],[645,659]], supply, [1500,370,2500,410]),
            table("M600-AHU-RETURN-EXHAUST-FANS", "AHU RETURN/EXHAUST FAN SCHEDULE", 1120, [[942,956],[956,969],[969,982],[982,995],[995,1008],[1008,1022]], returns, [1200,745,2500,780]),
            table("M600-AHU-CHILLED-WATER-COILS", "AHU CHILLED WATER COOLING COIL SCHEDULE", 1260, [[1191,1205],[1205,1218],[1218,1231],[1231,1245]], cooling, [1200,1080,2600,1120]),
            table("M600-AHU-HEATING-WATER-COILS", "AHU HEATING WATER COIL SCHEDULE", 1080, [[1388,1402],[1402,1415],[1415,1428],[1428,1442]], heating, [1000,1300,2200,1340]),
            table("M600-AHU-PLATE-FRAME-HEAT-EXCHANGERS", "AHU PLATE AND FRAME HEAT EXCHANGER SCHEDULE", 580, [[1588,1602],[1602,1616]], heat_exchangers, [950,1490,2400,1530]),
            table("M600-AHU-AIR-FILTERS", "AHU AIR FILTER SCHEDULE", 1600, [[1737,1751],[1751,1764],[1764,1777],[1777,1790],[1790,1803],[1803,1817]], filters, [1800,1670,2600,1710]),
            table("M600-AHU-SOUND-ATTENUATORS", "AHU SOUND ATTENUATOR SCHEDULE", 1710, [[1977,1990],[1990,2003],[2003,2016],[2016,2029],[2029,2042],[2042,2055]], sound, [1800,1860,2700,1900]),
        ],
        "assertions": [
            {"id":"m600-index-note-4","page":19,"bbox":[120,166,1040,181],"expected":"DOAS UNIT TO BE PROVIDED WITH FACTORY CONTROLS WITH BACKNET INTERFACE. SEE DOAS UNIT SPECIFICATIONS.","mode":"exact"},
        ],
        "schedule_scope": {
            "control_valve_schedule":"M600 lists coil/heating/cooling source equipment but no standalone control-valve schedule.",
            "damper_actuator_schedule":"M600 includes no standalone damper-actuator schedule; the M603 motorized-damper schedule is captured separately.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
