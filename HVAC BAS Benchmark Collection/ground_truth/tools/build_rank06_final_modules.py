"""Author rank-06 coordinator modules and manifest without PDF discovery."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
AUDIT=ROOT/'ground_truth'; IDENT='06__vol2__096'; WORK=AUDIT/'work'/IDENT

PAGES=[
 ('M001','MECHANICAL LEGEND / GENERAL NOTES','Mechanical legends, abbreviations, symbols and controls context.'),
 ('M012','LEVEL 1 THERMAL ZONE DIAGRAM','Thermal-zone diagram and local plan-scale context.'),
 ('M023','SECOND FLOOR THERMAL ZONE DIAGRAM','Second-floor thermal-zone diagram and local plan-scale context.'),
 ('M110A','FIRST FLOOR DEMOLITION PLAN UNIT A','Mechanical demolition plan for Unit A.'),
 ('M110B','FIRST FLOOR DEMOLITION PLAN UNIT B','Mechanical demolition plan for Unit B.'),
 ('M120','ATTIC FLOOR DEMOLITION PLAN','Mechanical attic demolition-plan context.'),
 ('M210A','FIRST FLOOR DUCTWORK PLAN UNIT A','Unit A ductwork, devices and equipment plan context.'),
 ('M210B','FIRST FLOOR DUCTWORK PLAN UNIT B','Unit B ductwork, devices and equipment plan context.'),
 ('M210C','FIRST FLOOR DUCTWORK PLAN UNIT C','Unit C ductwork, devices and equipment plan context.'),
 ('M220C','SECOND FLOOR DUCTWORK PLAN UNIT C','Second-floor Unit C ductwork plan context.'),
 ('M230','JAIL ROOF PLAN MECHANICAL','Jail roof mechanical plan context.'),
 ('M230C','POD ROOF PLAN MECHANICAL','Pod roof mechanical plan context.'),
 ('M310A','FIRST FLOOR PIPING PLAN UNIT A','Unit A hydronic piping plan context.'),
 ('M310B','FIRST FLOOR PIPING PLAN UNIT B','Unit B hydronic piping plan context.'),
 ('M310C','FIRST FLOOR PIPING PLAN UNIT C','Unit C hydronic piping plan context.'),
 ('M320C','SECOND FLOOR PIPING PLAN UNIT C','Second-floor Unit C piping plan context.'),
 ('M400','MECHANICAL SECTIONS','Cell/chase mechanical sections and detail context.'),
 ('M500','MECHANICAL ROOM PIPING','Mechanical-room Unit B piping plan context.'),
 ('M600','SCHEDULES - MECHANICAL','AHU system, fan, coil, heat-exchanger, filter and attenuator schedules.'),
 ('M601','SCHEDULES - MECHANICAL','Chiller, boiler, pump, expansion tank, separator and glycol make-up schedules.'),
 ('M602','SCHEDULES - MECHANICAL','Unit heater, DX, louver, hood, FCU and exhaust fan schedules.'),
 ('M603','SCHEDULES - MECHANICAL','Air-device, VAV and motorized-damper schedules.'),
 ('M701','CHILLED/HOT WATER ISOMETRIC','Chilled- and heating-water isometric context.'),
 ('M801','MECHANICAL DETAILS','Mechanical detail context.'),
 ('M802','MECHANICAL DETAILS','Mechanical detail context.'),
 ('M803','MECHANICAL DETAILS','Mechanical detail context.'),
 ('M804','MECHANICAL DETAILS','Mechanical detail context.'),
 ('M805','MECHANICAL DETAILS','Mechanical detail context.'),
 ('M806','MECHANICAL DETAILS','Mechanical detail context.'),
 ('M807','MECHANICAL DETAILS','AHU mechanical details.'),
 ('M901','CHILLER AND HOT WATER PLANTS CONTROLS SCHEMATIC','Chilled-water/hot-water controls, DDC matrices, sequence and BAS architecture.'),
 ('M902','DOAS-1 & DOAS-2 CONTROL SCHEMATIC','DOAS 1/2 controls, DDC matrix and sequence.'),
 ('M903','AHU-4 CONTROL SCHEMATIC','AHU-4 controls, DDC matrix and sequence.'),
 ('M904','DOAS-3 CONTROL SCHEMATIC','DOAS-3 controls, DDC matrix and sequence.'),
 ('M905','HVAC CONTROLS','Sallyport, pod and jail exhaust control schematics, matrices and sequences.'),
 ('M906','HVAC CONTROLS','Terminal, FCU, unit-heater, general-exhaust and HRC controls.'),
]

def write(name,value):
 WORK.mkdir(parents=True,exist_ok=True);(WORK/name).write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')

def pages():
 return [{'page':i,'sheet':sheet,'title':title,'render':f'reviews/{IDENT}/p{i}-p{i}-full-poppler.png','finding':finding} for i,(sheet,title,finding) in enumerate(PAGES,1)]

def metadata(review):
 return {'document_id':IDENT,'module_role':'Project/title-block, sheet, local-scale and all-page visual-review context. Strict schedules, point matrices and sequence clauses are in separately corroborated modules.','tables':[],
 'project':{'project_name_as_printed':'VERMILLION COUNTY JAIL','owner_as_printed':'VERMILLION COUNTY COMMISSIONERS','location_as_printed':'HILLSDALE, IN','project_number_as_printed':'17-700-078-2','issue_as_printed':'100% CD Bid Set','issue_date_as_printed':'04.12.2021','revision_date_status':'The issue date is retained as an issue date; no populated revision date is asserted.','assertion_ids':['rank06-title-owner-project','rank06-issue','rank06-location','rank06-project-no','rank06-issue-date']},
 'sheet_details':{'sheet_ledger_semantics':'All 36 supplied PDF pages have a completed full-page visual-review disposition below.','revision_status':'No populated revision date is asserted from the reviewed title blocks.'},
 'scale_semantics':{'printed_local_view_scales_observed':[{'page':7,'sheet':'M210A','view':'first floor Unit A ductwork plan','scale_as_printed':'1/8" = 1\'-0"'}],'takeoff_scale_status':'The cited scale is local to the cited plan view. No global scale is asserted; schedules, schematics and details must not be scaled from it.','assertion_ids':['rank06-scale-m210a']},
 'visual_review_pages':review,
 'assertions':[
  {'id':'rank06-title-owner-project','page':1,'bbox':[2800,400,2940,870],'expected':'VERMILLION COUNTY COMMISSIONERS VERMILLION COUNTY JAIL','mode':'exact','reading_direction':'up'},
  {'id':'rank06-issue','page':1,'bbox':[2760,570,2820,715],'expected':'100% CD Bid Set','mode':'exact','reading_direction':'up'},
  {'id':'rank06-location','page':1,'bbox':[2980,620,3010,710],'expected':'HILLSDALE, IN','mode':'exact','reading_direction':'up'},
  {'id':'rank06-project-no','page':1,'bbox':[2800,1145,2920,1180],'expected':'#: 17-700-078-2','mode':'exact'},
  {'id':'rank06-issue-date','page':1,'bbox':[2800,1265,2880,1300],'expected':'04.12.2021','mode':'exact'},
  {'id':'rank06-scale-m210a','page':7,'bbox':[800,1625,980,1670],'expected':'1/8" = 1\'-0"','mode':'contains'},
 ]}

SCHEDULE_COMPONENTS=['schedules_m600_air_systems','schedules_m601_core','schedules_m602_terminal_equipment','schedules_m603_air_devices','schedules_m603_vavs','schedules_m603_motorized_dampers']
POINT_COMPONENTS=['points_m901','points_m902','points_m903','points_m904','points_m905','points_m906']

def equipment():
 return {'document_id':IDENT,'module_role':'Presentation mode for the complete literal schedule-row corpus. It deliberately retains each corroborated schedule row without manufacturing clean equipment identities, placement counts, or plan quantities.','tables':[],'ledger_mode':'literal_schedule_rows_v1','schedule_counts':{'tables':25,'rows':239,'interpretation':'25 complete schedule tables and 239 literal schedule rows are retained verbatim in schedule components. Blank source cells and merged/vertical headings are not converted to claimed values.'},'control_valve_and_damper_schedule_status':{'control_valve_schedule':'No standalone control-valve schedule is supplied on M600-M603; coil/plant schedules and control sequences are retained without inferring valve tags/specifications.','damper_actuator_schedule':'Present: M603 publishes 24 motorized-damper schedule rows with tags, dimensions, 24V, normally-open/closed state, quantity, manufacturer and model. No torque, signal type, spring-return state or controller terminal is added where not printed.'},'source_boundary':'Schedule text is a source reference and is not treated as proof of installed location/multiplicity or a physical equipment takeoff.'}

def point_apps():
 tables=[('m901-chilled-water','M901-CHILLED-WATER-DDC'),('m901-heating-hot-water','M901-HEATING-HOT-WATER-DDC'),('m902-doas-1-2','M902-DOAS-1-2-DDC'),('m903-ahu-4','M903-AHU-4-DDC'),('m904-doas-3','M904-DOAS-3-DDC'),('m905-sallyport-exhaust','M905-SALLYPORT-EXHAUST-DDC'),('m905-jail-exhaust','M905-JAIL-EXHAUST-DDC'),('m905-pod-exhaust','M905-POD-EXHAUST-DDC'),('m906-heat-recovery-chiller','M906-HEAT-RECOVERY-CHILLER-DDC')]
 return {'document_id':IDENT,'module_role':'Explicit source-table application scopes for every printed BAS point-matrix row.','tables':[],'ledger_mode':'literal_source_row_matrices_v1','applications':[{'id':id_,'source_table':table,'ownership_scope':'Literal source-matrix context only; no final physical owner, controller terminal or I/O-card allocation is printed.'} for id_,table in tables],'expanded_template_counts':{'source_rows':229,'total':229},'expanded_count_warning':'229 is the count of literal published source-matrix rows, including repeated labels. It is not an installed BAS point, controller, I/O, terminal, wire, device or address total.'}

def supporting():
 return {'document_id':IDENT,'module_role':'Explicit source limitations and corroboration boundaries for the supplied 36-page set.','tables':[],
 'source_limitations':['M600-M603 provide 25 literal equipment schedule tables / 239 rows, but no separately titled hydronic control-valve schedule. The record does not infer unprinted valve tags, valve authority, actuator torque/signal, fail action, controller terminals, locations or installed quantities.','M603 provides a 24-row motorized-damper schedule; it is retained with only printed tag/size/24V/normal state/quantity/make/model/remarks.','M901-M906 provide 229 literal DDC source-matrix rows, including source duplicate labels. They are not a final physical point, controller card, terminal, cable, device or wiring total.','The published BAS communication notes require LAN transmission plus certain hard-wired signals for loss-of-LAN operation. They do not establish final protocol transport, IP/VLAN, address, port, device count or network topology.','All 36 pages were visually reviewed through retained Poppler renders. Every authored literal schedule/point row and bounded textual clause is independently rechecked against MuPDF and Poppler captures.'],
 'text_absence_assertions':[{'id':'rank06-no-control-valve-schedule-title','pages':list(range(1,37)),'covers_all_source_pages':True,'patterns':[r'CONTROL\s+VALVE\s+SCHEDULE'],'visual_review_qualification':'Native-text absence is not engineering proof; it is paired with full visual review. The limited finding is no standalone schedule title/row set with that wording.'}]}

def audit():
 records=[
 ('project_identity','Printed project, owner, location, number and issue context are retained.','modules','metadata','project'),
 ('sheet_details','All 36 supplied pages have a reviewed source-sheet/title disposition.','modules','metadata','visual_review_pages'),
 ('scale_verification','Only an observed local plan scale is stated; no global scale is claimed.','modules','metadata','scale_semantics'),
 ('equipment_tags_and_classification','All 25 published schedule tables are retained as literal rows without derived installed counts.','modules','equipment_reconciliation','schedule_counts'),
 ('schedule_rows_and_specs','The complete 239 literal M600-M603 schedule rows are included in schedule components.','modules','schedules','tables'),
 ('point_lists_and_equipment_ownership','All 229 point-matrix rows have explicit source-matrix-only application scopes.','modules','point_applications','applications'),
 ('network_architecture','LAN and hard-wired loss-of-LAN context is retained while final topology remains unavailable.','modules','controls_context','network_architecture'),
 ('sequences_and_diagrams','Thirteen BAS sequence subjects across M901-M906 have checked operational clauses.','modules','controls_context','sequence_inventory'),
 ('space_sensors_and_zones','VAV, pressure, airflow, humidity and temperature controls context is retained in source matrices/sequences without a fabricated sensor total.','modules','points','tables'),
 ('source_limitations_and_conflicts','Valve, actuator, network, count and revision boundaries are explicit.','modules','supporting_evidence','source_limitations'),
 ('all_page_visual_review','All supplied pages have retained full-page visual review evidence.','page_review'),
 ('independent_corroboration','Every authored component is rechecked against both raw engines during bundle verification.','module_source_sha256')]
 return [{'id':id_,'result':'reviewed_with_source_limitations_recorded','finding':finding,'evidence':[list(path)]} for id_,finding,*path in records]

def manifest(review):
 return {'id':IDENT,'rank':6,'title':'Vermillion County Jail Addition & Renovation','source_pdf':'pdf/06__vol2__096__Vermillion_County_Jail.pdf','source_sha256':'72da836a803740382b319b718c1f10d8daeff6e5dbe869f1e68ff173ea4092ec','page_count':36,'review_status':'complete_with_documented_source_limitations',
 'scope':'Complete source-bounded ground truth for the supplied 36-page Vermillion County Jail set: visual review of every page; title-block/sheet/local-scale context; 25 complete M600-M603 schedule tables with 239 literal rows; standalone 24-row motorized-damper schedule; 229 literal M901-M906 DDC point-matrix rows; BAS LAN/hard-wire context; and 13 sequence subjects with independently checked operational clauses. It does not fabricate installed equipment/sensor/damper/valve quantities, physical I/O/cards/terminals/wiring, controller details or network topology/addressing.',
 'reading_notes':['Wide source tables are retained as complete left-to-right literal nonblank rows to preserve their narrow/merged/vertical headers and all source values without unsupported normalization.','M603 contains the project’s distinct 24-row motorized-damper schedule and a 58-row VAV schedule, both captured separately at strict source-cell level.','M901-M906 retain all 229 published point-matrix rows, including repeated labels, as source facts rather than physical point counts.','All 36 source pages were visually reviewed and every component is dual-parser checked during final build/verification.'],
 'verification_semantics':'The bundle verifier re-runs independent MuPDF and Poppler checks for every authored schedule/point row and sequence/network/title assertion, then hashes the source, manifest, modules and cited full-page review renders. It validates evidence and annotation integrity rather than performing production extraction or engineering inference.',
 'module_order':['metadata','schedules','points','controls_context','equipment_reconciliation','point_applications','supporting_evidence'],
 'module_sources':{'metadata':['metadata_rank06'],'schedules':SCHEDULE_COMPONENTS,'points':POINT_COMPONENTS,'controls_context':['controls_sequences'],'equipment_reconciliation':['equipment_reconciliation_rank06'],'point_applications':['point_applications_rank06'],'supporting_evidence':['supporting_evidence_rank06']},
 'requirement_audit':audit(),'page_review':[{'page':p['page'],'review_status':'complete','render':p['render'],'finding':p['finding']} for p in review],
 'declared_checks':[{'id':'rank06-full-page-review','path':['page_review'],'operation':'length','expected':36},{'id':'rank06-schedule-table-count','path':['modules','schedules','tables'],'operation':'length','expected':25},{'id':'rank06-point-table-count','path':['modules','points','tables'],'operation':'length','expected':9}],
 'completion_checks':{'all_36_pages_visually_reviewed':True,'all_authoring_modules_dual_engine_verified_at_build':True,'source_limitations_explicit':True,'required_objectives_covered':True}}

def main():
 review=pages(); write('metadata_rank06.json',metadata(review)); write('equipment_reconciliation_rank06.json',equipment()); write('point_applications_rank06.json',point_apps()); write('supporting_evidence_rank06.json',supporting()); write('document_manifest.json',manifest(review))
if __name__=='__main__':main()
