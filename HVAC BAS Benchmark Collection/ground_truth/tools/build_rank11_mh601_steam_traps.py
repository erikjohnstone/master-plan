"""Literal complete MH601 building steam-trap schedule for Rank 11."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; AUDIT=ROOT/"ground_truth"; IDENT="11__vol1__05"; OUT=AUDIT/"work"/IDENT/"schedules_mh601_steam_traps.json"
def r(y0,y1,*v): return y0,y1,"|".join(v)
def main():
 rows=[
  r(815,824,"1-TP28-1","LEVEL 3 KITCHEN","RH-1","106","[ 48 ]","15","[ 100 ]","15","[ 100 ]","F&T","0.75","[ 19 ]","(1) (6)"),
  r(828,837,"1-TP28-2","LEVEL 3 KITCHEN","RH-2","106","[ 48 ]","15","[ 100 ]","15","[ 100 ]","F&T","0.75","[ 19 ]","(1) (6)"),
  r(841,850,"1-TP28-3","LEVEL 3 KITCHEN","RH-3","106","[ 48 ]","15","[ 100 ]","15","[ 100 ]","F&T","0.75","[ 19 ]","(1) (6)"),
  r(854,863,"1-TP28-4","LEVEL 3 DINING","RH-4","106","[ 48 ]","15","[ 100 ]","15","[ 100 ]","F&T","0.75","[ 19 ]","(1) (6)"),
  r(867,876,"1-TP28-5","LEVEL 3 KITCHEN","RH-5","106","[ 48 ]","15","[ 100 ]","15","[ 100 ]","F&T","0.75","[ 19 ]","(1) (6)"),
  r(880,889,"1-TP28-6","LEVEL 3 DINING","RH-6","34","[ 15 ]","15","[ 100 ]","15","[ 100 ]","F&T","0.75","[ 19 ]","(1) (6)"),
  r(893,902,"1-TP28-7","LEVEL 3 DINING","RH-7","44","[ 20 ]","15","[ 100 ]","15","[ 100 ]","F&T","0.75","[ 19 ]","(1) (6)"),
  r(906,915,"1-TP28-8","LEVEL 3 DINING","RH-8","61","[ 28 ]","15","[ 100 ]","15","[ 100 ]","F&T","0.75","[ 19 ]","(1) (6)"),
  r(919,928,"1-TP28-9","LEVEL 3 DINING","RH-9","95","[ 43 ]","15","[ 100 ]","15","[ 100 ]","F&T","0.75","[ 19 ]","(1) (6)"),
  r(931,941,"1-TP28-10A","THIRD FLOOR ROOF","AC-28 HEATING COIL","630","[ 290 ]","15","[ 100 ]","15","[ 100 ]","F&T","0.75","[ 19 ]","(1) (5) (6)"),
  r(944,954,"1-TP28-10B","THIRD FLOOR ROOF","AC-28 HEATING COIL","333","[ 150 ]","15","[ 100 ]","15","[ 100 ]","F&T","0.75","[ 19 ]","(1) (5) (6)"),
  r(957,967,"1-TP28-11","THIRD FLOOR ROOF","AC-28 DRIP","18","[ 8 ]","20","[ 140 ]","20","[ 140 ]","IBT","0.75","[ 19 ]","(3) (4) (6)"),
  r(970,980,"1-TP36-1","P10","AC-36 HEATING COIL","2325","[ 1100 ]","10","[ 69 ]","10","[ 69 ]","F&T","2","[ 50 ]","(1) (2) (6)"),
  r(983,993,"1-TP36-2","P10","AC-36 DRIP","360","[ 440 ]","15","[ 100 ]","15","[ 100 ]","IBT","0.75","[ 19 ]","(3) (4) (6)"),
  r(996,1006,"1-TP36TEMP-1A","NINTH FLOOR ROOF","AC-36TEMP HEATING COIL","1067","[ 480 ]","10","[ 69 ]","10","[ 69 ]","F&T","1.25","[ 31 ]","(1) (5) (6)"),
  r(1009,1019,"1-TP36TEMP-1B","NINTH FLOOR ROOF","AC-36TEMP HEATING COIL","638","[ 290 ]","10","[ 69 ]","10","[ 69 ]","F&T","1","[ 25 ]","(1) (5) (6)"),
  r(1022,1031,"1-TP36TEMP-1C","NINTH FLOOR ROOF","AC-36TEMP HEATING COIL","638","[ 290 ]","10","[ 69 ]","10","[ 69 ]","F&T","1","[ 25 ]","(1) (5) (6)"),
  r(1035,1044,"1-TP36TEMP-2","NINTH FLOOR ROOF","AC-36TEMP DRIP","22","[ 10 ]","15","[ 100 ]","15","[ 100 ]","IBT","0.75","[ 19 ]","(3) (4) (6)"),
  r(1048,1057,"1-TP57-1","NINTH FLOOR ROOF","AC-57 HEATING COIL","303","[ 140 ]","10","[ 69 ]","10","[ 69 ]","F&T","0.75","[ 19 ]","(1) (6)"),
  r(1061,1070,"1-TP57-2","NINTH FLOOR ROOF","AC-57 DRIP","14","[ 6 ]","15","[ 100 ]","15","[ 100 ]","IBT","0.75","[ 19 ]","(3) (4) (6)"),
  r(1074,1083,"1-TP57-3","P10","MECH ROOM DRIP","33","[ 15 ]","15","[ 100 ]","15","[ 100 ]","IBT","0.75","[ 19 ]","(3) (4) (6)"),
 ]
 t={"id":"MH601-BUILDING-STEAM-TRAPS","sheet":"MH601","page":39,"title_as_printed":"BUILDING STEAM TRAP SCHEDULE","columns":"mark|location|system_or_service|capacity_lbhr|capacity_kghr|min_diff_pressure_psi|min_diff_pressure_kpa|min_inlet_pressure_psi|min_inlet_pressure_kpa|trap_type|trap_size_inches|trap_size_mm|notes","x_edges":[1850,1930,2045,2185,2250,2320,2400,2470,2540,2600,2670,2740,2800,2885],"y_ranges":[[a,b] for a,b,_ in rows],"rows":[x for _,_,x in rows],"row_reading_order":"right","header_evidence":[{"bbox":[2205,644,2526,663],"expected":"BUILDING STEAM TRAP SCHEDULE"}],"source_row_semantics":"Complete literal schedule row; it is not expanded into installed physical count, procurement, piping layout, monitoring point, wiring, or controller I/O conclusions."}
 data={"document_id":IDENT,"module_role":"Complete literal 21-row MH601 building-steam-trap schedule capture.","tables":[t],"assertions":[]}
 OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(data,indent=2,ensure_ascii=False)+"\n")
if __name__=="__main__":main()
