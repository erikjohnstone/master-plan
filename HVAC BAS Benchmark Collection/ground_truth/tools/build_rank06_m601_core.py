"""Strict literal-row capture of the M601 central-plant equipment schedules."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "06__vol2__096"
OUT = AUDIT / "work" / IDENT / "schedules_m601_core.json"


def table(id_, title, x0, y_ranges, rows, title_box):
    return {
        "id": id_, "sheet": "M601", "page": 20,
        "title_as_printed": title,
        # This wide schedule uses many narrow and vertically-labelled columns.
        # A left-to-right literal row preserves every printed nonblank cell,
        # including its source ordering, without inventing a normalization.
        "columns": "source_row_as_printed",
        "x_edges": [x0, 2700], "y_ranges": y_ranges, "rows": rows,
        "row_reading_order": "left_to_right",
        "header_evidence": [{"bbox": title_box, "expected": title}],
        "source_row_semantics": "Each cell is the complete literal, left-to-right nonblank source-row content. It is a schedule identity/specification, not a plan-verified installed count.",
    }


def main():
    chillers = [
        'CH-1 MECHANICAL C166 OUTSIDE - - 15.29 85 77.0 400.1 128.1 99.9 30% PG 0.0001 55 40 8.8 4.2 6.8 - - - - - - SCROLL R-410A 95.0 - 202.0 225.0 460/3/60 NO Yes Yes Yes Yes Yes Yes Yes 5331 QUANTECH QTC3085TSE46XFBSXXX 1,2,3,4,5,6',
        'CH-2 MECHANICAL C166 OUTSIDE - - 15.15 140 134.0 624.5 222.3 149.9 30% PG 0.0001 55 40 13.2 6.5 10.8 - - - - - - SCROLL R-410A 95.0 333.0 350.0 460/3/60 NO Yes Yes Yes Yes Yes Yes Yes 7699 QUANTECH QTC3140TSE46XFBSXXX 1,2,3,4,5,6',
        'HRC-1 MECHANICAL C166 3.40 4.40 - - 27.2 - 64.6 33.6 30% PG 0.0001 55 44 10.2 - 56.5 WATER 95 110 14.26 - SCROLL R-410A - - 68.0 100.0 460/3/60 NO Yes Yes Yes Yes Yes Yes Yes 150 MULTISTACK HSS520XNHCRAA 1,2,3,4,5,7',
        'HRC-2 MECHANICAL C166 3.40 4.40 - - 27.2 - 64.6 33.6 30% PG 0.0001 55 44 10.2 - 56.5 WATER 95 110 14.26 - SCROLL R-410A - - 68.0 100.0 460/3/60 NO Yes Yes Yes Yes Yes Yes Yes 150 MULTISTACK HSS520XNHCRAA 1,2,3,4,5,7',
    ]
    boilers = [
        'B-1 MECHANICAL C166 CONDENSING 3000 NG 2.0 3500 WATER 220.0 110 140 10:1 0.5 198.0 5" 95.2% 68.4 48.4 91.2 5230 4.0 - 20.0 460/3/60 YES CLEAVER BROOKS CFC-E 3500 1,2',
        'B-2 MECHANICAL C166 CONDENSING 3000 NG 2.0 3500 WATER 220.0 110 140 10:1 0.5 198.0 5" 95.2% 68.4 48.4 91.2 5230 4.0 - 20.0 460/3/60 YES CLEAVER BROOKS CFC-E 3500 1,2',
    ]
    pumps = [
        'HWP-1 MECHANICAL C166 HOT WATER 220 52 125 138 67.6 BASE MOUNTED END SUCTION WATER 140 15 1800 460 3 - YES YES B&G E-1510 1,2',
        'HWP-2 MECHANICAL C166 HOT WATER 220 52 125 138 67.6 BASE MOUNTED END SUCTION WATER 140 15 1800 460 3 - YES YES B&G E-1510 1,2',
        'HCP-1 MECHANICAL D109 DOAS-1 11 - 30 32 - INLINE WATER 140 1/6 3300 115 1 2.1 YES NO B&G PL-36 3',
        'HCP-2 MECHANICAL C166 DOAS-2 14 - 30 32 - INLINE WATER 140 2/5 3250 115 1 4.7 YES NO B&G PL-55 3',
        'HCP-3 KITCHEN B134 DOAS-3 11 - 30 32 - INLINE WATER 140 1/6 3300 115 1 2.1 YES NO B&G PL-36 3',
        'HCP-4 MECHANICAL B107 AHU-4 11 - 30 32 - INLINE WATER 140 1/6 3300 115 1 2.1 YES NO B&G PL-36 3',
        'HRCP-1A MECHANICAL C166 HEAT CHILLED RECOVERY WATER SIDE CHILLER 65 - 10 20 - INLINE 30%PG WATER 55 2/5 3200 115 1 4.8 NO NO B&G PL-130B/2" 3',
        'HRCP-1B MECHANICAL C166 HEAT HOT RECOVERY WATER SIDE CHILLER 57 - 14 20 - INLINE WATER 140 2/5 3250 115 1 4.8 NO NO B&G PL-100B 3',
        'HRCP-2A MECHANICAL C166 HEAT CHILLED RECOVERY WATER SIDE CHILLER 65 - 10 20 - INLINE 30%PG WATER 55 2/5 3200 115 1 4.8 NO NO B&G PL-130B/2" 3',
        'HRCP-2B MECHANICAL C166 HEAT HOT RECOVERY WATER SIDE CHILLER 57 - 14 20 - INLINE WATER 140 2/5 3250 115 1 4.8 NO NO B&G PL-100B 3',
    ]
    tanks = ['ET-1 MECHANICAL 171 HEATING WATER WATER B&G 1', 'ET-2 MECHANICAL 171 CHILLED WATER 30% PG B&G 1']
    separators = ['AS-1 MECHANICAL 171 HEATING WATER B&G 1', 'AS-2 MECHANICAL 171 CHILLED WATER B&G 1']
    glycol = ['GMU-1 MECHANICAL 171 13.8 17.3 25 120 1 BELL & GOSSETT']
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal-row capture of all six M601 central-plant equipment schedule tables: chiller/heat-recovery chiller, condensing boiler, pump, expansion tank, air separator and glycol make-up unit.",
        "tables": [
            table("M601-AIR-COOLED-CHILLERS", "AIR COOLED CHILLER SCHEDULE", 100, [[450,466],[466,479],[479,492],[492,506]], chillers, [800,70,1800,115]),
            table("M601-CONDENSING-BOILERS", "CONDENSING BOILER SCHEDULE", 280, [[783,799],[799,812]], boilers, [800,590,1800,630]),
            table("M601-PUMPS", "PUMP SCHEDULE", 980, [[1065,1080],[1080,1093],[1093,1106],[1106,1119],[1119,1132],[1132,1146],[1152,1168],[1178,1194],[1204,1220],[1231,1247]], pumps, [1450,890,2050,935]),
            table("M601-EXPANSION-TANKS", "EXPANSION TANK SCHEDULE", 1200, [[1485,1500],[1500,1514]], tanks, [1500,1310,2400,1350]),
            table("M601-AIR-SEPARATORS", "AIR SEPARATOR SCHEDULE", 1605, [[1705,1720],[1720,1735]], separators, [1700,1585,2450,1625]),
            table("M601-GLYCOL-MAKE-UP-UNIT", "GLYCOL MAKE-UP UNIT SCHEDULE", 1470, [[1918,1935]], glycol, [1700,1825,2500,1865]),
        ],
        "assertions": [
            {"id":"m601-chiller-note-6","page":20,"bbox":[120,171,1400,183],"expected":"6. INTEGRAL CHILLED WATER PUMPS TO BE DUAL PUMPS WITH 100% BACK UP. PUMPS TO HAVE INTEGRAL VFD’S WITH SENSORLESS CONTROL TECHNOLOGY. INTEGRAL PUMPS TO HAVE SEPARATE BACNET INTERFACE TO ALLOW FOR INDEPENDENT OPERATION FROM CHILLER.","mode":"exact"},
            {"id":"m601-chiller-note-7","page":20,"bbox":[120,181,800,195],"expected":"7. DEDICATED CONSTANT VOLUME PUMPS TO BE PROVIDED BY CHILLER MANUFACTURER FOR FIELD INSTALLATION BY INSTALLING CONTRACTOR.","mode":"exact"},
        ],
        "schedule_scope": {
            "control_valve_schedule":"No standalone hydronic control-valve schedule appears on M601.",
            "damper_actuator_schedule":"No standalone damper-actuator schedule appears on M601; M603 supplies the separate motorized-damper schedule.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
