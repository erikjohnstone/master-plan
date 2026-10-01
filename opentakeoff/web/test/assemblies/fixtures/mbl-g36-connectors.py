#!/usr/bin/env python3
"""ASSEMBLIES WP4.4 (b): the ASHRAE G36 connector fixture.

Reads the G36 controllers of the LBNL Modelica Buildings Library (MBL) at a
pinned commit and writes mbl-g36-connectors.json beside this script:
  * every connector of each controller (name, CDL type, array size, the
    `if` condition that makes it present, MBL's own description);
  * its I/O class: AI/AO/BI/BO for a field point, NET for a value exchanged
    with another controller or computed in software, with the rule or the
    explicit override that decided it and why;
  * named configurations (MBL parameter values) with the field points each
    one has, per I/O type, and the starter typical, attributes and options
    that stand for it.
The starter library's test (web/test/assemblies/starter.test.ts) expands each
configuration's typical and compares its MBL-derived point lines with these
connectors one by one.

Usage: python3 mbl-g36-connectors.py <path to a modelica-buildings clone>
The clone must be at COMMIT (the script refuses any other).
MBL is BSD-3-Clause-LBNL (Buildings/legal.html); only connector names, types,
conditions and descriptions are recorded here.
"""
import hashlib, json, os, re, subprocess, sys

COMMIT = "a3cfdde4e2fa1605f351875c2199b6aafaee7fe0"
ROOT = "Buildings/Controls/OBC/ASHRAE/G36/"
BLOCKS = {
    "TerminalUnits/CoolingOnly": ROOT + "TerminalUnits/CoolingOnly/Controller.mo",
    "TerminalUnits/Reheat": ROOT + "TerminalUnits/Reheat/Controller.mo",
    "TerminalUnits/SeriesFanCVF": ROOT + "TerminalUnits/SeriesFanCVF/Controller.mo",
    "TerminalUnits/SeriesFanVVF": ROOT + "TerminalUnits/SeriesFanVVF/Controller.mo",
    "TerminalUnits/ParallelFanCVF": ROOT + "TerminalUnits/ParallelFanCVF/Controller.mo",
    "TerminalUnits/ParallelFanVVF": ROOT + "TerminalUnits/ParallelFanVVF/Controller.mo",
    "TerminalUnits/DualDuctSnapActing": ROOT + "TerminalUnits/DualDuctSnapActing/Controller.mo",
    "TerminalUnits/DualDuctMixConInletSensor": ROOT + "TerminalUnits/DualDuctMixConInletSensor/Controller.mo",
    "TerminalUnits/DualDuctMixConDischargeSensor": ROOT + "TerminalUnits/DualDuctMixConDischargeSensor/Controller.mo",
    "TerminalUnits/DualDuctColdDuctMin": ROOT + "TerminalUnits/DualDuctColdDuctMin/Controller.mo",
    "ThermalZones/Setpoints": ROOT + "ThermalZones/Setpoints.mo",
    "AHUs/MultiZone/VAV": ROOT + "AHUs/MultiZone/VAV/Controller.mo",
    "AHUs/SingleZone/VAV": ROOT + "AHUs/SingleZone/VAV/Controller.mo",
    "FanCoilUnits": ROOT + "FanCoilUnits/Controller.mo",
    "Plants/Chillers": ROOT + "Plants/Chillers/Controller.mo",
}

# ── Parsing ────────────────────────────────────────────────────────────────
DECL = re.compile(r"Buildings\.Controls\.OBC\.CDL\.Interfaces\.(Real|Boolean|Integer)(Input|Output)\s+(\w+)(\s*\[[^\]]*\])?")

