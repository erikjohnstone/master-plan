"""Strict literal row capture of every printed M-601 mechanical schedule."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "07__vol2__061"
OUT = AUDIT / "work" / IDENT / "schedules_m601.json"


def table(id_, title, x0, x1, rows, title_box):
    return {
        "id": id_, "sheet": "M-601", "page": 58,
        "title_as_printed": title, "columns": "source_row_as_printed",
        "x_edges": [x0, x1], "y_ranges": [[a, b] for a, b, _ in rows],
        "rows": [text for _, _, text in rows], "row_reading_order": "left_to_right",
        "header_evidence": [{"bbox": title_box, "expected": title}],
        "source_row_semantics": "Complete literal left-to-right nonblank schedule row. It is a printed schedule identity/specification, not a plan-verified installed-count or location claim.",
    }


def main():
    custom_outdoor_ahu = [(313, 340, "AHU-A HAAKON 66,100 60,000 18,000 4 2x2 DIRECT 460/3 15 1,750 1 1.75 5.3 1750 42,000 84X102 1,258 0.25 35,000 60X120 738 0.1 25,000 42X120 763 0.1 PLEATED 24x24x2 (15) MERV-8 PLEATED 24x24x2 (30) MERV-8 2 60 0.4 30% PG 6 2 7 494 156.1 15.9 0.14 285.8 46.0 41.6/ 51.6 55.6/ 793.8 53.8 41.6/ 59.3 80.0/ 66.7 66.7 67.0 80.9/ 66.5 79.9/ 78.3 77.8/ 1,092.6 979.3 67.0 80.9/ 61.4 66.1/ 47.8 33.0/ WATER 6 1 10 499 1,225.7 60.4 41.6/ 100.0 95.3 120.0/ 9.8 0.1 WATER 6 8 10 499 2904.6 1967.6 362 67.0 81.0/ 50.5 51.0/ 58.0 42.0/ 17.0 0.9")]
    custom_ahu_cont = [(561, 578, "AHU-A 6 3X3 DIRECT 480/3 20 1,750 2.5 6.2 14.5 1,750 PLEATED (6) 12x24x12 13")]
    heat_recovery_unit = [(728, 745, "HRU-A HAAKON 14,350 18,000 30% PG 6 6 12 152.4 20.6 0.12 284.7 68.0/53.5 150.0 51.6/55.6 67.5 67.5 75.0/78.5 150.0 78.7/77.8 633.5 68.0/35.8 150.0 33.0/41.8 893.4 75.0/120.9 150.0 122.0/109.6")]
    humidifier = [(928, 941, "HUM-A DRISTEEM STS-400 ULTRASORB MP STEAM TO STEAM 950 DI 464.2 495.0 464.2 12.0 140x126 42,000 18,000 -20.0/80.0 68.0/40.0 60.0/38.0 60.0/52.0 489.8 6 120/1 3 20")]
    water_to_water_hp = [(1087, 1100, "WWHP-A MULTISTACK (3)MSH020 5,600 56x32x67 6 R-454B 54.0 30% PG 151.5 16.2 33.0/42.0 41.8/33.0 30% PG 151.5 9.0 109.0/122.0 69.3/80.0 480/3 128 150 22")]
    shell_tube = [
        (1243, 1258, "HX-A-1 TACO E10208-S 415 2 10 4 STEAM 3256.8 12 WATER 3093.0 250 95/120 1.6"),
        (1258, 1272, "HX-A-2 TACO E10208-S 415 2 10 4 STEAM 3256.8 12 WATER 3093.0 250 95/120 1.6"),
    ]
    pumps = [
        (1255, 1268, "GWP-A-1 TACO KS3011D HEAT RECOVERY - CONDENSER 3 INLINE 30% PG @ 30°F 9.5 150 90 68 7.5 1,760 5.2 480/3 11 20 1,2"),
        (1268, 1281, "GWP-A-2 TACO KS3011D HEAT RECOVERY - CONDENSER 3 INLINE 30% PG @ 30°F 9.5 150 90 68 7.5 1,760 5.2 480/3 11 20 1,2"),
        (1281, 1294, "GWP-B-1 TACO KV2009D HEAT RECOVERY - EVAPORATOR 2 INLINE 30% PG @ 30°F 9.0 150 70 71 5.0 1,760 3.9 480/3 7.6 20 1,2"),
        (1294, 1307, "GWP-B-2 TACO KV2009D HEAT RECOVERY - EVAPORATOR 2 INLINE 30% PG @ 30°F 9.0 150 70 71 5.0 1,760 3.9 480/3 7.6 20 1,2"),
        (1307, 1320, "HWP-A-1 TACO KV4007D HEATING HOT WATER 4 INLINE WATER @ 120°F 6.6 250 40 81 5.0 1,760 3.1 480/3 7.6 20 1"),
        (1320, 1333, "HWP-A-2 TACO KV4007D HEATING HOT WATER 4 INLINE WATER @ 120°F 6.6 250 40 81 5.0 1,760 3.1 480/3 7.6 20 1"),
        (1333, 1347, "HWP-B-1 TACO 2400-60 HEATING HOT WATER - AHU COIL 2 INLINE WATER @ 120°F - 25 10 - 1/6 1,760 - 120/1 4.4 20 -"),
    ]
    exhaust = [
        (1405, 1418, "EF-2 GREENHECK VK-CD 1,325 DIRECT 30 1,770 18,000 3.0 26.1 208/3 80 120"),
        (1418, 1430, "EF-3 GREENHECK VK-CD 1,325 DIRECT 30 1,770 18,000 3.0 26.1 480/3 40 60"),
    ]
    expansion_tanks = [
        (1475, 1488, "ET-A TACO CBX84-125 BLADDER 150 HEATING HOT WATER WATER 500 125 120 45 5.0 22 12 1,2"),
        (1488, 1501, "ET-B TACO CBX84-125 BLADDER 150 HEAT RECOVERY - EVAPORATOR 30% PG 300 125 120 40 5.9 22 12 1,2,3"),
        (1501, 1515, "ET-C TACO CBX84-125 BLADDER 150 HEAT RECOVERY - CONDENSER 30% PG 250 125 150 35 4.9 22 12 1,2,3"),
    ]
    separators = [
        (1545, 1558, "AS-A TACO 4905AR 130 HEATING HOT WATER 250 1.9 5 1"),
        (1558, 1571, "AS-B TACO 4004AR 380 HEAT RECOVERY - CONDENSER 150 1.7 4 1,2"),
        (1571, 1585, "AS-C TACO 4904AR 130 HEAT RECOVERY - EVAPORATOR 150 1.7 4 1,2"),
    ]
    steam_traps = [
        (1721, 1734, "TP-1 SPIRAX SARCO FT-15 HX-A-1 & -2 F&T 1-1/2\" 10 6,600 0.50"),
        (1734, 1748, "TP-2 SPIRAX SARCO FT-15 HUM-A F&T 3/4\" 10 1,000 0.22"),
    ]
    vavs = [
        (1649, 1662, "VAV-A PRICE SDV 6 200 200 75 5.5 2 60/85 120/98 0.5 0.1 0.1 24 - 1,2"),
        (1662, 1675, "VAV-B PRICE SDV 6 200 200 75 7.7 3 60/95 120/98 0.8 0.2 0.1 24 - 1,2"),
        (1675, 1688, "VAV-C PRICE SDV 6 300 300 100 8.2 2 60/85 120/98 0.8 0.1 0.2 25 - 1,2"),
        (1688, 1701, "VAV-D PRICE SDV 6 300 300 100 11.5 3 60/95 120/100 1.0 0.4 0.2 25 - 1,2,4"),
        (1701, 1714, "VAV-E PRICE SDV 10 600 600 225 16.4 3 60/85 120/88 1.0 0.2 0.3 - - 1,2"),
        (1714, 1727, "VAV-F PRICE SDV 10 600 600 225 22.8 3 60/95 120/98 2.0 0.7 0.2 - - 1,2,4"),
        (1727, 1740, "VAV-G PRICE SDV 10 800 800 250 21.7 2 60/85 120/97 2.0 1.2 0.3 - - 1,2,4"),
        (1740, 1753, "VAV-H PRICE SDV 10 800 800 250 30.4 4 60/95 120/91 2.0 0.5 0.4 - - 1,2,4"),
        (1753, 1766, "VAV-I PRICE SDV 12 1200 1200 400 39.0 4 60/90 120/83 2.0 0.3 0.4 - - 1,2,3,4"),
        (1766, 1779, "VAV-J PRICE SDV 6 150 150 75 N/A N/A N/A N/A 0 N/A N/A 21 - 1,2"),
        (1779, 1792, "VAV-K PRICE SDV 6 300 300 100 N/A N/A N/A N/A 0 N/A N/A 26 - 1,2"),
    ]
    fcu = [(1964, 1976, "FCU-A DAIKIN FCHH208 DIRECT PSC 667 0.0 WATER 4 22.3 16.7 2.5 57.1/56.4 60.0 3.5 120/1 1.8 20")]
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal-row capture of all 13 printed M-601 mechanical schedule tables, including the dense custom AHU, VAV and hydronic schedules.",
        "tables": [
            table("M601-CUSTOM-OUTDOOR-AHU", "CUSTOM OUTDOOR AIR HANDLING UNIT SCHEDULE", 200, 2750, custom_outdoor_ahu, [1200, 70, 2100, 105]),
            table("M601-CUSTOM-AHU-CONT", "CUSTOM AIR HANDLING UNIT SCHEDULE (CONT.)", 200, 1000, custom_ahu_cont, [250, 355, 1000, 395]),
            table("M601-BID-ALT-1-CUSTOM-OUTDOOR-HEAT-RECOVERY", "BID ALTERNATE #1 CUSTOM OUTDOOR, HEAT RECOVERY UNIT SCHEDULE", 1000, 2750, heat_recovery_unit, [1600, 640, 2600, 680]),
            table("M601-HUMIDIFIER", "HUMIDIFIER SCHEDULE", 1100, 2750, humidifier, [1750, 840, 2150, 880]),
            table("M601-BID-ALT-1-WATER-TO-WATER-HEAT-PUMP-CHILLER", "BID ALTERNATE #1 WATER-TO-WATER HEAT PUMP/CHILLER SCHEDULE", 1300, 2750, water_to_water_hp, [1700, 995, 2550, 1040]),
            table("M601-SHELL-AND-TUBE-HEAT-EXCHANGER", "SHELL AND TUBE HEAT EXCHANGER SCHEDULE", 300, 1450, shell_tube, [600, 1170, 1300, 1205]),
            table("M601-HYDRONIC-PUMPS", "HYDRONIC PUMP SCHEDULE", 1460, 2750, pumps, [1900, 1170, 2450, 1205]),
            table("M601-BID-ALT-2-EXHAUST-FANS", "BID ALTERNATE #2 EXHAUST FAN SCHEDULE", 500, 1500, exhaust, [700, 1345, 1350, 1380]),
            table("M601-EXPANSION-TANKS", "EXPANSION TANK SCHEDULE", 1520, 2750, expansion_tanks, [1800, 1395, 2400, 1425]),
            table("M601-AIR-DIRT-SEPARATORS", "AIR/DIRT SEPARATOR SCHEDULE", 600, 1500, separators, [600, 1485, 1300, 1520]),
            table("M601-STEAM-TRAPS", "STEAM TRAP SCHEDULE", 700, 1500, steam_traps, [750, 1645, 1300, 1680]),
            table("M601-VARIABLE-VOLUME-SUPPLY-TERMINALS", "VARIABLE VOLUME SUPPLY TERMINAL UNIT SCHEDULE", 1600, 2750, vavs, [1750, 1575, 2600, 1610]),
            table("M601-FAN-COIL-UNITS", "FAN COIL UNIT SCHEDULE", 1700, 2750, fcu, [1900, 1880, 2500, 1910]),
        ],
        "assertions": [],
        "schedule_scope": {
            "control_valve_schedule": "No standalone control-valve schedule is printed on M-601. VAV and fan-coil notes refer to BAS-provided valves, but do not publish a control-valve schedule with a tag/specification/quantity matrix.",
            "damper_actuator_schedule": "No standalone damper-actuator schedule is printed on M-601. AHU remarks and M-502 point rows provide controls context without an actuator tag/make/model/torque/signal/fail-action schedule.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
