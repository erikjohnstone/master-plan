"""Strict literal-row capture of the non-VAV/non-damper M603 air-device schedules."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "06__vol2__096"
OUT = AUDIT / "work" / IDENT / "schedules_m603_air_devices.json"


def table(id_, title, x0, x1, ys, rows, title_box):
    return {
        "id": id_, "sheet": "M603", "page": 22, "title_as_printed": title,
        "columns": "source_row_as_printed", "x_edges": [x0, x1],
        "y_ranges": ys, "rows": rows, "row_reading_order": "left_to_right",
        "header_evidence": [{"bbox": title_box, "expected": title}],
        "source_row_semantics": "Complete literal left-to-right nonblank source row. It preserves published device specifications without inferring a plan-installed quantity.",
    }


def main():
    diffusers = [
        'E1 8"Ø 24" 24" STEEL WHITE 0 225 15 6 0.05 PRICE SPD',
        'E6 6"Ø 24" 24" ALUMINUM WHITE 0 70 15 6 0.05 PRICE ASPD',
        'E7 8"Ø 24" 24" ALUMINUM WHITE 71 225 15 6 0.05 PRICE ASPD',
        'E8 10"Ø 24" 24" ALUMINUM WHITE 226 380 20 10 0.09 PRICE ASPD',
        'E12 6"Ø 12" 12" ALUMINUM WHITE 0 70 15 6 0.05 PRICE ASPD',
        'E13 8"Ø 12" 12" ALUMINUM WHITE 71 225 15 6 0.05 PRICE ASPD',
        'EG2 18"x18" 18" 18" STEEL WHITE 800 1600 15 6 0.05 PRICE PDR',
        'EG3 10"x6" 10" 6" STEEL WHITE 0 200 15 6 0.09 PRICE PDR',
        'R1 8"Ø 24" 24" STEEL WHITE 71 225 15 6 0.05 PRICE SPD',
        'R2 10"Ø 24" 24" STEEL WHITE 226 380 20 10 0.09 PRICE SPD',
        'R3 12"Ø 24" 24" STEEL WHITE 381 550 22 12 0.13 PRICE SPD',
        'R4 14"Ø 24" 24" STEEL WHITE 551 750 24 14 0.18 PRICE SPD',
        'R7 12"Ø 24" 24" STEEL WHITE 381 550 22 12 0.13 PRICE PDR',
        'R8 14"Ø 24" 24" STEEL WHITE 551 750 24 14 0.18 PRICE PDR',
        'R9 16"Ø 24" 24" STEEL WHITE 751 900 25 15 0.20 PRICE PDR',
        'S0 6"Ø 24" 24" STEEL WHITE 0 70 15 6 0.05 PRICE SPD',
        'S1 8"Ø 24" 24" STEEL WHITE 71 225 15 6 0.05 PRICE SPD',
        'S2 10"Ø 24" 24" STEEL WHITE 226 380 20 10 0.09 PRICE SPD',
        'S3 12"Ø 24" 24" STEEL WHITE 381 550 22 12 0.13 PRICE SPD',
        'S4 14"Ø 24" 24" STEEL WHITE 551 750 24 14 0.18 PRICE SPD',
        'S6 6"Ø 24" 24" ALUMINUM WHITE 0 70 15 6 0.05 PRICE ASPD',
        'S12 6"Ø 12" 12" ALUMINUM WHITE 0 70 15 6 0.05 PRICE ASPD',
        'S13 8"Ø 12" 12" ALUMINUM WHITE 71 225 15 6 0.05 PRICE ASPD',
        'S14 6"Ø 24" 24" STEEL WHITE 0 85 15 6 0.05 PRICE PDS',
        'S15 8"Ø 24" 24" STEEL WHITE 86 275 15 6 0.05 PRICE PDS',
        'SE0 6"Ø 24" 24" STEEL WHITE 0 70 15 6 0.05 AJ MFGR SDR',
        'SE2 8"Ø 24" 24" STEEL WHITE 71 225 15 6 0.05 AJ MFGR SDR',
        'SE3 10"Ø 24" 24" STEEL WHITE 226 380 20 10 0.09 AJ MFGR SDR',
        'SE4 12"Ø 24" 24" STEEL WHITE 381 550 22 12 0.13 AJ MFGR SDR',
        'SE7 8"Ø 24" 24" ALUMINUM WHITE 71 225 15 6 0.05 AJ MFGR SDRA',
        'SE8 10"Ø 24" 24" ALUMINUM WHITE 226 380 20 10 0.09 AJ MFGR SDRA',
        'SE9 12"Ø 24" 24" ALUMINUM WHITE 381 550 22 12 0.13 AJ MFGR SDRA',
        'SE10 14"Ø 24" 24" ALUMINUM WHITE 551 750 24 14 0.18 AJ MFGR SDRA',
        'SE12 6"Ø 12" 12" ALUMINUM WHITE 0 70 15 6 0.05 PRICE MSRRP',
        'SE13 8"Ø 12" 12" ALUMINUM WHITE 71 225 15 6 0.05 PRICE MSRRP',
        'SE15 6"Ø 12" 12" ALUMINUM WHITE 0 70 15 6 0.05 PRICE MSRRP',
        'SE16 8"Ø 12" 12" ALUMINUM WHITE 71 225 15 6 0.05 PRICE MSRRP',
        'SG1 10"x6" 10" 6" ALUMINUM WHITE 0 200 15 6 0.05 PRICE 600',
        'SS0 6"Ø 24" 24" ALUMINUM WHITE 0 70 15 6 0.05 AJ MFGR SDL',
        'SS1 8"Ø 24" 24" ALUMINUM WHITE 71 225 15 6 0.05 AJ MFGR SDL',
        'SS2 10"Ø 24" 24" ALUMINUM WHITE 226 380 20 10 0.09 AJ MFGR SDL',
        'SS3 12"Ø 24" 24" ALUMINUM WHITE 381 550 22 12 0.13 AJ MFGR SDL',
        'SS6 6"Ø 24" 24" ALUMINUM WHITE 0 70 15 6 0.05 AJ MFGR ASPD',
        'SS7 8"Ø 24" 24" ALUMINUM WHITE 71 225 15 6 0.05 AJ MFGR ASPD',
        'SS8 10"Ø 24" 24" ALUMINUM WHITE 226 380 20 10 0.09 AJ MFGR ASPD',
        'SS9 12"Ø 24" 24" ALUMINUM WHITE 381 550 22 12 0.13 AJ MFGR ASPD',
        'SS12 6"Ø 12" 12" STEEL WHITE 0 70 15 6 0.05 PRICE PDS',
        'SS13 8"Ø 12" 12" STEEL WHITE 71 225 15 6 0.05 PRICE PDS',
        'SS14 10"Ø 12" 12" STEEL WHITE 226 380 20 10 0.09 PRICE PDS',
        'SS15 6"Ø 12" 12" ALUMINUM WHITE 0 70 15 6 0.05 PRICE MSRRP',
        'SS16 8"Ø 12" 12" ALUMINUM WHITE 71 225 15 6 0.05 PRICE MSRRP',
    ]
    diffuser_y = [[340,354],[354,367],[367,380],[380,393],[393,406],[406,419],[419,432],[432,445],[445,459],[459,472],[472,485],[485,498],[498,511],[511,524],[524,537],[537,550],[550,563],[563,576],[576,590],[590,603],[603,616],[616,629],[629,642],[642,655],[655,668],[668,681],[681,694],[694,708],[708,721],[721,734],[734,747],[747,760],[760,773],[773,786],[786,799],[799,812],[812,825],[825,838],[838,852],[852,865],[865,878],[878,891],[891,904],[904,917],[917,930],[930,943],[943,956],[956,969],[969,983],[983,996],[996,1010]]
    slots = ['SL-1 8 48" 1/2" 2 40 0-160 22 16 STEEL WHITE 0.075 PRICE SDA50 1,2']
    sidewalls = [
        'SWG-1 16"X8" 18"X10" STAINLESS STEEL WHITE 0 - 400 20 0.10 PRICE MSRRP 3',
        'SWG-2 24"X8" 18"X10" STAINLESS STEEL WHITE 400 - 750 20 0.10 PRICE MSRRP 3',
        'SWG-3 24"X16" 26"X18" STEEL WHITE 0 - 2000 45 0.30 TITUS 3300RL 3',
        'SWG-4 30"X16" 32"X18" STEEL WHITE 0 - 2000 45 0.30 TITUS 3300RL 3',
        'SWG-5 12"X6" 14"X8" STEEL WHITE 0-350 18 0.02 PRICE SDG',
        'SWG-6 14"X10" 16"X12" STEEL WHITE 0-750 20 0.02 PRICE SDG',
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal-row capture of M603 diffuser/grille, slot-diffuser and sidewall-grille schedules. The VAV and motorized-damper schedules are deliberately separate high-detail modules.",
        "tables": [
            table("M603-DIFFUSERS-GRILLES", "DIFFUSER / GRILLE SCHEDULE", 720, 1800, diffuser_y, diffusers, [900,72,1750,115]),
            table("M603-SLOT-DIFFUSERS", "SLOT DIFFUSER SCHEDULE", 1400, 2700, [[1158,1175]], slots, [1800,1072,2500,1110]),
            table("M603-SIDEWALL-GRILLES", "SIDEWALL GRILLE SCHEDULE", 1710, 2700, [[1390,1405],[1405,1420],[1420,1435],[1435,1450],[1450,1465],[1465,1480]], sidewalls, [1800,1305,2500,1342]),
        ],
        "assertions": [
            {"id":"m603-diffuser-note-9","page":22,"bbox":[706,236,1070,249],"expected":"9. PROVIDE SLEEVE AND SECURITY BARS. SLEEVE LENGTH AS REQUIRED FOR INSTALLATION.","mode":"exact"},
        ],
        "schedule_scope": {
            "control_valve_schedule":"Not represented by this M603 air-device module.",
            "damper_actuator_schedule":"Not represented here; the complete M603 motorized-damper schedule is a separately corroborated module.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
