"""Source-bounded M6.01–M6.03 BAS architecture, sequence, and sensor context."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "17__vol1__16"
OUT = AUDIT / "work" / IDENT / "controls_context_rank17.json"


def a(id_, page, bbox, expected):
    return {"id": id_, "page": page, "bbox": bbox, "expected": expected, "mode": "contains"}


def main():
    assertions = [
        a("m601-bacnet-standard", 27, [1365, 174, 1730, 192], "BACNET COMPONENTS ARE TO BE IN ACCORDANCE WITH ASHRAE STANDARD 2016."),
        a("m601-complete-ddc-system", 27, [1365, 198, 1775, 238], "CONTROL SYSTEM CONTRACTOR SHALL PROVIDE A COMPLETE DIRECT DIGITAL CONTROL SYSTEM. PROVIDE AND INSTALL ALL NECESSARY WIRING TO MAKE SYSTEM OPERATIONAL REFER TO CONTROL DIAGRAMS AND SEQUENCE OF OPERATION ON DRAWINGS."),
        a("m601-controller-network", 27, [1365, 241, 1760, 260], "CONTROLS CONTRACTOR SHALL CONNECT CONTROLLERS TO THE CONTROL NETWORK"),
        a("m601-thermographic-plan", 27, [1365, 276, 1755, 295], "CONTROLS CONTRACTOR SHALL PROVIDE A THERMOGRAPHIC FLOOR PLAN INDICATING"),
        a("m601-32-device-trunk", 27, [1365, 306, 1710, 325], "NO MORE THAN 32 DEVICES ALLOWED ON SINGLE COMMUNICATION TRUNK."),
        a("m601-btl-listed", 27, [1365, 352, 1790, 371], "ALL CONTROL DEVICES AND CONTROLLERS SHALL BE BTL LISTED (BACNET TESTING LABORATORY)."),
        a("m601-bacnet-ip", 27, [275, 494, 335, 515], "BACNET IP"),
        a("m601-mstp-trunk-1", 27, [425, 476, 520, 496], "MSTP TRUNK XXXX1"),
        a("m601-mstp-trunk-2", 27, [425, 652, 520, 672], "MSTP TRUNK XXXX2"),
        a("m602-bacnet-mstp-network", 28, [915, 500, 1040, 536], "BACNET/MSTP NETWORK CONNECTION"),
        a("m602-network-wire", 28, [915, 537, 1035, 556], "*22AWG/2C SHIELDED*"),
        a("m601-co2-sensor-legend", 27, [2430, 191, 2560, 211], "CARBON DIOXIDE SENSOR"),
        a("m601-room-temperature-sensor-legend", 27, [2430, 608, 2575, 628], "ROOM TEMPERATURE SENSOR"),
        a("m601-motorized-actuator-legend", 27, [2430, 454, 2550, 474], "MOTORIZED ACTUATOR"),
        a("m602-erv-occupied", 28, [2290, 204, 2735, 222], "ENERGY RECOVERY VENTILATOR (ERV) SHALL BE ENERGIZED DURING OCCUPIED HOURS. ERV SHALL BE"),
        a("m602-erv-leaving-air-alarm", 28, [2290, 236, 2735, 254], "BMS SHALL MONITOR LEAVING AIR TEMPERATURE AND SHALL ALARM IF SUPPLY TEMPERATURE IS BELOW"),
        a("m602-erv-defrost", 28, [2290, 268, 2725, 286], "UNIT INTERNAL CONTROLLER SHALL CONTROL DEFROST CYCLE BASED ON DIFFERENTIAL PRESSURE"),
        a("m602-erv-economizer", 28, [2290, 300, 2735, 318], "UNIT CONTROLLER SHALL CONTROL ECONOMIZER CYCLE. ECONOMIZER CYCLE SHALL STOP WHEEL."),
        a("m602-erv-filter-alarm", 28, [2290, 332, 2670, 350], "WHEN FILTER RESISTANCE IS GREATER THAN 0.50\" W.C. (ADJUSTABLE) BMS TO ALARM."),
        a("m602-furnace-supply-fan", 28, [2255, 473, 2725, 492], "THE SUPPLY FAN SHALL RUN ANYTIME THE UNIT IS COMMANDED TO RUN, UNLESS SHUTDOWN ON SAFETIES."),
        a("m602-furnace-cooling-zone-temperature", 28, [2255, 519, 2720, 538], "THE CONTROLLER SHALL MEASURE THE ZONE TEMPERATURE AND THE UNIT SHALL STAGE THE COOLING TO"),
        a("m602-furnace-cooling-oat-enable", 28, [2275, 578, 2530, 597], "OUTSIDE AIR TEMPERATURE IS GREATER THAN 60°F (ADJ.)."),
        a("m602-furnace-heating-zone-temperature", 28, [2255, 709, 2715, 728], "THE CONTROLLER SHALL MEASURE THE ZONE TEMPERATURE AND THE UNIT SHALL STAGE THE HEATING TO"),
        a("m602-furnace-heating-oat-enable", 28, [2275, 779, 2515, 799], "OUTSIDE AIR TEMPERATURE IS LESS THAN 65°F (ADJ.)."),
        a("m602-furnace-mixed-air", 28, [2255, 887, 2545, 906], "THE CONTROLLER SHALL MONITOR THE MIXED AIR TEMPERATURE."),
        a("m602-furnace-supply-air", 28, [2255, 921, 2550, 941], "THE CONTROLLER SHALL MONITOR THE SUPPLY AIR TEMPERATURE."),
        a("m602-furnace-optimal-start", 28, [2255, 990, 2705, 1010], "THE UNIT SHALL USE AN OPTIMAL START ALGORITHM FOR MORNING START-UP. THIS ALGORITHM SHALL"),
        a("m602-furnace-override", 28, [2255, 1048, 2730, 1067], "A TIMED LOCAL OVERRIDE CONTROL SHALL ALLOW AN OCCUPANT TO OVERRIDE THE SCHEDULE AND PLACE"),
        a("m602-furnace-high-supply-temp-alarm", 28, [2275, 1118, 2655, 1137], "HIGH SUPPLY AIR TEMP: IF THE SUPPLY AIR TEMPERATURE IS GREATER THAN 120°F (ADJ.)."),
        a("m602-furnace-filter-change-alarm", 28, [2275, 1238, 2710, 1257], "FINAL FILTER CHANGE REQUIRED: FINAL FILTER HAS BEEN IN USE FOR MORE THAN 2200 HRS. (ADJ.)."),
        a("m602-exhaust-fan-off-warmup", 28, [1765, 170, 2135, 189], "EXHAUST FAN SHALL REMAIN OFF DURING MORNING WARM UP AND COOL DOWN."),
        a("m602-exhaust-fan-occupied", 28, [1765, 188, 2205, 207], "EXHAUST FANS SHALL BE ENABLED THROUGH BUILDING AUTOMATION SYSTEM DURING OCCUPIED"),
        a("m602-exhaust-fan-status", 28, [1765, 215, 2145, 234], "EXHAUST FAN STATUS SHALL BE MONITORED BY THE BUILDING AUTOMATION SYSTEM."),
        a("m602-exhaust-fan-current-alarm", 28, [1765, 272, 2180, 291], "AN ALARM CONDITION SHALL BE INDICATED WHENEVER THE EXHAUST FAN CURRENT SENSOR"),
        a("m603-oau-occupied", 29, [1700, 179, 2150, 198], "THE SUPPLY FANS ON OUTSIDE AIR UNITS (OAU-B1 AND OAU-B2) SHALL ENERGIZE DURING OCCUPIED"),
        a("m603-oau-warmup-off", 29, [1720, 214, 2085, 233], "SUPPLY FAN SHALL REMAIN OFF DURING MORNING WARM UP AND COOL DOWN."),
        a("m603-oau-heating-oat", 29, [1700, 249, 2155, 268], "WHENEVER OUTSIDE AIR TEMPERATURE IS BELOW 35°F (ADJUSTABLE), HEATING MODE SHALL BE ENABLED"),
        a("m603-oau-gas-valve", 29, [1720, 284, 2145, 303], "DUCT FURNACE GAS VALVE SHALL MODULATE TO MAINTAIN LEAVING AIR TEMPERATURE OF 35°F"),
        a("m603-oau-cooling-enable", 29, [1700, 329, 2165, 349], "WHENEVER OUTSIDE AIR TEMPERATURE IS ABOVE 85°F, COOLING SHALL BE ENABLED ON OUTSIDE AIR FANS"),
        a("m603-oau-filter-alarm", 29, [1720, 423, 2040, 442], "FILTER DIFFERENTIAL PRESSURE GREATER THAN 0.25\" W.C. (ADJUSTABLE)."),
        a("m603-oau-low-leaving-air", 29, [1720, 448, 1995, 467], "LOW LEAVING AIR TEMPERATURE, BELOW 20°F (ADJUSTABLE)."),
        a("m603-oau-high-duct-static", 29, [1720, 496, 2140, 515], "HIGH DUCT STATIC SHALL SHUT DOWN UNIT WHENEVER DUCT STATIC IS GREATER THAN 3\" W.C."),
        a("m603-oau-damper-open", 29, [2245, 203, 2730, 222], "THE SUPPLY FAN IS ON, CONTROL DAMPERS (CD-B1, CD-OA1, AND CD-OA2) SHALL BE FULLY OPEN."),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Source-bounded M6.01–M6.03 BAS network, symbols, sequences, alarms and damper-control context.",
        "tables": [], "assertions": assertions,
        "network_architecture": {
            "published_integration": [
                "M6.01 calls for BACnet components compliant with the cited ASHRAE standard, BTL-listed control devices/controllers, and a complete DDC system.",
                "M6.01 depicts BACnet IP plus two labeled MSTP trunk paths; M6.02 depicts a BACnet/MSTP network connection and shielded cable note.",
                "M6.01 limits a single communication trunk to no more than 32 devices.",
            ],
            "assertion_ids": ["m601-bacnet-standard", "m601-complete-ddc-system", "m601-controller-network", "m601-32-device-trunk", "m601-btl-listed", "m601-bacnet-ip", "m601-mstp-trunk-1", "m601-mstp-trunk-2", "m602-bacnet-mstp-network", "m602-network-wire"],
            "boundary": "These diagrams and notes do not publish final IP addresses, BACnet device/object IDs, controller-card or terminal assignments, a router/media/termination schedule, cable lengths, or a final installed controller/device total.",
        },
        "sequence_inventory": [
            {"id": "m602-c-wing-erv", "sheet": "M6.02", "assertion_ids": ["m602-erv-occupied", "m602-erv-leaving-air-alarm", "m602-erv-defrost", "m602-erv-economizer", "m602-erv-filter-alarm"]},
            {"id": "m602-furnace-and-condensing-unit", "sheet": "M6.02", "assertion_ids": ["m602-furnace-supply-fan", "m602-furnace-cooling-zone-temperature", "m602-furnace-cooling-oat-enable", "m602-furnace-heating-zone-temperature", "m602-furnace-heating-oat-enable", "m602-furnace-mixed-air", "m602-furnace-supply-air", "m602-furnace-optimal-start", "m602-furnace-override", "m602-furnace-high-supply-temp-alarm", "m602-furnace-filter-change-alarm"]},
            {"id": "m602-exhaust-fan", "sheet": "M6.02", "assertion_ids": ["m602-exhaust-fan-off-warmup", "m602-exhaust-fan-occupied", "m602-exhaust-fan-status", "m602-exhaust-fan-current-alarm"]},
            {"id": "m603-building-b-outdoor-air-unit", "sheet": "M6.03", "assertion_ids": ["m603-oau-occupied", "m603-oau-warmup-off", "m603-oau-heating-oat", "m603-oau-gas-valve", "m603-oau-cooling-enable", "m603-oau-filter-alarm", "m603-oau-low-leaving-air", "m603-oau-high-duct-static", "m603-oau-damper-open"]},
        ],
        "sensors_and_control_symbol_context": {
            "published_context": "M6.01’s legend publishes carbon-dioxide, room-temperature and smoke-detector symbols, motorized-actuator and two-position-actuator symbols. M6.02/M6.03 sequences reference temperature, differential-pressure, current and duct-static conditions.",
            "assertion_ids": ["m601-co2-sensor-legend", "m601-room-temperature-sensor-legend", "m601-motorized-actuator-legend", "m602-erv-leaving-air-alarm", "m602-erv-filter-alarm", "m602-exhaust-fan-current-alarm", "m603-oau-filter-alarm", "m603-oau-high-duct-static"],
            "boundary": "Legends, diagrams and sequence references are retained as device/control context only; they are not expanded into exhaustive zone, sensor, actuator, damper, valve, controller, terminal, wiring, or physical-device counts.",
        },
        "control_boundaries": [
            "Every retained sequence clause is text-bound to the supplied drawings. Setpoints marked adjustable remain published design intent, not commissioned settings.",
            "Control-damper schedule rows are retained separately in M0.03. The M6.03 sequence establishes the quoted operating state for CD-B1, CD-OA1 and CD-OA2, but does not make a physical actuator count.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