def parse(src):
    out = []
    for m in DECL.finditer(src):
        kind, name = m.group(1) + m.group(2), m.group(3)
        dims = m.group(4).strip()[1:-1].strip() if m.group(4) else None
        i = j = m.end(); depth = 0
        while j < len(src):  # the declaration runs to the first ';' at depth 0
            c = src[j]
            if c in "([{": depth += 1
            elif c in ")]}": depth -= 1
            elif c == ";" and depth <= 0: break
            elif c == '"': j = src.index('"', j + 1)
            j += 1
        decl = src[i:j]
        k = 0
        while k < len(decl) and decl[k].isspace(): k += 1
        if k < len(decl) and decl[k] == "(":  # the modifier list
            depth = 0
            while k < len(decl):
                if decl[k] == "(": depth += 1
                elif decl[k] == ")":
                    depth -= 1
                    if depth == 0: k += 1; break
                elif decl[k] == '"': k = decl.index('"', k + 1)
                k += 1
        rest, cond = decl[k:], None
        mc = re.match(r"\s*if\s+", rest)
        if mc:
            t = start = mc.end(); depth = 0
            while t < len(rest):
                c = rest[t]
                if c == "(": depth += 1
                elif c == ")": depth -= 1
                elif c == '"' and depth == 0: break
                elif depth == 0 and rest.startswith("annotation", t): break
                t += 1
            cond = " ".join(rest[start:t].split())
            rest = rest[t:]
        md = re.search(r'"([^"]*)"', rest)
        out.append({"name": name, "kind": kind, "dims": dims, "if": cond, "desc": " ".join((md.group(1) if md else "").split())})
    return out

# ── Classification ─────────────────────────────────────────────────────────
# The rule (research 02 §1e): a measured Real input is AI; a field Boolean
# status is BI; a Real output that commands a device is AO; a Boolean command
# is BO; Integer modes, requests, alarms and override indices, setpoints, and
# values exchanged with other controllers are NET. The overrides below record
# every connector where the rule's reading of MBL's description is wrong.
UPSTREAM = re.compile(r"from (the )?(central|air handler|AHU|plant|zone group|chiller plant|hot.?water plant|heating plant)|central air handler|\bAHU\b.*status|plant status|requests? from|request to|reset request|operation mode|operating mode|\boverride\b|overriding|index of|setpoint|set point|requested|demand limit|limit signal|enable signal from|through BACnet", re.I)
MEASURED = re.compile(r"\bmeasured\b|\bdetected\b|\bsensed\b|feedback|actual|status of (the )?(supply|return|relief|exhaust|terminal|chiller|pump|tower|cell|fan)", re.I)

def rule(c):
    k, d = c["kind"], c["desc"].lower()
    if k.startswith("Integer"):
        return "NET", "rule: an integer mode, request, alarm or override index"
    if k == "RealInput":
        if UPSTREAM.search(c["desc"]) and not re.search(r"\bmeasured\b", d):
            return "NET", "rule: a value from another controller, or a setpoint"
        if MEASURED.search(c["desc"]) or re.search(r"temperature|flow rate|pressure|humidity|enthalpy|concentration|level|speed|position", d):
            return "AI", "rule: a field measurement"
        return "NET", "rule: a software value"
    if k == "BooleanInput":
        if re.search(r"\bAHU supply fan status\b|plant status|from (the )?(AHU|plant)|override|true: close|request", c["desc"], re.I):
            return "NET", "rule: a status or command from another controller"
        return "BI", "rule: a field status"
    if k == "RealOutput":
        if re.search(r"setpoint|set point|flow rate(?! ratio)|breathing zone|outdoor airflow|loop signal|request|demand|signal to|reset", d) and not re.search(r"commanded|command", d):
            return "NET", "rule: a setpoint or value sent to another controller"
        return "AO", "rule: a device command"
    if k == "BooleanOutput":
        if re.search(r"alarm|request|status to|signal to", d):
            return "NET", "rule: an alarm or request"
        return "BO", "rule: a device command"
    return "NET", "rule: other"

