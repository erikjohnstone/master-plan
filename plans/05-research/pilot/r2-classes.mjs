// R2 hand classification of the 128 dev misses by the evidence that decides them, one entry per
// (set, tag), read from each dev key's basis note (keys/<set>.typicals.csv). Q = a project-level question
// decides; S = the schedule already prints it (normalizer or extraction gap); R = the control drawings decide
// (text = sequence or note prose, diagram = a control detail or points schedule, absence = the bound control
// evidence decides by what it does NOT show); P = floor-plan evidence per zone.
export const CLASS = {
  "004_MO_T2504_03_Interior_and_Exterior_Renovation|*": "Q:no_bas",
  "baker-county-eoc|*": "Q:no_bas",
  "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for|WHSE-EUH-1": "Q+S:existing",
  "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for|WHSE-EUH-2": "Q+S:existing",
  "069_ID_ITD_District_2_Laboratory_Heating_Upgrades|B-1(E)": "Q+S:existing",
  "069_ID_ITD_District_2_Laboratory_Heating_Upgrades|B-2(E)": "Q+S:existing",
  "069_ID_ITD_District_2_Laboratory_Heating_Upgrades|AHU-1(E)": "Q+S:existing",
  "federal-mech|CWP-1": "Q:dod_ufc", "federal-mech|CWP-2": "Q:dod_ufc",
  "federal-mech|HWP-1": "Q:dod_ufc", "federal-mech|HWP-2": "Q:dod_ufc",
  "bldg5406-hvac-demo|CP-1": "Q:vfd_default", "itd-d1-lab|EF-4": "Q:vfd_default",
  "itd-d1-lab|EH-7": "S:schedule", "itd-d1-lab|EH-8": "S:schedule", "itd-d1-lab|EH-9": "S:schedule",
  "12_MT_MSU_ReidHall_Renovation|CUH-1": "S:schedule", "12_MT_MSU_ReidHall_Renovation|CUH-2": "S:schedule",
  "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for|WHSE-SF1": "S:schedule",
  "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for|WHSE-RF1": "S:schedule",
  "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for|WHSE-EF1": "S:schedule",
  "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for|WHSE-EF2": "S:schedule",
  "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for|WHSE-P1": "S:schedule",
  "bldg5406-hvac-demo|AHU-1": "S:schedule",
  ...Object.fromEntries(["EH-1", "EH-2", "EH-3", "EH-4", "EH-5", "EH-6", "HUM-1", "EF-1", "EF-2", "EF-3", "DFC-1"].map((t) => [`itd-d1-lab|${t}`, "R:text"])),
  "069_ID_ITD_District_2_Laboratory_Heating_Upgrades|BP-1": "R:text", "069_ID_ITD_District_2_Laboratory_Heating_Upgrades|BP-2": "R:text",
  "069_ID_ITD_District_2_Laboratory_Heating_Upgrades|CWP-1": "R:text", "069_ID_ITD_District_2_Laboratory_Heating_Upgrades|CWP-2": "R:text",
  ...Object.fromEntries(["UH-1", "UH-2", "UH-3", "UH-4", "UH-5", "UH-6", "EF-1A", "EF-1B", "EF-2A", "EF-2B", "EF-3A", "EF-3B"].map((t) => [`040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile|${t}`, "R:diagram"])),
  "federal-mech|B-1": "R:diagram", "federal-mech|B-2": "R:diagram",
  ...Object.fromEntries(["EF-1", "EF-2", "EF-3", "EF-4", "HWRP-1", "FCU-1", "EV-1", "EV-2", "EV-3", "EV-4", "EV-5", "EV-6"].map((t) => [`federal-mech|${t}`, "R:diagram"])),
  ...Object.fromEntries(["LEF-1", "F-1", "BP-1", "BP-2", "EF-5", "EF-6", "AHU-1"].map((t) => [`itd-d1-lab|${t}`, "R:diagram"])),
  "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for|WHSE-AHU-1": "R:diagram",
  "094_FL_Orange_County_Regional_History_Center_HVAC|AHU-06": "R:diagram",
  ...Object.fromEntries(["EF-1", "EF-2", "EF-3", "EF-4", "EF-5", "AC-1"].map((t) => [`bldg5406-hvac-demo|${t}`, "R:diagram"])),
  "federal-mech|UH-1": "R:absence", "federal-mech|UH-2": "R:absence",
  ...Object.fromEntries(["CP-1", "CP-2", "CP-3", "CP-4", "CP-5", "CP-6"].map((t) => [`federal-mech|${t}`, "R:absence"])),
  ...Object.fromEntries(["AHU-04", "AHU-05", "AHU-08", "AHU-07"].map((t) => [`094_FL_Orange_County_Regional_History_Center_HVAC|${t}`, "R:absence"])),
  "bldg5406-hvac-demo|CH-1": "R+Q", "federal-mech|AHU-1": "R+Q", "federal-mech|CH-1": "R+Q",
  ...Object.fromEntries(["1", "13", "16", "18", "2", "21", "22", "28", "31", "35", "37", "38", "44", "46", "55"].map((n) => [`federal-mech|VAV-${n}`, "P:plan"])),
};
export const classOf = (x) => CLASS[`${x.set}|${x.tag}`] ?? CLASS[`${x.set}|*`] ?? null;
