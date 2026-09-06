"""Source-bounded sequence-of-operation and BAS-network context for rank 06."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];AUDIT=ROOT/'ground_truth';IDENT='06__vol2__096';OUT=AUDIT/'work'/IDENT/'controls_sequences.json'
def a(id_,page,bbox,expected): return {'id':id_,'page':page,'bbox':bbox,'expected':expected,'mode':'exact'}
def main():
 assertions=[
  a('m901-vfc-lan',31,[2325,105,2700,160],'THRU THE LAN, VFC TO TRANSMIT TO BAS STATUS AND ALARMS OF ALL DATA AVAILABLE. VFC SUPPLIER TO FURNISH INTEGRAL COMMUNICATION CARD. TCC TO MAP ALL OWNER REQUESTED INFORMATION POINTS. NOTE THAT START/STOP SIGNAL, STATUS AND SPEED CONTROL ARE HARD WIRED TO DDC TO ENSURE OPERATION ON LOSS OF LAN.'),
  a('m901-chiller-lan',31,[2325,165,2750,215],'THRU THE LAN, CHILLER TO TRANSMIT TO BAS STATUS AND ALARMS OF ALL DATA AVAILABLE. CHILLER SUPPLIER TO FURNISH INTEGRAL COMMUNICATION CARD. TCC TO MAP ALL OWNER REQUESTED INFORMATION POINTS. NOTE THAT ENABLE/DISABLE SIGNAL AND TEMPERATURE SET POINT ARE HARD WIRED TO DDC TO ENSURE OPERATION ON LOSS OF LAN.'),
  a('m901-cw-enable',31,[2300,420,2800,455],'2. ENABLE: THE CHILLED WATER PUMPS SHALL BE OPERATIONAL WHENEVER THE OUTDOOR AIR TEMPERATURE IS GREATER THAN 50°F (ADJ).'),
  a('m901-cw-disable',31,[2300,455,2800,488],'3. DISABLE: THE CHILLED WATER SHALL SHUT DOWN WHENEVER THE OUTDOOR AIR TEMPERATURE FALLS BELOW 46°F (ADJ).'),
  a('m901-hhw-enable',31,[2210,1435,2800,1470],'2. ENABLE: THE HEATING HOT WATER SYSTEM IS STARTED FROM DDC PANEL OR FROM COMMAND OF BUILDING MANAGEMENT SYSTEM. SYSTEM TO RUN CONTINOUSLY.'),
  a('m901-hhw-reset',31,[2200,1650,2800,1680],'F. THE SYSTEM SUPPLY HEATING HOT WATER SET POINT SHALL BE 140°F (ADJ). RESET HEATING HOT WATER FROM 140°F TO 110°F AS THE OUTDOOR AIR VARIES FROM 30°F TO 70°F.'),
  a('m902-doas-enable',32,[1900,980,2800,1005],'2. ENABLE: AIR HANDLER IS STARTED FROM DDC PANEL OR FROM COMMAND OF FACILITY MANAGEMENT SYSTEM.'),
  a('m902-preheat-pump',32,[1900,1368,2300,1390],'vi PREHEAT COIL PUMP: OPERATES BELOW 35°F OAT AND SHUT OFF ABOVE 38°F.'),
  a('m902-hx-frost-bypass',32,[1900,1608,2800,1635],'e. HEAT ECHANGER FROST BYPASS: OA BYPASS DAMPER SHALL MODULATE TO MAINTAIN NO LESS THAN HEAT EXCHANGER LEAVING OAT TEMPERATURE OF 28.8°F (ADJ.)'),
  a('m902-static-trim',32,[1900,1645,2800,1675],'5. SUPPLY FAN SPEED: STATIC PRESSURE SENSOR LOCATED 90% OF DISTANCE THROUGH SUPPLY DUCT AND FAN DISCHARGE STATIC PRESSURE SENSOR LOCATED IN AHU DISCHARGE TO FUNCTION WITH SUPPLY FAN VFC CONTROL LOOP TO MODULATE SUPPLY FAN SPEED TO ACHIEVE DUCT STATIC PRESSURE SET AT 1.25" W.G. (ADJ), NOT TO EXCEED DISCHARGE PRESSURE OF 3.9" W.G. (ADJ). FINAL SETPOINT DETERMINED BY TAB CONTRACTOR AND APPROVED BY ENGINEER.'),
  a('m903-ahu-enable',33,[1900,990,2800,1015],'2. ENABLE: AIR HANDLER IS STARTED FROM DDC PANEL OR FROM COMMAND OF FACILITY MANAGEMENT SYSTEM. AIR HANDLER TO RUN BASED ON SCHEDULED OCCUPANCY, INITALLY'),
  a('m903-economizer',33,[1900,1200,2800,1225],'i. MODULATE THE ECONOMIZER DAMPERS TO MAINTAIN MIXED AIR TEMPERATURE OF 52°F. MIXED AIR SETPOINT SHALL TRACK SUPPLY AIR TEMPERATURE SETPOINT MINUS 3°F'),
  a('m904-doas-enable',34,[1850,700,2800,725],'2. ENABLE: AIR HANDLER IS STARTED FROM DDC PANEL OR FROM COMMAND OF FACILITY MANAGEMENT SYSTEM.'),
  a('m904-reheat',34,[1900,845,2800,870],'COIL SHALL MODULATE TO MAINTAIN DISCHARGE AIR TEMPERATURE SETPOINT TO MAINTAIN SPACE SETPOINT.'),
  a('m905-sallyport-enable',35,[1380,425,2750,445],'b. ENABLE: EXHAUST FAN IS STARTED FROM COMMAND OF FACILITY MANAGEMENT SYSTEM. FAN ISOLATION DAMPER OPENS. DDC'),
  a('m905-pod-zone-dampers',35,[1380,1510,1900,1535],'A. ZONE MOTORIZED RETURN DAMPERS SHALL CLOSE. B. ZONE VAV BOX DAMPER SHALL OPEN TO A SETPOINT CFM DETERMINED'),
  a('m905-jail-zone-dampers',35,[1380,720,1900,745],'ZONE MOTORIZED RETURN DAMPERS SHALL CLOSE. ZONE VAV BOX DAMPER SHALL OPEN TO A SETPOINT CFM DETERMINED'),
  a('m906-vav-sequence',36,[1950,85,2800,145],'SEQUENCE OF OPERATION - VAV BOXES: 1. TERMINAL BOX CONTROLLER SHALL RESPOND TO CHANGES IN SPACE TEMPERATURE AND VARIATIONS IN SYSTEM STATIC PRESSURE TO MODULATE SUPPLY AIR VOLUME VALVE FROM SCHEDULED COOLING MINIMUM TO SCHEDULED MAXIMUM AIRFLOW. WHEN THE BOX HEATING IS REQUIRED, HEATING COIL TO THROTTLE OPEN AND PROVIDE A MAXIMUM OF 85°F (ADJ.) LEAVING AIR TEMPERATURE. BOX HEATING AIRFLOW IS THEN MODULATED FROM SCHEDULED MINIMUM HEATING AIRFLOW TO'),
  a('m906-general-exhaust-enable',36,[1780,1090,2800,1130],'b. ENABLE: EXHAUST FAN IS STARTED FROM COMMAND OF FACILITY MANAGEMENT SYSTEM. c. EXHAUST FAN HAS AN INTEGRAL SPEED CONTROLLER WHICH IS MANUALLY SET DURING TAB. ENABLING THE FAN TO RUN OPENS'),
  a('m906-unit-heater',36,[1670,1938,2400,1968],'2. UNIT IS DISABLED ABOVE 45°F OAT. THE UNIT SHALL CYCLE TO MAINTAIN A 60°F SPACE.'),
  a('m906-fcu',36,[2360,1812,2800,1870],'1. UNIT HEATING COIL VALVE IS MODULATED TO ACHIEVE A SPACE TEMPERATURE SET AT 65°F. 2. UNIT COOLING COIL VALVE IS MODULATED TO ACHIEVE A SPACE AIR TEMPERATURE OF 78°F.'),
  a('m906-hrc',36,[370,1268,1100,1298],'SEQUENCE OF OPERATION: 1. HRC-1 SHALL BE ENABLED TO RUN AT ALL TIMES. HOA 2. WHEN THE OUTSIDE AIR TEMPERATURE IS ABOVE 50°F'),
 ]
 sequence_inventory=[
  {'id':'chilled-water-plant','sheet':'M901','assertion_ids':['m901-cw-enable','m901-cw-disable']},
  {'id':'heating-hot-water-plant','sheet':'M901','assertion_ids':['m901-hhw-enable','m901-hhw-reset']},
  {'id':'doas-1-2','sheet':'M902','assertion_ids':['m902-doas-enable','m902-preheat-pump','m902-hx-frost-bypass','m902-static-trim']},
  {'id':'ahu-4','sheet':'M903','assertion_ids':['m903-ahu-enable','m903-economizer']},
  {'id':'doas-3','sheet':'M904','assertion_ids':['m904-doas-enable','m904-reheat']},
  {'id':'sallyport-exhaust','sheet':'M905','assertion_ids':['m905-sallyport-enable']},
  {'id':'pod-exhaust','sheet':'M905','assertion_ids':['m905-pod-zone-dampers']},
  {'id':'jail-exhaust','sheet':'M905','assertion_ids':['m905-jail-zone-dampers']},
  {'id':'vav-terminal','sheet':'M906','assertion_ids':['m906-vav-sequence']},
  {'id':'general-exhaust','sheet':'M906','assertion_ids':['m906-general-exhaust-enable']},
  {'id':'unit-heater','sheet':'M906','assertion_ids':['m906-unit-heater']},
  {'id':'fan-coil-unit','sheet':'M906','assertion_ids':['m906-fcu']},
  {'id':'heat-recovery-chiller','sheet':'M906','assertion_ids':['m906-hrc']},
 ]
 data={'document_id':IDENT,'module_role':'Source-bounded BAS network and operating-sequence clauses across M901 through M906. The inventory marks subject/sheet coverage; only the stated literal clauses are normalized here.','tables':[],'assertions':assertions,'network_architecture':{'published_transport_and_resilience':['M901 specifies LAN status/alarm transmission, manufacturer integral communication cards, mapped owner-requested points, and hard-wired VFC start/stop/status/speed and chiller enable/disable/temperature-setpoint functions to preserve operation on loss of LAN.'],'assertion_ids':['m901-vfc-lan','m901-chiller-lan'],'boundary':'No final controller model/address, IP/VLAN, port, device count, wiring topology, controller-card, terminal or BACnet instance list is inferred.'},'sequence_inventory':sequence_inventory,'control_boundaries':['All recorded setpoints remain adjustable where printed. This module does not convert schedule rows or diagram symbols into installed point, actuator, damper, sensor, controller, terminal or wiring quantities.']}
 OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
if __name__=='__main__':main()