WALL = "a setpoint adjustment from the zone sensor's wall module (G36 zone setpoints; UFC 3-410-01 Table 3-1 names the adjustment)"
OVERRIDES = {
    # Terminal units
    ("TerminalUnits/SeriesFanVVF", "VFan_flow_Set"): ("AO", "the variable-volume fan's flow command to its motor's speed control; MBL types it as a flow setpoint"),
    ("TerminalUnits/ParallelFanVVF", "VFan_flow_Set"): ("AO", "the variable-volume fan's flow command to its motor's speed control; MBL types it as a flow setpoint"),
    **{(b, n): ("NET", "the air handler's status, read from the air handler's controller") for b in (
        "TerminalUnits/DualDuctSnapActing", "TerminalUnits/DualDuctMixConInletSensor",
        "TerminalUnits/DualDuctMixConDischargeSensor", "TerminalUnits/DualDuctColdDuctMin") for n in ("u1CooAHU", "u1HeaAHU")},
    # Zone setpoints
    **{("ThermalZones/Setpoints", n): ("AI", WALL) for n in ("setAdj", "cooSetAdj", "heaSetAdj")},
    # Single-zone AHU
    ("AHUs/SingleZone/VAV", "u1Occ"): ("NET", "the occupancy period, from the schedule, not a sensor (the sensor is u1OccSen)"),
    **{("AHUs/SingleZone/VAV", n): ("AI", WALL) for n in ("setAdj", "cooSetAdj", "heaSetAdj")},
    ("AHUs/SingleZone/VAV", "u1RelFan"): ("NET", "a command from the relief-fan group's controller (present only when the relief fan is not part of this AHU)"),
    ("AHUs/SingleZone/VAV", "uRelFan"): ("NET", "a command from the relief-fan group's controller (present only when the relief fan is not part of this AHU)"),
    ("AHUs/SingleZone/VAV", "uOutDam"): ("NET", "the outdoor-air damper position the relief damper tracks, passed in by the sequence; no sensor is named"),
    ("AHUs/SingleZone/VAV", "u1SofSwiRes"): ("NET", "a software switch that resets freeze protection"),
    ("AHUs/SingleZone/VAV", "y1EneCHWPum"): ("NET", "a command to the chilled-water plant's controller"),
    # Multizone AHU
    **{("AHUs/MultiZone/VAV", n): ("NET", "a sum from the zone groups' controllers") for n in ("VSumAdjPopBreZon_flow", "VSumAdjAreBreZon_flow", "VSumZonPri_flow")},
    ("AHUs/MultiZone/VAV", "u1SofSwiRes"): ("NET", "a software switch that resets freeze protection"),
    ("AHUs/MultiZone/VAV", "y1EneCHWPum"): ("NET", "a command to the chilled-water plant's controller"),
    ("AHUs/MultiZone/VAV", "yDpBui"): ("NET", "the measured building pressure passed on to the return- or relief-fan sequence, not a device command"),
    # Fan coil unit
    ("FanCoilUnits", "u1Occ"): ("NET", "the occupancy period, from the schedule, not a sensor"),
    **{("FanCoilUnits", n): ("AI", WALL) for n in ("setAdj", "cooSetAdj", "heaSetAdj")},
    # Chiller plant
    ("Plants/Chillers", "uChiWatReq"): ("NET", "the chiller's own request, read over its network interface"),
    ("Plants/Chillers", "uConWatReq"): ("NET", "the chiller's own request, read over its network interface"),
    ("Plants/Chillers", "uHeaPreCon"): ("NET", "the chiller's head-pressure control signal, read over its network interface"),
    ("Plants/Chillers", "TChiWatEntChi"): ("AI", "a water temperature sensor (MBL declares a temperature quantity)"),
    ("Plants/Chillers", "uPlaSchEna"): ("NET", "the plant schedule's enable, from the schedule, not a device"),
    ("Plants/Chillers", "yWseRetVal"): ("AO", "the economizer's return-line valve position command; MBL names it a setpoint"),
    ("Plants/Chillers", "yWsePumSpe"): ("AO", "the economizer pump's speed command; MBL names it a setpoint"),
    ("Plants/Chillers", "yChiPumSpe"): ("AO", "the chilled-water pumps' speed command; MBL names it a setpoint"),
    ("Plants/Chillers", "yConWatPumSpe"): ("AO", "the condenser-water pumps' speed command; MBL names it a setpoint"),
    ("Plants/Chillers", "yTowFanSpe"): ("AO", "the tower fans' speed command; MBL names it a setpoint"),
    ("Plants/Chillers", "yMinValPosSet"): ("AO", "the minimum-flow bypass valve's position command; MBL names it a setpoint"),
    ("Plants/Chillers", "yChiWatIsoVal"): ("AO", "a modulating isolation valve's position command; MBL names it a setpoint"),
    ("Plants/Chillers", "yReaChiDemLim"): ("NET", "a demand-limit release written to the chillers over their interface"),
}

