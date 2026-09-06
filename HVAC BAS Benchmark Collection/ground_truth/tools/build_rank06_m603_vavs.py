"""Strict literal capture of the M603 Variable Air Volume Terminal Unit Schedule."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "06__vol2__096"
OUT = AUDIT / "work" / IDENT / "schedules_m603_vavs.json"


def row(tag, inlet, maximum, minimum, capacity, cfm, gpm):
    return f"{tag}|TITUS|DESV|{inlet}|{maximum}|{minimum}|{capacity}|2|{cfm}|55.0|85.0|{gpm}|140|110|3/4\"|"


def main():
    values = [
        ("VAV-1-1",'14"',1350,1350,43674,1350,'3.0'), ("VAV-1-2",'14"',1200,1200,38821,1200,'2.6'),
        ("VAV-1-3",'14"',1470,1470,47556,1470,'3.2'), ("VAV-1-4",'14"',1100,1100,35586,1100,'2.4'),
        ("VAV-1-5",'14"',1420,1420,45939,1420,'3.1'), ("VAV-1-6",'10"',1050,1050,33969,1050,'2.3'),
        ("VAV-1-7",'7"',485,485,15690,485,'1.1'), ("VAV-1-8",'7"',450,450,14558,450,'1.0'),
        ("VAV-2-1",'8"',600,600,19411,600,'1.3'), ("VAV-2-2",'8"',605,605,19572,605,'1.4'),
        ("VAV-2-3",'8"',580,580,18764,580,'1.3'), ("VAV-2-4",'7"',490,490,15852,490,'1.1'),
        ("VAV-2-5",'6"',260,260,8411,260,'0.6'), ("VAV-2-6",'6"',320,320,10352,320,'0.7'),
        ("VAV-2-7",'6"',375,375,12132,375,'0.9'), ("VAV-2-9",'12"',1335,1335,43189,1335,'2.9'),
        ("VAV-2-10",'8"',640,640,20705,640,'1.4'), ("VAV-2-11",'6"',400,400,12940,400,'0.9'),
        ("VAV-2-12",'7"',475,475,15367,475,'1.1'), ("VAV-2-13",'10"',1000,1000,32351,1000,'2.2'),
        ("VAV-2-14",'6"',300,300,9705,300,'0.7'), ("VAV-2-15",'7"',445,445,14396,445,'1.0'),
        ("VAV-2-16",'5"',225,225,7279,225,'0.5'), ("VAV-2-17",'5"',250,250,8088,250,'0.6'),
        ("VAV-2-18",'5"',180,180,5823,180,'0.5'), ("VAV-2-19",'4"',135,135,4367,135,'0.5'),
        ("VAV-2-20",'4"',100,100,3235,100,'0.5'), ("VAV-2-21",'7"',530,530,17146,530,'1.2'),
        ("VAV-2-22",'4"',120,120,3882,120,'0.5'), ("VAV-2-23",'5"',195,195,6308,195,'0.5'),
        ("VAV-2-25",'7"',430,430,13911,430,'1.0'), ("VAV-2-26",'4"',140,140,4529,140,'0.5'),
        ("VAV-2-27",'5"',205,205,6632,205,'0.5'), ("VAV-2-28",'7"',465,465,15043,465,'1.1'),
        ("VAV-2-29",'7"',540,540,17470,540,'1.2'), ("VAV-2-30",'5"',240,240,7764,240,'0.6'),
        ("VAV-2-31",'4"',75,75,2426,75,'0.5'),
        ("VAV-4-1",'8"',100,30,3235,100,'0.5'), ("VAV-4-2",'8"',220,70,7117,220,'0.5'),
        ("VAV-4-3",'12"',1260,380,40762,1260,'2.8'), ("VAV-4-4",'8"',265,80,8573,265,'0.6'),
        ("VAV-4-5",'9"',720,220,23293,720,'1.6'), ("VAV-4-6",'8"',225,70,7279,225,'0.5'),
        ("VAV-4-7",'7"',430,130,13911,430,'1.0'), ("VAV-4-8",'9"',735,225,23778,735,'1.6'),
        ("VAV-4-9",'6"',290,90,9382,290,'0.7'), ("VAV-4-10",'5"',235,75,7603,235,'0.6'),
        ("VAV-4-11",'5"',230,70,7441,230,'0.5'), ("VAV-4-12",'8"',270,85,8735,270,'0.6'),
        ("VAV-4-13",'8"',135,45,4367,135,'0.5'), ("VAV-4-14",'8"',120,40,3882,120,'0.5'),
        ("VAV-4-15",'6"',310,95,10029,310,'0.7'), ("VAV-4-16",'8"',280,85,9058,280,'0.7'),
        ("VAV-4-17",'8"',600,180,19411,600,'1.3'), ("VAV-4-18",'4"',80,25,2588,80,'0.5'),
        ("VAV-4-19",'9"',730,220,23616,730,'1.6'), ("VAV-4-20",'6"',280,85,9058,280,'0.7'),
        ("VAV-4-21",'4"',75,25,2426,75,'0.5'),
    ]
    rows = [row(*value) for value in values]
    y_ranges = [[233 + 13*i, 246 + 13*i] for i in range(len(rows))]
    # The published rule below VAV-4-14 steps down slightly more than the
    # preceding rows.  These literal nonuniform bands retain every printed
    # row while keeping the two source text engines independently aligned.
    y_ranges[51:] = [[896, 914], [914, 927], [927, 941], [941, 954],
                     [954, 967], [967, 981], [981, 995]]
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal M603 Variable Air Volume Terminal Unit Schedule capture. It preserves all 58 published VAV schedule rows and the source fields exactly; the table is not a separate plan-instance or complete physical controls count.",
        "tables": [{
            "id":"M603-VAV-TERMINALS", "sheet":"M603", "page":22,
            "title_as_printed":"VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE",
            "columns":"tag|manufacturer|model|inlet|maximum_primary_airflow_cfm|minimum_primary_airflow_cfm|heating_capacity_btu_h|heating_rows|heating_cfm|eat_db_f|lat_db_f|gpm|ewt_f|lwt_f|pipe_dia|remarks",
            "x_edges":[1960,2020,2095,2133,2170,2225,2280,2320,2350,2380,2430,2480,2520,2565,2605,2645,2705],
            "y_ranges":y_ranges, "rows":rows,
            "header_evidence":[{"bbox":[1950,72,2720,115],"expected":"VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE"}],
            "source_row_semantics":"Rows are literal schedule identities/specifications. The schedule has no installed-quantity column; tags are not summed into a plan takeoff without separate placement verification.",
        }],
        "assertions":[
            {"id":"m603-vav-remark-1","page":22,"bbox":[1948,120,2330,137],"expected":"1. TERMINAL BOX CONTROLLER WIRED TO ROOM OCCUPANCY SENSOR BY CIC.","mode":"exact"},
            {"id":"m603-vav-remark-2","page":22,"bbox":[1948,132,2180,148],"expected":"2. TERMINAL BOX SET AT CONSTANT VOLUME.","mode":"exact"},
            {"id":"m603-vav-remark-3","page":22,"bbox":[1948,143,2390,158],"expected":"3. UNLESS OTHERWISE NOTED, ALL DUCT RUNOUTS TO BE 2\" LARGER THAN BOX INLET SIZE.","mode":"exact"},
            {"id":"m603-vav-remark-4","page":22,"bbox":[1948,153,2650,170],"expected":"4. TERMINAL BOX DOWNSTREAM DUCT RUNOUT SHALL BE SIZE OF TERMINAL BOX DISCHARGE. COORDINATE WITH FINAL TERMINAL BOX SUBMITTAL.","mode":"exact"},
        ],
        "schedule_scope": {"control_valve_schedule":"Not represented by this table.", "damper_actuator_schedule":"The VAV table provides unit schedule fields only. It does not supply a distinct actuator make/model/torque/signal/fail-action schedule beyond the separate M603 motorized damper table."},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
