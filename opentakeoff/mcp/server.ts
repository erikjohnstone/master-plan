// OpenTakeoff MCP server — the takeoff engine on stdio for your MCP client.
// Run: node --import tsx server.ts   (tsx is a runtime dependency: the engine
// is imported straight from web/src/lib as TypeScript).
import "./src/hush.ts"; // must stay the FIRST import — static imports hoist, and pdf.js logs via console.log (see src/hush.ts)
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Session } from "./src/session.ts";
import { registerTools } from "./src/tools.ts";
import { registerResources } from "./src/resources.ts";
import { applyStagedTools, STAGED_INSTRUCTIONS } from "./src/staging.ts";
import pkg from "./package.json" with { type: "json" };

export function buildServer(
  session: Session = new Session(),
  // #230 — staged exposure is opt-in: every published client expects the flat
  // forty and gets it by default. The option exists so tests don't mutate env.
  opts: { stagedTools?: boolean } = {},
): McpServer {
  const staged = opts.stagedTools ?? process.env.OPENTAKEOFF_MCP_STAGED_TOOLS === "1";
  const server = new McpServer({ name: "opentakeoff", version: pkg.version }, {
    // Served to every client at initialize — the discipline that makes agent
    // takeoffs land as reviewable work instead of a bare numbers report.
    instructions: [
      "BAS equipment assignment: new captures retain raw equipment schedule evidence. bas_equipment supplies addressable occurrence/member IDs and the equipment review head. Optional bas_equipment_review replaces the explicit scoped register and matrix assignments against that head, with immutable prior history and agent_proposal origin. The Takeoff Equipment editor uses the same shared validation and history. Optional bas_assignment_demand calculates and retains assigned listed observations through shared Python, with source cells, exact included/excluded members and per_equipment versus system_once applicability. Never multiply an entire system matrix per unit. Known subtotals omit unavailable cells and are not unique requirements, installed quantities or verified field wiring. Changed equipment heads make old calculations stale; history remains exportable. Release approval remains unfinished. No automatic identity join by similar names or proximity.",
      "BAS assembly scope: bas_assemblies exposes owned source declarations, reviewed components and current dependency heads. Optional bas_assembly_review records reasoned applicability, source-backed or explicit quantities, conditions, lifecycle and independent furnish/install/wire/program/test claims against expected equipment and assembly heads. Factory furnishing establishes no other activity; point rows are not extra devices. Conflicts retain all claims and any reasoned resolution. Component rule v2 is an explicit reasoned register upgrade, never an import-time reinterpretation: retain v1 history, inspect new functional roles, establish applicability separately and recalculate stale results. Optional bas_assembly_quantities uses shared Python for declared per-equipment or selected-group contributions. Unknown quantities stay null even under exclusion; these are not installed or unique-device totals. Changed equipment makes prior assemblies stale until explicitly rebased; exports/imports retain history. Agent proposals are not approval, commissioning or complete project coverage.",
      "OpenTakeoff: quantity takeoff on construction plan PDFs.",
      "BAS engineering: compile_corpus_takeoff returns additive bas_math from the shared Python engine. Keep soft variables separate from copper I/O; never invent abstract hardware policy, equipment replication, topology or typed SOO. Review discrepancies and coverage flags. A max envelope is not resolved drawing truth; project_complete remains false. Runtime unavailable is not zero demand. Optional bas_engineering_review records source-bound declared constraints and equipment-owned resources against current engineering/equipment/assembly/SOO heads through shared Python; it is an agent_proposal, not approval. bas_engineering_inspect explicitly replays saved results. Inspect dependency freshness independently of calculation verification; a successful replay does not repair stale assignments. Unknown ratings and excluded failures remain visible. Selected checks do not certify a complete design or installed quantity.",
      "BAS source review: the same compile returns bas_point_lists with source-version/page IDs, raw cells, listed observations and supported controller footnotes. An unobserved sparse cell is not a verified zero; alarm/trend flags are not wired I/O. Controller-provided does not establish a protocol, terminal or installed quantity. bas_workflow captures persist through export_takeoff/import_takeoff; retain the original PDFs separately. New captures retain full source text; optional bas_review records explicit sequence/matrix links or removals with source references, reason, operation ID and expected review head. These mutate review history as agent_proposal, not human approval or installed equipment. Stale edits/conflicting histories reject; ordinary recompiles retain history. A fingerprint is corruption detection, not approval or authenticated provenance. bas_workflow_error does not discard the original observations. Automatic equipment applicability, unique physical requirement reconciliation, reviewed revisions and project coverage remain unfinished.",
      "A takeoff's deliverable is the marked-up planset, not a numbers report. Standard finish for ANY takeoff:",
      "SCHEDULE-DRIVEN takeoff (HVAC equipment, BAS/DDC points, or control valves/dampers read from a printed schedule table — not a drawn floor condition): call compile_corpus_takeoff first for the scheduled quantity per tag, then reconcile_schedule_plan for the installed/drawn quantity and its MATCH / SCHEDULE_ONLY / PLAN_ONLY / AMBIGUOUS status per tag. A compile with no reconcile only answers what the schedule lists, not what is actually drawn. Steps 1-5 below are the canvas-shape (area/length/count condition) takeoff and do not apply to this path — no scale-set or shape-commit is needed to read a schedule table.",
      "1. load_plan, then set_scale on each sheet you measure (quantities are px-only until the scale is set).",
      "2. Commit shapes under finish-tag conditions (one_click / detect_rooms / measure_polygon / measure_line with `condition`; when the set carries a room-finish schedule, prefer detect_rooms assign_from_schedule so each room commits under its OWN row). A COUNT takeoff of value-annotated device marks (GRDs, fixtures, equipment — the tag-over-value pattern) starts with count_marks {commit: true}: the whole census in one deterministic call, then audit its withheld entries — reach for the agent-driven per-mark tools only where it refuses or withholds.",
      "3. DERIVE what follows from the rooms instead of re-measuring it: derive_base for base LF (perimeter − the door openings YOU state), derive_transitions for the line where two finishes meet. Both read committed floor shapes, so they come after step 2 and their output is audited in step 4 like anything else.",
      "4. LOOK at what landed with view_sheet overlay:true and fix misses with edit_shape before trusting totals — crop the work region tight (full-sheet renders downsample too far to audit a ring).",
      "5. Finish by writing the marked-up planset with export_marked_pdf and give the user its file path, alongside export_report for the numbers. Never end a takeoff with numbers alone.",
      "A floor split across sheets at a MATCH LINE: there is no stitch verb, deliberately — joining and aligning a match line is human judgment in the canvas (a sloppy join silently skews every seam-crossing quantity). Measure each member sheet as its own surface and tell the user a seam-crossing room needs their stitch in the app; never approximate one by combining sheets yourself.",
      "WITHHELD IS NOT A FAILURE — IT IS THE ANSWER. detect_rooms, symbol_sweep, sweep_schedule_row, count_marks and derive_transitions all measure things they then decline to commit, and say why: a near-match in the score band, a room the schedule cannot answer for, adjacency across a WALL rather than a butt joint. Read those arrays, view_sheet the coordinates they hand you, and resolve them or report them. A withheld item you ignore is a hole in the bid; one you never mention is worse.",
      ...(staged ? [STAGED_INSTRUCTIONS] : []),
    ].join("\n"),
  });
  const registered = registerTools(server, session);
  registerResources(server, session);
  if (staged) applyStagedTools(server, registered);
  return server;
}

// Connect stdio only when run as the entry point (tests import buildServer and
// wire an in-memory transport instead).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildServer().connect(new StdioServerTransport());
}