def classify(block, c):
    o = OVERRIDES.get((block, c["name"]))
    return (o[0], "override: " + o[1]) if o else rule(c)

# ── Conditions ─────────────────────────────────────────────────────────────
TOK = re.compile(r"\s*(==|<>|\(|\)|[A-Za-z_][A-Za-z0-9_.]*)")

def condition(src, params):
    """Evaluate an MBL `if` condition: identifiers (Boolean or enumeration
    parameters), enumeration literals, ==, and, or, not, parentheses. Every
    parameter it reads must be given."""
    toks, pos = [], 0
    while pos < len(src):
        m = TOK.match(src, pos)
        if not m: raise ValueError(f"cannot read {src!r} at {pos}")
        toks.append(m.group(1)); pos = m.end()
        while pos < len(src) and src[pos].isspace(): pos += 1
    i = 0
    def peek(): return toks[i] if i < len(toks) else None
    def take(t=None):
        nonlocal i
        tok = toks[i]
        if t and tok != t: raise ValueError(f"expected {t} in {src!r}")
        i += 1
        return tok
    def atom():
        if peek() == "(":
            take("("); v = orx(); take(")"); return v
        tok = take()
        if tok in ("true", "false"): return tok == "true"
        if "." in tok: return ("enum", tok.rsplit(".", 1)[1])
        if tok not in params: raise KeyError(f"{src!r} reads {tok}, which the configuration does not set")
        return params[tok]
    def cmp():
        a = atom()
        if peek() in ("==", "<>"):
            op = take(); b = atom()
            av = a[1] if isinstance(a, tuple) else a
            bv = b[1] if isinstance(b, tuple) else b
            return (av == bv) if op == "==" else (av != bv)
        return a
    def notx():
        if peek() == "not": take(); return not notx()
        return cmp()
    def andx():
        v = notx()
        while peek() == "and": take(); w = notx(); v = v and w
        return v
    def orx():
        v = andx()
        while peek() == "or": take(); w = andx(); v = v or w
        return v
    v = orx()
    if i != len(toks): raise ValueError(f"trailing tokens in {src!r}")
    if not isinstance(v, bool): raise ValueError(f"{src!r} is not Boolean")
    return v

# ── Configurations ─────────────────────────────────────────────────────────
# Each names MBL blocks and parameter values, and the starter typical,
# attributes and options that stand for the same equipment. A terminal unit
# pairs its controller with the zone's setpoint block; a connector both
# declare (the zone's occupancy sensor and window switch) is one field point.
TU_BASE = {"venStd": "ASHRAE62_1"}
ZONE_SETS = [
    ("none", {"have_CO2Sen": False, "have_occSen": False, "have_winSen": False, "have_locAdj": False, "sepAdj": False},
     {"co2_sensor": False, "occupancy_sensor": False, "window_switch": False, "setpoint_adjust": False}),
    ("adjust", {"have_CO2Sen": False, "have_occSen": False, "have_winSen": False, "have_locAdj": True, "sepAdj": False},
     {"co2_sensor": False, "occupancy_sensor": False, "window_switch": False, "setpoint_adjust": True}),
    ("all", {"have_CO2Sen": True, "have_occSen": True, "have_winSen": True, "have_locAdj": True, "sepAdj": False},
     {"co2_sensor": True, "occupancy_sensor": True, "window_switch": True, "setpoint_adjust": True}),
]

