"""Source-bounded M7.01–M7.03 control sequences and integration limits."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "23__vol2__033"
OUT = AUDIT / "work" / IDENT / "controls_context_rank23.json"


def a(id_, page, bbox, expected):
    return {"id": id_, "page": page, "bbox": bbox, "expected": expected, "mode": "contains"}


def main():
    assertions = [
        a("m601-vav-ddc-controller-actuator", 68, [1700, 1344, 2990, 1380], "VAV MANUFACTURER TO MOUNT IN FACTORY THE DDC CARD/CONTROLLER AND DAMPER ACTUATOR FURNISHED BY THE T.C. CONTRACTOR."),
        a("m601-ahu-bas-contractor-controls", 68, [225, 1798, 1230, 1820], "CONTROLS, ACTUATORS, & END DEVICES TO BE FIELD PROVIDED & INSTALLED BY BAS CONTRACTOR."),
        a("m701-ahU-ddc-start-stop", 70, [235, 850, 685, 870], "UNIT IS NORMALLY STARTED AND STOPPED REMOTELY AT THE DDC. H-O-A SWITCH SHALL BE KEPT IN THE"),
        a("m701-ahU-optimal-start", 70, [235, 1108, 685, 1128], "OPTIMAL START SHALL START PRIOR TO SCHEDULED OCCUPANCY BASED ON THE TIME NECESSARY FOR"),
        a("m701-ahU-economizer", 70, [1285, 1425, 1680, 1445], "PROVIDE THE UNIT WITH AN ECONOMIZER CYCLE. OPERATION SHALL BE SUCH THAT WHEN"),
        a("m701-ahU-economizer-enable", 70, [1285, 1440, 1700, 1479], "THE OUTSIDE AIR TEMPERATURE IS LESS THAN THE RETURN AIR TEMPERATURE"),
        a("m701-ahU-economizer-freeze", 70, [1285, 1500, 1710, 1528], "THE ECONOMIZER SHALL BE DISABLED ANYTIME THE MIXED AIR TEMPERATURE DROPS LESS 40°F (ADJ) OR THE FREEZE STAT IS ON."),
        a("m701-ahU-building-dp", 70, [1285, 1560, 1750, 1609], "PROVIDE BUILDING DIFFERENTIAL PRESSURE SENSORS AT EACH FLOOR SERVED BY THE AHU. IN OCCUPIED MODE, ON A RISE IN BUILDING DIFFERENTIAL PRESSURE ABOVE SETPOINT (0.05 W.C., ADJ), THE RETURN FAN"),
        a("m701-ahU-minimum-oa", 70, [1285, 1665, 1740, 1724], "WHEN IN THE OCCUPIED MODE, THE CONTROLLER SHALL MEASURE THE OUTSIDE AIR FLOW AND MODULATE THE OUTSIDE AIR DAMPERS TO MAINTAIN THE PROPER MINIMUM OUTSIDE AIR VENTILATION, OVERRIDING"),
        a("m701-ahU-heat-pump-water", 70, [1285, 1758, 1740, 1810], "THE GEOTHERMAL HEAT PUMP WATER SUPPLY AND RETURN TEMPERATURES (T-6 AND T-7) SHALL BE MONITORED. AN ALARM SHALL BE GENERATED IF THE GEOTHERMAL HEAT PUMP WATER RETURN"),
        a("m701-ahU-heat-pump-alarm", 70, [1285, 1834, 1745, 1868], "THE HEAT PUMP STATUS SHALL BE MONITORED. AN ALARM SHALL BE GENERATED UPON LOW REFRIGERANT PRESSURE, HIGH REFRIGERANT PRESSURE, OR UPON FAILURE OF THE HEAT PUMP."),
        a("m701-ahU-outside-sensor-location", 70, [1285, 1890, 1740, 1918], "LOCATE OUTSIDE SENSOR ON THE EXTERIOR NORTH SIDE OF THE BUILDING. LOCATE OUT OF ANY HEAT"),
        a("m702-vav-occupied-cooling", 71, [1855, 143, 2010, 163], "OCCUPIED COOLING 75°F (ADJ)"),
        a("m702-vav-v2-enable", 71, [1855, 371, 2030, 394], "VALVE V-2 SHALL BE ENABLED WHEN"),
        a("m702-vav-v2-open", 71, [1855, 417, 2020, 438], "OPEN ABOVE 30% (ADJ). VALVE V-2"),
        a("m702-exhaust-fan-run", 71, [2135, 1098, 2285, 1120], "FAN SHALL RUN CONTINUOUSLY."),
        a("m702-exhaust-fan-status", 71, [2125, 1130, 2720, 1160], "THE CONTROLLER SHALL MONITOR THE FAN STATUS."),
        a("m702-exhaust-fan-failure", 71, [2125, 1185, 2740, 1205], "FAN FAILURE: COMMANDED ON, BUT THE STATUS IS OFF."),
        a("m702-pump-redundancy", 71, [1170, 1498, 1545, 1530], "TWO 100% CAPACITY GEOTHERMAL HEAT PUMP WATER PUMPS ARE PROVIDED IN THE SYSTEM (ONE PUMP IS REDUNDANT)."),
        a("m702-pump-lead-first", 71, [1205, 1587, 1370, 1609], "THE LEAD PUMP SHALL RUN FIRST."),
        a("m702-pump-failover", 71, [1205, 1608, 1560, 1635], "ON FAILURE OF THE LEAD PUMP, THE STANDBY PUMP SHALL RUN AND THE LEAD SHALL TURN OFF."),
        a("m702-pump-rotation", 71, [1170, 1650, 1560, 1755], "THE DESIGNATED LEAD PUMP SHALL ROTATE UPON ONE OF THE FOLLOWING CONDITIONS (USER SELECTABLE):"),
        a("m702-pump-dp", 71, [1620, 1640, 2080, 1705], "THE CONTROLLER SHALL MEASURE GEOTHERMAL HEAT PUMP WATER DIFFERENTIAL PRESSURE AND MODULATE THE PUMP VFD TO MAINTAIN ITS DIFFERENTIAL PRESSURE SETPOINT."),
        a("m702-pump-minimum-speed", 71, [1620, 1720, 2070, 1755], "THE CONTROLLER SHALL MODULATE PUMP SPEEDS TO MAINTAIN A DIFFERENTIAL PRESSURE (ADJ.). THE VFD'S MINIMUM SPEED SHALL NOT DROP BELOW 20% (ADJ.)."),
        a("m702-pump-high-dp-alarm", 71, [1620, 1780, 1970, 1800], "HIGH DIFFERENTIAL PRESSURE: IF 25% (ADJ.) GREATER THAN SETPOINT."),
        a("m703-suh-run", 72, [2105, 880, 2255, 902], "RUN CONDITIONS - REQUESTED:"),
        a("m703-suh-zone-enable", 72, [2110, 896, 2700, 918], "THE UNIT SHALL RUN WHEN THE ZONE TEMPERATURE FALLS BELOW 60°F (ADJ.)."),
        a("m703-suh-setpoint-adjust", 72, [2110, 985, 2710, 1012], "THE ZONE TEMPERATURE HEATING SETPOINTS SHALL BE ADJUSTABLE VIA THE BAS."),
        a("m703-suh-fan", 72, [2110, 1030, 2720, 1060], "THE FAN SHALL RUN ANYTIME THE ZONE TEMPERATURE IS BELOW HEATING SETPOINT, UNLESS SHUTDOWN ON SAFETIES."),
        a("m703-suh-heating-valve", 72, [2125, 1120, 2720, 1148], "THE CONTROLLER SHALL MEASURE THE ZONE TEMPERATURE AND MODULATE THE HEATING COIL VALVE TO MAINTAIN ITS HEATING"),
        a("m703-suh-high-dat", 72, [2145, 1258, 2570, 1280], "HIGH DISCHARGE AIR TEMP: IF THE DISCHARGE AIR TEMPERATURE IS GREATER THAN 120°F (ADJ.)."),
        a("m703-suh-low-dat", 72, [2145, 1274, 2550, 1295], "LOW DISCHARGE AIR TEMP: IF THE DISCHARGE AIR TEMPERATURE IS LESS THAN 80°F (ADJ.)."),
        a("m702-controls-cable-contractor", 71, [2550, 1753, 2810, 1840], "CONTROL CONTRACTOR SHAL BE RESPONSIBLE FOR PROVIDING THE CORRECT TYPE, SIZES AND QUANTITIES OF CONTROL CABLES, CONTROLLERS, SENSORS, TRANSFORMERS, DEVICES AND PROGRAMMING NECESSARY FOR A FULLY FUNCTIONAL SYSTEM."),
    ]
    data = {
        "document_id": IDENT, "module_role": "Source-bounded M7.01–M7.03 AHU, VAV, exhaust-fan, pump and suspended-unit-heater sequences and controls-integration context.",
        "tables": [], "assertions": assertions,
        "network_architecture": {
            "published_integration": ["M6.01 assigns AHU-6 controls, actuators and end devices to the BAS contractor; VAV schedule note assigns factory DDC card/controller and damper actuator to the temperature-control contractor.", "M7.02 assigns the control contractor responsibility for controls cable, controllers, sensors, transformers, devices and programming."],
            "assertion_ids": ["m601-vav-ddc-controller-actuator", "m601-ahu-bas-contractor-controls", "m702-controls-cable-contractor"],
            "boundary": "No BACnet/IP/MS/TP network drawing, controller address list, BACnet object list, router/media design, controller/card/terminal schedule, final wiring/termination schedule, or installed controller total is published in the supplied set.",
        },
        "sequence_inventory": [
            {"id": "m701-ahU-6", "sheet": "M7.01", "assertion_ids": ["m701-ahU-ddc-start-stop", "m701-ahU-optimal-start", "m701-ahU-economizer", "m701-ahU-economizer-enable", "m701-ahU-economizer-freeze", "m701-ahU-building-dp", "m701-ahU-minimum-oa", "m701-ahU-heat-pump-water", "m701-ahU-heat-pump-alarm"]},
            {"id": "m702-vav-terminal-unit", "sheet": "M7.02", "assertion_ids": ["m702-vav-occupied-cooling", "m702-vav-v2-enable", "m702-vav-v2-open"]},
            {"id": "m702-exhaust-fan", "sheet": "M7.02", "assertion_ids": ["m702-exhaust-fan-run", "m702-exhaust-fan-status", "m702-exhaust-fan-failure"]},
            {"id": "m702-geothermal-heat-pump-water-pumps", "sheet": "M7.02", "assertion_ids": ["m702-pump-redundancy", "m702-pump-lead-first", "m702-pump-failover", "m702-pump-rotation", "m702-pump-dp", "m702-pump-minimum-speed", "m702-pump-high-dp-alarm"]},
            {"id": "m703-suspended-unit-heater", "sheet": "M7.03", "assertion_ids": ["m703-suh-run", "m703-suh-zone-enable", "m703-suh-setpoint-adjust", "m703-suh-fan", "m703-suh-heating-valve", "m703-suh-high-dat", "m703-suh-low-dat"]},
        ],
        "sensors_and_control_symbol_context": {
            "published_context": "M7.01/M7.02 point matrices and diagrams identify air, temperature, humidity, pressure, airflow, filter, smoke, freezestat, damper, VFD, heat-pump and pump functions. M7.02 also publishes standard control-symbol legend contexts for CO2, CO, occupancy, pressure, flow, temperature and humidity instruments.",
            "assertion_ids": ["m701-ahU-building-dp", "m701-ahU-minimum-oa", "m701-ahU-heat-pump-water", "m701-ahU-outside-sensor-location", "m702-pump-dp", "m703-suh-high-dat"],
            "boundary": "The schedules, diagrams and formal matrices are not transformed into a physical count of sensors, zones, dampers, valves, actuators, controllers, relays, terminals, cables or devices beyond their literal source rows.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
