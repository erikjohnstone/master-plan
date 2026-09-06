"""Bounded Rank 09 BAS/controls, actuator, sensor, and sequence context."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "09__vol2__014"
OUT = AUDIT / "work" / IDENT / "controls_sequences.json"


def a(id_, page, bbox, expected):
    return {"id": id_, "page": page, "bbox": bbox, "expected": expected, "mode": "exact"}


def main():
    assertions = [
        a("m01-bms-project", 1, [148, 672, 515, 716], 'THIS PROJECT WILL INCLUDE THE INSTALLATION OF A BUILDING MANAGEMENT SYSTEM (BMS). SEE SPECIFICATION SECTIONS 230900 "INSTRUMENTATION AND CONTROL FOR HVAC", 230993 "SEQUENCE OF OPERATIONS FOR HVAC CONTROLS" FOR ADDITIONAL INFORMATION.'),
        a("m01-controls-responsibility", 1, [148, 714, 505, 778], 'IT SHALL BE THE RESPONSIBILITY OF THE TEMPERATURE CONTROLS CONTRACTOR TO PROVIDE ALL LABOR, MATERIAL, EQUIPMENT AND SOFTWARE NOT SPECIFICALLY REFERRED TO ON THE PLANS OR IN THE SPECIFICATION TO ACHIEVE THE SEQUENCE OF OPERATIONS DESCRIBED IN SPECIFICATION SECTION 230993 "SEQUENCE OF OPERATIONS FOR HVAC CONTROLS".'),
        a("m01-sensor-mounting", 1, [148, 878, 485, 901], "T.C. CONTRACTOR SHALL COORDINATE THE LOCATIONS AND MOUNTING HEIGHTS OF ALL SENSORS WITH THE C.O."),
        a("m01-sensor-location-verification", 1, [582, 833, 943, 867], "VERIFY THE LOCATION OF ALL THERMOSTATS, HUMIDITSTATS, AND SENSORS WITH THE CONTRACTING OFFICER PRIOR TO INSTALLATION. INSTALL THERMOSTATS & HUMIDISTATS PER ADA REQUIREMENTS."),
        a("m01-controls-legend-temperature", 1, [1475, 735, 1588, 748], "TEMPERATURE SENSOR"),
        a("m01-controls-legend-carbon-dioxide", 1, [1475, 758, 1598, 771], "CARBON DIOXIDE SENSOR"),
        a("m01-controls-legend-humidity", 1, [1475, 780, 1562, 793], "HUMIDITY SENSOR"),
        a("m01-controls-legend-static-pressure", 1, [1475, 825, 1604, 838], "STATIC PRESSURE SENSOR"),
        a("m01-controls-legend-two-way-valve", 1, [1953, 882, 2080, 895], "TWO-WAY CONTROL VALVE"),
        a("m01-controls-legend-three-way-valve", 1, [1953, 905, 2090, 918], "THREE-WAY CONTROL VALVE"),
        a("m02-cu-a1-ddc", 2, [904, 1315, 1212, 1328], "1. CU-A1 (EXPERIMENTAL COOLING ALTERNATE): DDC CONTROLS."),
        a("m02-cu-a2-pneumatic-enable", 2, [904, 1326, 1338, 1369], "2. CU-A2 (BASE BID): (E) PNEUMATIC CONTROL SYSTEM SHALL ENABLE COOLING SIGNAL INPUT TO DDC. PROVIDE P/E SWITCH TO SEND LOW VOLTAGE ENABLE SIGNAL TO DDC AT 9 PSI PNEUMATIC PRESSURE. DDC SHALL OUTPUT CONTROL SIGNAL(S) TO STAGE AND MODULATE COMPRESSORS AS REQUIRED."),
        a("m02-ahu-a2-integral-dampers", 2, [892, 1051, 1178, 1085], "2. PROVIDE LOW-VOLTAGE OUTDOOR AIR, RETURN, & RELIEF DAMPERS & ACTUATORS INTEGRAL TO AHU TO BE WIRED & CONTROLLED BY T.C. CONTRACTOR."),
        a("m02-ahu-a2-majority-vote", 2, [892, 1093, 1175, 1116], "4. PROVIDE CHANGEOVER CONTROL BY T.C. ACCORDING TO MAJORITY OF ZONE VOTING. SEE 5/M9.6."),
        a("m03-damper-end-switch", 3, [1488, 566, 2166, 579], "3. PROVIDE END SWITCH TO VERIFY POSITION. SEE SPECIFICATIONS FOR SEQUENCE OF OPERATION AND CONTROL POINTS LIST."),
        a("m03-damper-actuator-torque", 3, [1488, 589, 2222, 613], "5. PROVIDE ACTUATOR(S) FOR EACH DAMPER TO APPLY THE TORQUE NECESSARY FOR THE SPECIFIC INSTALLATION PER THE MANUFACTURER'S RECOMMENDATIONS. U.N.O., THE T.C. CONTRACTOR SHALL PROVIDE LOW OR LINE VOLTAGE POWER (CONTRACTOR'S OPTION) & LOW VOLTAGE CONTROL."),
        a("m03-existing-damper-ddc-integration", 3, [1488, 634, 2240, 682], "7. INTEGRATE CONTROL OF (E) DAMPERS SCHEDULED INTO THE NEW DDC SYSTEM. PROVIDE (N) LINKAGE, ELECTRONIC ACTUATORS, POWER, END-SWITCHES, & CONTROLS AS REQUIRED. PROVIDE (N) BLADE & JAMB SEALS TO MATCH TEMPERATURE RATING & PERFORMANCE OF (E) MATERIALS. REPAIR OR REPLACE (E) BLADES OR OTHER COMPONENTS AS REQUIRED. CONTRACTOR SHALL GUARANTEE FUNCTIONING PERFORMANCE OF (E) DAMPERS AS OUTLINED IN THESE DOCUMENTS FOR A PERIOD OF ONE YEAR FROM THE DATE OF SUBSTANTIAL COMPLETION."),
        a("m04-boiler-ddc-gateway", 4, [550, 523, 954, 546], "1. PROVIDE DDC GATEWAY, OA TEMPERATURE SENSOR, AND MOTORIZED ISOLATION VALVES FOR VARIABLE PRIMARY PUMPING CONFIGURATION."),
        a("m04-boiler-user-override", 4, [550, 585, 962, 608], "6. USER SHALL BE CAPABLE OF OVERRIDING HWS TEMPERATURE & RESET SCHEDULE. SEE POINTS LIST."),
        a("m04-pumps-ddc", 4, [122, 1023, 539, 1036], "4. PUMPS SHALL BE CONTRILLED BY DDC. SEE POINTS LIST & SEQUENCE OF OPERATION."),
        a("m04-steam-generator-ddc-interface", 4, [1430, 621, 1854, 634], "5. PROVIDE LOW VOLTAGE CONTROLS AND INTERFACE TO DDC SYSTEM. SEE POINTS LIST."),
        a("m04-steam-generator-power-loss-gas-shutoff", 4, [1430, 683, 2197, 696], "10. P.C. SHALL PROVIDE (1) LINE VOLTAGE SOLENOID VALVE IN GAS MAIN TO SHUT OFF FUEL UPON LOSS OF POWER WHEN EITHER EMERGENCY SWITCH IS THROWN."),
        a("m96-low-voltage-dampers", 27, [274, 606, 509, 629], "NOTE: U.N.O. ALL CONTROL DAMPERS SHOWN ARE LOW-VOLTAGE POWERED & CONTROLLED BY T.C."),
        a("m96-existing-ahu-heating-cooling-enable", 27, [145, 1382, 932, 1426], 'PROVIDE (N) HW HEATING COIL DISCHARGE AIR TEMPERATURE SENSOR, FREEZESTAT, HWS&R TEMPERATURE SENSORS & CONTROL VALVE. PROVIDE (N) P/E SWITCH TO ENABLE HEATING AS REQUIRED. HEATING "ON" POINT = 8 PSIG (OR) 70°F OA (ADJ.) . COORDINATE AS REQUIRED W/ (E) PNEUMATIC SET POINTS. PROVIDE (N) DX COOLING COIL DISCHARGE AIR TEMPERATURE SENSOR. PROVIDE (N) P/E SWITCH TO ENABLE COOLING AS REQUIRED. COOLING "ON" POINT = 9 PSIG (OR) 55°F OA (ADJ.) COORDINATE AS REQUIRED W/ (E) PNEUMATIC SET POINTS.'),
        a("m96-alternate-3-control-diagram-title", 27, [214, 693, 800, 720], "ALTERNATE 3 - VAV 'A'-WING AHU-A2 CONTROL DIAGRAM"),
        a("m97-hot-water-control-diagram-title", 28, [258, 672, 644, 699], "HOT WATER DDC CONTROL DIAGRAM"),
        a("m97-motorized-damper-symbol", 28, [2240, 137, 2369, 171], "MOTORIZED DAMPER WITH ACTUATOR ( TWO-WAY OR MODULATING. SEE DETAILS)"),
        a("m97-two-way-control-valve-symbol", 28, [2240, 402, 2380, 425], "MODULATING 2-WAY CONTROL VALVE WITH ACUATOR"),
        a("m97-ai-definition", 28, [1964, 955, 2105, 968], "AI = ANALOG INPUT"),
        a("m97-ao-definition", 28, [1964, 965, 2115, 978], "AO = ANALOG OUTPUT"),
        a("m97-bi-definition", 28, [1964, 975, 2100, 988], "BI = BINARY INPUT"),
        a("m97-bo-definition", 28, [1964, 986, 2111, 999], "BO = BINARY OUTPUT"),
        a("m97-bv-definition", 28, [1964, 1007, 2103, 1020], "BV = BINARY VALUE"),
        a("m97-ddc-connection-legend", 28, [2240, 1035, 2374, 1047], "CONNECTION TO DDC BY T.C."),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Source-bounded BAS/control architecture, damper/actuator requirements, control-diagram context, and explicit sequence clauses from M0.1-M0.4, M9.6 and M9.7.",
        "tables": [], "assertions": assertions,
        "network_architecture": {
            "published_integration": [
                "M0.1 requires a building management system and assigns the temperature-controls contractor responsibility to achieve the referenced sequence of operations.",
                "M0.2 and M0.4 identify DDC control, DDC gateway/interface, and P/E enable interfaces for specific equipment/control contexts.",
                "M9.7 defines AI, AO, BI, BO and BV symbols and labels a DDC connection by the temperature-controls contractor.",
            ],
            "boundary": "The supplied drawings do not publish a formal point-list row matrix, final BAS network topology, controller address list, controller I/O-card layout, terminal schedule, network media design, wire schedule, or installed physical-point count.",
        },
        "sequence_inventory": [
            {"id": "air-cooled-condensing-unit-enable-and-staging", "sheets": ["M0.2"], "assertion_ids": ["m02-cu-a1-ddc", "m02-cu-a2-pneumatic-enable"]},
            {"id": "alternate-3-vav-ahu-changeover-and-dampers", "sheets": ["M0.2", "M0.3", "M9.6"], "assertion_ids": ["m02-ahu-a2-integral-dampers", "m02-ahu-a2-majority-vote", "m03-damper-end-switch", "m03-damper-actuator-torque", "m03-existing-damper-ddc-integration", "m96-low-voltage-dampers", "m96-alternate-3-control-diagram-title"]},
            {"id": "boiler-hot-water-pump-and-steam-generator-controls", "sheets": ["M0.4", "M9.7"], "assertion_ids": ["m04-boiler-ddc-gateway", "m04-boiler-user-override", "m04-pumps-ddc", "m04-steam-generator-ddc-interface", "m04-steam-generator-power-loss-gas-shutoff", "m97-hot-water-control-diagram-title"]},
            {"id": "existing-ahu-pneumatic-electric-interface", "sheets": ["M9.6"], "assertion_ids": ["m96-existing-ahu-heating-cooling-enable"]},
        ],
        "sensors_and_control_symbol_context": {
            "legend_assertion_ids": ["m01-controls-legend-temperature", "m01-controls-legend-carbon-dioxide", "m01-controls-legend-humidity", "m01-controls-legend-static-pressure", "m01-controls-legend-two-way-valve", "m01-controls-legend-three-way-valve", "m97-motorized-damper-symbol", "m97-two-way-control-valve-symbol", "m97-ai-definition", "m97-ao-definition", "m97-bi-definition", "m97-bo-definition", "m97-bv-definition", "m97-ddc-connection-legend"],
            "boundary": "Legend entries and diagram labels indicate symbol/point types available in this drawing set; they are not transcribed as a physical count of installed sensors, valves, dampers, actuators, or BAS I/O.",
        },
        "control_boundaries": [
            "The drawing set repeatedly refers to a control-points list and specifications; it does not itself publish a conventional tabular points list. This module therefore retains bounded source clauses and diagram/legend context rather than inventing a row-level point matrix.",
            "The source spelling, punctuation and terminology (including 'HUMIDITSTATS', 'CONTRILLED', and 'ACUATOR') are preserved in exact bounded assertions rather than silently corrected.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