def terminal(block, typical, attrs, opts, extra=None):
    out = []
    for zname, zp, zo in ZONE_SETS:
        params = {**TU_BASE, **zp, **(extra or {})}
        out.append({
            "id": f"{block.split('/')[-1]}.{zname}" + ("" if not extra else "." + ".".join(f"{k}={v}" for k, v in extra.items())),
            "blocks": [block, "ThermalZones/Setpoints"],
            "params": params,
            "typical": typical, "attributes": attrs, "options": {**zo, **opts},
        })
    return out

CONFIGS = []
CONFIGS += terminal("TerminalUnits/CoolingOnly", "vav-cooling-only", {"heat_type": "none", "terminal_type": "single_duct"}, {})
CONFIGS += terminal("TerminalUnits/Reheat", "vav-reheat-hw", {"heat_type": "hw", "terminal_type": "single_duct"}, {"reheat_water_temps": False}, {"heaCoi": "WaterBased"})
CONFIGS += terminal("TerminalUnits/Reheat", "vav-reheat-electric", {"heat_type": "electric", "terminal_type": "single_duct"}, {"scr_heat": True}, {"heaCoi": "Electric"})
for fan, typ, tt in (("Series", "vav-series-fan", "fan_powered_series"), ("Parallel", "vav-parallel-fan", "fan_powered_parallel")):
    for vvf in (False, True):
        blk = f"TerminalUnits/{fan}Fan{'VVF' if vvf else 'CVF'}"
        CONFIGS += terminal(blk, typ, {"heat_type": "hw", "terminal_type": tt}, {"variable_fan": vvf, "scr_heat": False}, {"heaCoi": "WaterBased"})
        CONFIGS += terminal(blk, typ, {"heat_type": "electric", "terminal_type": tt}, {"variable_fan": vvf, "scr_heat": True}, {"heaCoi": "Electric"})
for blk, inlet, extra in (
    ("TerminalUnits/DualDuctSnapActing", True, {"have_duaSen": True}),
    ("TerminalUnits/DualDuctSnapActing", False, {"have_duaSen": False}),
    ("TerminalUnits/DualDuctMixConInletSensor", True, None),
    ("TerminalUnits/DualDuctMixConDischargeSensor", False, None),
    ("TerminalUnits/DualDuctColdDuctMin", True, None),
):
    CONFIGS += terminal(blk, "vav-dual-duct", {"terminal_type": "dual_duct"}, {"inlet_flow_sensors": inlet}, extra)

# Fan coil units: G36's FCU has a variable-speed fan; the zone options are
# the terminal units'. Occupancy (nOcc) is a people count, a NET value.
for cc, ct in (("WaterBased", "chw"), ("DXCoil", "dx"), ("None", "none")):
    for hc, ht in (("WaterBased", "hw"), ("Electric", "electric"), ("None", "none")):
        if cc == "None" and hc == "None": continue
        for zname, zp, zo in ZONE_SETS:
            CONFIGS.append({
                "id": f"FanCoilUnits.{zname}.cooCoi={cc}.heaCoi={hc}",
                "blocks": ["FanCoilUnits"],
                "params": {"cooCoi": cc, "heaCoi": hc, "have_winSen": zp["have_winSen"], "have_occSen": zp["have_occSen"], "have_locAdj": zp["have_locAdj"], "sepAdj": False},
                "typical": "fcu",
                "attributes": {"cooling_type": ct, "heating_type": ht, "pipes": 4 if (ct == "chw" and ht == "hw") else 2, "ecm": "yes"},
                "options": {"variable_speed_fan": True, "scr_heat": hc == "Electric", "occupancy_sensor": False, "window_switch": zo["window_switch"], "setpoint_adjust": zo["setpoint_adjust"]},
            })

# Multizone VAV air handler. Relief fans belong to the AHU (have_ahuRelFan).
MZ_OA = [("SingleDamper", {"dedicated_min_oa": False, "min_oa_dp": False}), ("DedicatedDampersAirflow", {"dedicated_min_oa": True, "min_oa_dp": False}), ("DedicatedDampersPressure", {"dedicated_min_oa": True, "min_oa_dp": True})]
BPC = [("BarometricRelief", {"relief_damper": False, "relief_fan": False, "return_fan": False, "return_fan_airflow": False}),
       ("ReliefDamper", {"relief_damper": True, "relief_fan": False, "return_fan": False, "return_fan_airflow": False}),
       ("ReliefFan", {"relief_damper": False, "relief_fan": True, "return_fan": False, "return_fan_airflow": False}),
       ("ReturnFanMeasuredAir", {"relief_damper": False, "relief_fan": False, "return_fan": True, "return_fan_airflow": True}),
       ("ReturnFanDp", {"relief_damper": False, "relief_fan": False, "return_fan": True, "return_fan_airflow": False})]
ECO = [("FixedDryBulb", {"enthalpy_economizer": False, "differential_economizer": False}),
       ("DifferentialDryBulb", {"enthalpy_economizer": False, "differential_economizer": True}),
       ("FixedEnthalpyWithFixedDryBulb", {"enthalpy_economizer": True, "differential_economizer": False}),
       ("DifferentialEnthalpyWithFixedDryBulb", {"enthalpy_economizer": True, "differential_economizer": True})]
COILS = [("WaterBased", "chw", "WaterBased", "hw"), ("DXCoil", "dx", "Electric", "electric"), ("WaterBased", "chw", "None", "none")]
FRE = [("Hardwired_to_BAS", True), ("Hardwired_to_equipment", False)]
# Every outdoor-air, building-pressure and economizer design (60), with the
# coils and the freezestat varied across them so each pair of choices meets.
for (oai, (oa, oao)), (bpi, (bp, bpo)), (ecoi, (eco, ecoo)) in [(a, b, c) for a in enumerate(MZ_OA) for b in enumerate(BPC) for c in enumerate(ECO)]:
    (cc, ct, hc, ht), (fs, fso) = COILS[(bpi + ecoi) % 3], FRE[(oai + bpi + ecoi) % 2]
    CONFIGS.append({
        "id": f"AHUs/MultiZone/VAV.{oa}.{bp}.{eco}.cooCoi={cc}.heaCoi={hc}.{fs}",
        "blocks": ["AHUs/MultiZone/VAV"],
        "params": {"venStd": "ASHRAE62_1", "eneStd": "ASHRAE90_1", "minOADes": oa, "buiPreCon": bp, "ecoHigLimCon": eco, "cooCoi": cc, "heaCoi": hc,
                   "freSta": fs, "have_frePro": True, "have_ahuRelFan": True, "have_CO2Sen": False},
        "typical": "ahu-multizone-vav",
        "attributes": {"vfd": "yes", "terminals_served": 12, "cooling_type": ct, "heating_type": ht},
        "options": {**oao, **bpo, **ecoo, "freezestat_to_bas": fso, "dx_staged": False},
    })
# Single-zone VAV air handler; its zone sensors are the terminal units' options.
SZ_BPC = [b for b in BPC if b[0] != "ReturnFanMeasuredAir"] + [BPC[3]]
SZ_ECO = [("FixedDryBulb", {"enthalpy_economizer": False, "differential_economizer": False}),
          ("DifferentialDryBulb", {"enthalpy_economizer": False, "differential_economizer": True}),
          ("FixedEnthalpyWithFixedDryBulb", {"enthalpy_economizer": True, "differential_economizer": False}),
          ("DifferentialEnthalpyWithFixedDryBulb", {"enthalpy_economizer": True, "differential_economizer": True})]
SZ_COILS = [("WaterBased", "chw", "WaterBased", "hw"), ("DXCoil", "dx", "None", "none"), ("WaterBased", "chw", "None", "none")]
# Every building-pressure, economizer and zone-sensor design (60), coils and
# freezestat varied across them.
for (bpi, (bp, bpo)), (ecoi, (eco, ecoo)), (zi, (zname, zp, zo)) in [(a, b, c) for a in enumerate(SZ_BPC) for b in enumerate(SZ_ECO) for c in enumerate(ZONE_SETS)]:
    (cc, ct, hc, ht), (fs, fso) = SZ_COILS[(bpi + zi) % 3], FRE[(ecoi + zi + bpi) % 2]
    CONFIGS.append({
        "id": f"AHUs/SingleZone/VAV.{zname}.{bp}.{eco}.cooCoi={cc}.heaCoi={hc}.{fs}",
        "blocks": ["AHUs/SingleZone/VAV"],
        "params": {"eneStd": "ASHRAE90_1", "buiPreCon": bp, "ecoHigLimCon": eco, "cooCoi": cc, "heaCoi": hc, "freSta": fs, "have_frePro": True,
                   "have_ahuRelFan": True, **zp},
        "typical": "ahu-single-zone",
        "attributes": {"vfd": "yes", "terminals_served": 0, "cooling_type": ct, "heating_type": ht},
        "options": {**{k: v for k, v in bpo.items() if k != "return_fan_airflow"}, **ecoo, "freezestat_to_bas": fso, "dx_staged": False, **zo},
    })

def main():
    clone = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("MBL_CLONE", "")
    head = subprocess.run(["git", "-C", clone, "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    if head != COMMIT: sys.exit(f"the clone is at {head}, not {COMMIT}")
    files = {}
    for block, path in BLOCKS.items():
        raw = open(os.path.join(clone, path), "rb").read()
        conns = parse(raw.decode("utf-8"))
        for c in conns:
            c["io"], c["reason"] = classify(block, c)
        files[block] = {"path": path, "sha256": hashlib.sha256(raw).hexdigest(), "connectors": conns}
    unused = [k for k in OVERRIDES if k[0] not in files or not any(c["name"] == k[1] for c in files[k[0]]["connectors"])]
    if unused: sys.exit(f"overrides name no connector: {unused}")
    configs = []
    for cfg in CONFIGS:
        seen, points = set(), []
        for block in cfg["blocks"]:
            for c in files[block]["connectors"]:
                if c["io"] == "NET": continue
                if c["if"] and not condition(c["if"], cfg["params"]): continue
                if c["dims"]: raise ValueError(f"{block}.{c['name']} is an array; this configuration has no size for it")
                if c["name"] in seen: continue
                seen.add(c["name"])
                points.append({"block": block, "name": c["name"], "io": c["io"]})
        by_io = {io: sorted(p["name"] for p in points if p["io"] == io) for io in ("AI", "AO", "BI", "BO")}
        configs.append({**cfg, "points": by_io, "counts": {io: len(v) for io, v in by_io.items()}})
    out = {
        "source": {"library": "Modelica Buildings Library", "repository": "https://github.com/lbl-srg/modelica-buildings", "commit": COMMIT,
                   "license": "BSD-3-Clause-LBNL", "license_file": "Buildings/legal.html"},
        "generator": "web/test/assemblies/fixtures/mbl-g36-connectors.py",
        "classification": "research 02 §1e: measured Real inputs AI, field Boolean status BI, device-commanding Real outputs AO, Boolean commands BO; integer modes, requests, alarms, override indices, setpoints and values exchanged with other controllers NET. Each connector records the rule or override that decided it.",
        "blocks": files,
        "configurations": configs,
    }
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "mbl-g36-connectors.json"), "w") as f:
        json.dump(out, f, indent=1, sort_keys=False)
        f.write("\n")
    print(f"{len(files)} blocks, {sum(len(v['connectors']) for v in files.values())} connectors, {len(configs)} configurations")

if __name__ == "__main__":
    main()
