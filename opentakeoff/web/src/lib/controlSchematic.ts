/**
 * Vector-first control schematic and riser extraction.
 *
 * This is topological, not metric.  It deliberately keeps explicit authored
 * I/O tokens separate from instrument mnemonics: "AI" printed on a point
 * bubble is typed evidence; "TT" alone is only an instrument label until a
 * project legend or authored connection supplies more meaning.
 */
import { isEquipTag, joinGraphSpans } from "./equiptags.ts";
import type {
  Bbox, GraphSpan, ScheduleTable, SheetGraph,
} from "./sheetgraph.ts";
import type { NarrativeSequenceBlock } from "./sequenceNarrative.ts";

export interface ControlSheetContext {
  key: string;
  sheet_number?: string | null;
  spans: GraphSpan[];
  segs?: number[];
  width: number;
  height: number;
}

export interface ControlEvidence {
  sheet: string;
  text: string;
  bbox: Bbox;
  source: "text_span" | "vector_geometry";
}

export interface SchematicPoint {
  id: string;
  point_type: "AI" | "AO" | "DI" | "DO";
  at: [number, number];
  evidence: ControlEvidence;
  typing_basis: "explicit_printed_io_token";
}

export interface SchematicInstrument {
  id: string;
  label: string;
  at: [number, number];
  evidence: ControlEvidence;
  io_type: SchematicPoint["point_type"] | null;
  status: "unmapped_instrument_label" | "mapped_to_explicit_io";
}

export interface SchematicIoBinding {
  id: string;
  point_id: string;
  point_type: SchematicPoint["point_type"];
  instrument_id: string;
  instrument_label: string;
  interpretation_basis: "explicit_io_token_plus_collinear_vector_tether";
  point_evidence: ControlEvidence;
  instrument_evidence: ControlEvidence;
  tether_evidence: ControlEvidence;
}

export interface SchematicEquipmentTag {
  tag: string;
  at: [number, number];
  evidence: ControlEvidence;
  schedule_binding_status: "bound" | "ambiguous" | "unbound";
  schedule_refs: Array<{
    sheet: string; title: string | null; row_key: string; bbox: Bbox | null;
  }>;
  rejected_schedule_refs: Array<{
    sheet: string; title: string | null; row_key: string; bbox: Bbox | null;
    reason: "non_hvac_bas_schedule_family";
  }>;
}

export interface SchematicNode { id: number; at: [number, number]; degree: number; }
export interface SchematicEdge {
  id: number;
  a: number;
  b: number;
  length_px: number;
  direction: "a_to_b" | "b_to_a" | "unknown";
  evidence: { sheet: string; bbox: Bbox; source_segment: number };
}
export interface SchematicCrossing {
  at: [number, number];
  status: "connected_junction_mark" | "unresolved_crossing";
  evidence: { sheet: string; bbox: Bbox };
}
export interface SchematicArrow {
  tip: [number, number];
  shaft_edge: number;
  direction: "toward_tip";
  evidence: { sheet: string; bbox: Bbox };
}
export interface SchematicTopology {
  /** Describes whether the raw vector graph was computed, never whether the
   * authored mechanical/control system was semantically understood. */
  status: "computed" | "refused_too_dense" | "no_vector_linework";
  nodes: SchematicNode[];
  edges: SchematicEdge[];
  crossings: SchematicCrossing[];
  arrows: SchematicArrow[];
  connected_components: number;
  input_segments: number;
  retained_segments: number;
  note: string;
}

export interface ControlSchematic {
  id: string;
  sheet: string;
  title: string;
  title_evidence: ControlEvidence;
  region: Bbox;
  explicit_points: SchematicPoint[];
  point_totals: { AI: number; AO: number; DI: number; DO: number; total: number };
  instruments: SchematicInstrument[];
  io_bindings: SchematicIoBinding[];
  equipment: SchematicEquipmentTag[];
  component_labels: Array<{ label: string; evidence: ControlEvidence }>;
  media_labels: Array<{ label: string; evidence: ControlEvidence }>;
  sequence_refs: Array<{ id: string; sheet: string; title: string; status: string; title_bbox: Bbox }>;
  sequence_binding_status: "bound" | "ambiguous" | "unbound";
  topology: SchematicTopology;
  semantic_status: "evidence_inventory" | "partial_connectivity" | "verified_semantic_graph";
  review: {
    human_review_required: true;
    unresolved_crossings: number;
    unmapped_instruments: number;
  };
}

export interface RiserDatum {
  label: string;
  y: number;
  evidence: ControlEvidence;
  aliases: Array<{ label: string; evidence: ControlEvidence }>;
}
export interface RiserTraceCandidate {
  id: string;
  x: number;
  from_datum: string;
  to_datum: string;
  bbox: Bbox;
  direction: "unknown";
  status: "unresolved_vector_candidate";
  evidence: ControlEvidence;
}
export interface RiserServiceGroup {
  id: string;
  label: string;
  normalized_system: "chilled_water" | "heating_water" | "condenser_water" | "unknown";
  pressure_zone: "high" | "low" | null;
  service_pair: "supply_return" | "unspecified";
  interpretation_basis: "authored_riser_label_conservative_abbreviation";
  evidence: ControlEvidence[];
}
export interface RiserContinuation {
  id: string;
  text: string;
  target_sheet: string;
  boundary: "top" | "bottom" | "interior";
  evidence: ControlEvidence;
}
export interface DiagramSystemEvidence {
  normalized_system: "chilled_water" | "heating_water" | "condenser_water" | "building_automation_network";
  authored_label: string;
  interpretation_basis: "authored_diagram_title";
  evidence: ControlEvidence;
}
export interface NetworkTransportGroup {
  kind: "protocol" | "named_network" | "physical_link";
  name: "BACnet" | "BACnet/IP" | "BACnet MS/TP" | "CMnet" | "Modbus" | "UFT Network" | "Ethernet";
  authored_labels: string[];
  evidence: ControlEvidence[];
}
export interface NetworkComponentGroup {
  component_type: "ME Stack";
  evidence: ControlEvidence[];
}
export interface DiagramFloorPlacement {
  id: string;
  subject_kind: "diagram_tag" | "network_component";
  subject: string;
  floor_label: string;
  floor_aliases: string[];
  band_bbox: Bbox;
  interpretation_basis: "authored_subject_inside_authored_floor_band";
  subject_evidence: ControlEvidence;
  floor_evidence: ControlEvidence;
}
export interface DiagramTagGroup {
  tag: string;
  evidence: ControlEvidence[];
  schedule_refs: SchematicEquipmentTag["schedule_refs"];
}
export interface DiagramDeviceState {
  device_tag: string;
  state: "normally_open" | "normally_closed";
  authored_token: "NO" | "NC";
  interpretation_basis: "one_to_one_local_tag_state_geometry";
  tag_evidence: ControlEvidence;
  state_evidence: ControlEvidence;
}
export interface DiagramConflict {
  id: string;
  conflict_type: "normal_state_mismatch";
  normalized_system: DiagramSystemEvidence["normalized_system"];
  device_tag: string;
  status: "design_clarification_required";
  claims: Array<{
    sheet: string;
    diagram_title: string;
    state: DiagramDeviceState["state"];
    tag_evidence: ControlEvidence;
    state_evidence: ControlEvidence;
  }>;
}
export interface DiagramContinuationLink {
  id: string;
  from_diagram_id: string;
  from_sheet: string;
  from_sheet_number: string | null;
  to_diagram_id: string | null;
  to_sheet: string | null;
  to_sheet_number: string;
  status: "reciprocal" | "target_found_one_way" | "unresolved_target" | "ambiguous_target" | "boundary_conflict";
  from_boundary: RiserContinuation["boundary"];
  to_boundary: RiserContinuation["boundary"] | null;
  from_evidence: ControlEvidence;
  to_evidence: ControlEvidence | null;
}
export interface RiserDiagram {
  id: string;
  sheet: string;
  sheet_number: string | null;
  title: string;
  title_evidence: ControlEvidence;
  diagram_kind: "riser" | "flow" | "piping" | "network_architecture";
  region: Bbox;
  datums: RiserDatum[];
  systems: DiagramSystemEvidence[];
  service_groups: RiserServiceGroup[];
  continuations: RiserContinuation[];
  diagram_tags: DiagramTagGroup[];
  device_states: DiagramDeviceState[];
  network_transports: NetworkTransportGroup[];
  network_components: NetworkComponentGroup[];
  floor_placements: DiagramFloorPlacement[];
  trace_candidates: RiserTraceCandidate[];
  topology: SchematicTopology;
  status: "evidence_inventory" | "insufficient_floor_datums" | "no_vector_linework" | "refused_too_dense";
  semantic_status: "evidence_inventory" | "partial_connectivity" | "verified_semantic_graph";
  review: {
    human_review_required: true;
    unresolved_trace_candidates: number;
    unresolved_crossings: number;
    note: string;
  };
  human_review_required: true;
}

export interface ControlSchematicResult {
  schema_version: "opentakeoff.control_schematic.v1";
  schematics: ControlSchematic[];
  risers: RiserDiagram[];
  diagram_conflicts: DiagramConflict[];
  continuation_links: DiagramContinuationLink[];
  engineering_readiness: {
    status: "coverage_not_established" | "evidence_inventory_only" | "partial_engineering_model" | "principal_engineering_ready";
    diagram_count: number;
    verified_semantic_graphs: number;
    partial_semantic_graphs: number;
    evidence_inventory_graphs: number;
    blockers: Array<{ code: string; count: number; explanation: string }>;
    human_review_required: true;
    ready_for_unattended_release: false;
  };
  totals: {
    schematics: number;
    riser_diagrams: number;
    explicit_points: number;
    explicit_io_bindings: number;
    instruments_unmapped: number;
    unresolved_sequence_bindings: number;
    unresolved_crossings: number;
    authored_riser_service_groups: number;
    off_page_continuations: number;
    off_page_continuation_links: number;
    unresolved_off_page_continuations: number;
    unresolved_trace_candidates: number;
    diagram_state_conflicts: number;
    authored_network_transports: number;
    authored_network_components: number;
    authored_floor_placements: number;
    verified_semantic_graphs: number;
  };
  exclusions: string[];
}

const CONTROL_TITLE_RE = /\b(?:(?:CONTROL(?:\s+SYSTEM)?\s+)?SCHEMATIC|CONTROL\s+DIAGRAM)\b/i;
const CONTROL_TITLE_SUFFIX_RE = /\b(?:(?:CONTROL(?:\s+SYSTEM)?\s+)?SCHEMATIC(?:\s+AND\s+POINTS?\s+LIST)?|CONTROL\s+DIAGRAM)$/i;
const EXPLICIT_CONTROL_SCHEMATIC_RE = /\b(?:CONTROL(?:\s+SYSTEM)?\s+SCHEMATIC|CONTROL\s+DIAGRAM)\b/i;
const POINT_LIST_SUFFIX_RE = /\bSCHEMATIC\s+AND\s+POINTS?\s+LIST$/i;
const HYDRONIC_PIPING_SCHEMATIC_RE = /\b(?:CONDENSER|CHILLED|HEATING|HOT)\s+WATER\s+PIPING\s+SCHEMATIC\b/i;
const RISER_TITLE_RE = /\b(?:RISER\s+DIAGRAM|FLOW\s+DIAGRAM|PIPING\s+DIAGRAM|NETWORK(?:\s+ARCHITECTURE)?\s+DIAGRAM|(?:CONDENSER|CHILLED|HEATING|HOT)\s+WATER\s+DIAGRAM|WATER\s+RISER)\b/i;
const SEQUENCE_TITLE_RE = /\bSEQUENCES?\s+OF\s+OPERATIONS?\b/i;
const IO_TYPES = new Set(["AI", "AO", "DI", "DO"]);
// Labels only.  No semantic or I/O mapping is attached here.
const INSTRUMENT_RE = /^(?:TE|TT|TS|DPT|PDT|DP|PT|PS|FS|LS|SD|FM|FT|DA|D|P|CR|CSR|ACSR|EC|HUM|VFD)$/;
const MEDIA_RE = /^(?:HWS|HWR|CHWS|CHWR|CWS|CWR|CDWS|CDWR|OA|SA|RA|EA)$/;
const COMPONENT_RE = /^(?:DX\s+CC|CHW\s+COIL|HHW\s+COIL|HEATING\s+COIL|COOLING\s+COIL|PREHEAT\s+COIL|FILTER(?:\s+BANK)?|SUPPLY\s+FAN|RETURN\s+FAN|EXHAUST\s+FAN|HUMIDIFIER|ENERGY\s+RECOVERY\s+WHEEL)$/i;
const FLOOR_DATUM_RE = /^(?:ROOF(?:\s+LEVEL)?|PENTHOUSE|BASEMENT|GROUND(?:\s+FLOOR)?|(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|\d+(?:ST|ND|RD|TH))\s+FLOOR|LEVEL\s+(?:P\d+|B\d+|\d+|ROOF|PENTHOUSE|BASEMENT|GROUND|COOLING\s+TOWER)|[A-Z][A-Z ()/-]{1,36}\s+-\s+LEVEL\s+(?:P\d+|B\d+|\d+))$/i;
const CONTINUATION_RE = /\b(?:FOR\s+)?CONTINUATION\s+(?:SEE|TO)\s+(?:SHEET\s+)?([A-Z]{1,5}[-.]?\d+(?:[.-]\d+)*)\b/i;
const MAX_TOPOLOGY_SEGMENTS = 40_000;
const MAX_INTERSECTION_CANDIDATES = 2_000_000;
const SPATIAL_CELL_PX = 64;
const SNAP_PX = 2;

const clean = (value: unknown): string => String(value || "").replace(/\s+/g, " ").trim();
const canon = (value: unknown): string => clean(value).toUpperCase().replace(/[()]/g, "");
const bboxOf = (span: GraphSpan): Bbox => [span.x, span.y, span.x + (span.w || 0), span.y + (span.h || 0)];
const atOf = (span: GraphSpan): [number, number] => [span.x + (span.w || 0) / 2, span.y + (span.h || 0) / 2];
const union = (a: Bbox, b: Bbox): Bbox => [
  Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3]),
];
const inRegion = (span: GraphSpan, region: Bbox): boolean => {
  const [x, y] = atOf(span);
  return x >= region[0] && x <= region[2] && y >= region[1] && y <= region[3];
};
const evidenceFor = (sheet: string, span: GraphSpan): ControlEvidence => ({
  sheet, text: clean(span.str), bbox: bboxOf(span), source: "text_span",
});

function isControlSchematicTitle(span: GraphSpan, height: number): boolean {
  const text = clean(span.str);
  const explicitControlDiagram = /\bCONTROL\s+DIAGRAM$/i.test(text);
  return Math.abs(Number(span.rot || 0)) <= 0.08
    && CONTROL_TITLE_SUFFIX_RE.test(text)
    && !HYDRONIC_PIPING_SCHEMATIC_RE.test(text)
    && !/\b(?:SYMBOLS?|LEGEND|DESIGNATION|REFERENCE)\b/i.test(text)
    && span.h >= (explicitControlDiagram
      ? Math.max(14, height * 0.0045)
      : Math.max(16, height * 0.0075));
}

function expandedControlTitle(title: GraphSpan, spans: GraphSpan[]): GraphSpan {
  const base = clean(title.str);
  const basePrefix = base.replace(CONTROL_TITLE_RE, "").trim().split(/\s+/).filter(Boolean);
  if (basePrefix.length > 1) return title;
  const titleHeight = Math.max(1, title.h || 0);
  const candidates = spans.filter((candidate) => {
    if (candidate === title) return false;
    const text = clean(candidate.str);
    const gap = title.y - (candidate.y + (candidate.h || 0));
    const heightRatio = Math.max(titleHeight, candidate.h || 1) / Math.max(1, Math.min(titleHeight, candidate.h || 1));
    const overlap = Math.min(title.x + title.w, candidate.x + candidate.w) - Math.max(title.x, candidate.x);
    const aligned = overlap >= Math.min(title.w, candidate.w) * 0.25
      || Math.abs(atOf(candidate)[0] - atOf(title)[0]) <= Math.max(title.w, candidate.w) * 0.35;
    return text.length >= 3 && text.length <= 100
      && gap >= -2 && gap <= titleHeight * 2.4
      && heightRatio <= 1.8 && aligned
      && !/[.!?;:]$/.test(text)
      && !/\b(?:SHALL|WHEN|PROVIDE|VERIFY|REFER|SEE|NOTE|NOTES|STATUS|OPEN|CLOSE|ENABLE|DISABLE)\b/i.test(text);
  }).sort((a, b) => title.y - (a.y + a.h) - (title.y - (b.y + b.h)));
  const prefix = candidates[0];
  if (!prefix) return title;
  const text = clean(`${prefix.str} ${title.str}`);
  if (text.length > 180 || !CONTROL_TITLE_RE.test(text)) return title;
  const bbox = union(bboxOf(prefix), bboxOf(title));
  return { ...title, str: text, x: bbox[0], y: bbox[1], w: bbox[2] - bbox[0], h: bbox[3] - bbox[1] };
}

function isRiserDiagramTitle(span: GraphSpan, height: number): boolean {
  const text = clean(span.str);
  return Math.abs(Number(span.rot || 0)) <= 0.08
    && (RISER_TITLE_RE.test(text) || HYDRONIC_PIPING_SCHEMATIC_RE.test(text))
    && /(?:RISER\s+DIAGRAM|FLOW\s+DIAGRAM|PIPING\s+DIAGRAM|NETWORK(?:\s+ARCHITECTURE)?\s+DIAGRAM|(?:CONDENSER|CHILLED|HEATING|HOT)\s+WATER\s+(?:DIAGRAM|PIPING\s+SCHEMATIC)|WATER\s+RISER)$/i.test(text)
    && !/\b(?:DESIGNATION|WHERE|SHOWN|REFER|NOTE|NOTES)\b/i.test(text)
    && span.h >= Math.max(14, height * 0.0045);
}

function titleWords(text: string, remove: RegExp): Set<string> {
  const stop = new Set(["SYSTEM", "SYSTEMS", "THE", "AND", "WITH", "CONTROL", "SCHEMATIC", "SEQUENCE", "SEQUENCES", "OF", "OPERATION", "OPERATIONS", "POINT", "POINTS", "LIST"]);
  const normalized = canon(text).replace(remove, "").split(/[^A-Z0-9]+/)
    .filter((word) => word.length >= 3 && !stop.has(word))
    .map((word) => word.length > 4 && word.endsWith("S") && !/(?:SS|US|IS)$/.test(word) ? word.slice(0, -1) : word);
  return new Set(normalized);
}

function wordOverlap(a: Set<string>, text: string): number {
  const b = titleWords(text, /$^/);
  return [...a].filter((word) => b.has(word)).length;
}

const SEQUENCE_SCOPE_WORDS = new Set([
  "AIR", "OPS", "ATCT", "MTRACON", "MTRACTON", "BUILDING", "FACILITY", "AREA", "ZONE", "PROJECT",
  "SYSTEM", "UNIT", "FAN", "PUMP",
]);

const GENERIC_SEQUENCE_TITLE_RE = /^(?:\d+(?:\.\d+)*\s+)?SEQUENCE\s+OF\s+OPERATIONS?\s*[:.]?$/i;

function sequenceSystemOverlap(a: Set<string>, text: string): number {
  const b = titleWords(text, /$^/);
  return [...a].filter((word) => b.has(word) && !SEQUENCE_SCOPE_WORDS.has(word)).length;
}

type SequenceSystemFamily = "chilled_water" | "heating_water" | "condenser_water";

/**
 * Authored diagram and sequence captions often name the same hydronic plant by
 * different but mechanically equivalent nouns (for example BOILER SYSTEM vs
 * HEATING HOT WATER SYSTEM). Keep this vocabulary deliberately small and title
 * scoped: it can rank a source-owned SOO relationship, but it cannot type
 * equipment, infer points, or manufacture a relationship from body prose.
 */
function sequenceSystemFamilies(text: string): Set<SequenceSystemFamily> {
  const value = canon(text);
  const families = new Set<SequenceSystemFamily>();
  if (/\b(?:CHILLED\s+WATER|CHW|CHILLER)\b/.test(value)) families.add("chilled_water");
  if (/\b(?:HEATING(?:\s+HOT)?\s+WATER|HOT\s+WATER\s+HEATING|HHW|BOILER)\b/.test(value)) {
    families.add("heating_water");
  }
  if (/\b(?:CONDENSER\s+WATER|CONDENSER\s+LOOP)\b/.test(value)) families.add("condenser_water");
  return families;
}

function sequenceSystemFamilyOverlap(a: string, b: string): number {
  const left = sequenceSystemFamilies(a);
  const right = sequenceSystemFamilies(b);
  return [...left].filter((family) => right.has(family)).length;
}

/**
 * A bare `... SCHEMATIC` caption is common on real BAS sheets, but the word
 * SCHEMATIC alone is not a control-diagram classifier. Admit that abbreviated
 * caption only when the page also carries independent authored control
 * structure: a uniquely bound SOO, a matching full title-block caption, or
 * multiple I/O/instrument labels inside vector linework. This keeps plumbing,
 * electrical and generic detail schematics out without requiring one firm's
 * preferred title wording.
 */
function plainSchematicHasControlSupport(
  ctx: ControlSheetContext,
  title: GraphSpan,
  sequenceBinding: Pick<ControlSchematic, "sequence_refs" | "sequence_binding_status">,
  explicitPoints: SchematicPoint[],
  instruments: SchematicInstrument[],
  topology: SchematicTopology,
): boolean {
  const text = clean(title.str);
  if (EXPLICIT_CONTROL_SCHEMATIC_RE.test(text) || POINT_LIST_SUFFIX_RE.test(text)) return true;
  if (sequenceBinding.sequence_binding_status === "bound") return true;

  const words = titleWords(text, CONTROL_TITLE_RE);
  const matchingFullCaption = ctx.spans.some((span) => {
    if (span === title) return false;
    const candidate = clean(span.str);
    return EXPLICIT_CONTROL_SCHEMATIC_RE.test(candidate)
      && /\bPOINTS?\s+LIST$/i.test(candidate)
      && wordOverlap(words, candidate) >= Math.min(2, words.size)
      && sequenceSystemOverlap(words, candidate) >= 1;
  });
  if (matchingFullCaption) return true;

  return topology.status === "computed"
    && topology.retained_segments > 0
    && (explicitPoints.length >= 2 || instruments.length >= 2);
}

function sheetPageIdentity(value: string): { source: string; page: number } | null {
  const separator = value.lastIndexOf("#");
  if (separator < 1) return null;
  const page = Number(value.slice(separator + 1));
  if (!Number.isInteger(page) || page < 0) return null;
  return { source: value.slice(0, separator), page };
}

const TITLE_BLOCK_ANCHOR_RE = /^(?:DRAWING\s+(?:TITLE|NUMBER)|SHEET\s+(?:NAME|NUMBER)|PROJECT\s+(?:NUMBER|INFORMATION)|CONSULTANT|ISSUES|STAMP)$/i;

function drawingFieldRight(spans: GraphSpan[], width: number): number {
  const anchors = spans
    .filter((span) => span.x >= width * 0.78 && TITLE_BLOCK_ANCHOR_RE.test(clean(span.str)))
    .map((span) => span.x)
    .sort((a, b) => a - b);
  // A conventional title-block label in the far-right strip is authored
  // evidence for the drawing-field boundary. If it is absent, preserve the
  // established conservative page-edge cap rather than guessing a margin.
  return anchors[0] ?? width * 0.93;
}

function laneBounds(title: GraphSpan, titles: GraphSpan[], width: number, height: number, rightLimit: number): [number, number] {
  const [cx, cy] = atOf(title);
  // Control-detail sheets frequently mix a four-column upper row with a
  // double-width or full-width lower diagram. Captions in a remote row are not
  // lane dividers. Keep only vertically relevant neighbors; when there is no
  // neighbor, the authored drawing-field/title-block boundary owns the edge.
  // The bounded 28% band is wide enough for unequal-height rows (for example a
  // tall lighting-control detail beside two stacked HVAC details) without
  // letting the opposite half of the sheet partition the current row.
  const lanes = titles.map(atOf)
    .filter(([, y]) => Math.abs(y - cy) <= height * 0.28)
    .map(([x]) => x)
    .filter((x) => Math.abs(x - cx) > width * 0.08);
  const left = lanes.filter((x) => x < cx).sort((a, b) => b - a)[0];
  const right = lanes.filter((x) => x > cx).sort((a, b) => a - b)[0];
  return [
    Math.max(width * 0.015, left == null ? width * 0.015 : (left + cx) / 2),
    Math.min(rightLimit, right == null ? rightLimit : (right + cx) / 2),
  ];
}

function diagramRegion(title: GraphSpan, titles: GraphSpan[], spans: GraphSpan[], width: number, height: number): Bbox {
  const [x0, x1] = laneBounds(title, titles, width, height, drawingFieldRight(spans, width));
  const titleCenterY = atOf(title)[1];
  const words = titleWords(title.str, CONTROL_TITLE_RE);
  const sequence = spans
    .filter((span) => SEQUENCE_TITLE_RE.test(clean(span.str)))
    .filter((span) => {
      const [x, y] = atOf(span);
      return x >= x0 && x <= x1 && y < titleCenterY && wordOverlap(words, span.str) >= Math.min(2, words.size);
    })
    .sort((a, b) => atOf(b)[1] - atOf(a)[1])[0];
  const previousSameLane = titles
    .filter((other) => other !== title)
    .filter((other) => {
      const [x, y] = atOf(other);
      return x >= x0 && x <= x1 && y < titleCenterY;
    })
    .sort((a, b) => atOf(b)[1] - atOf(a)[1])[0];
  const start = sequence
    ? sequence.y + sequence.h
    : previousSameLane
      // Control-detail captions are conventionally printed at the bottom of
      // each stacked detail. The previous caption's bottom edge is therefore
      // the authored start of this detail; a midpoint clips the upper half of
      // the next schematic and loses its instruments/equipment.
      ? previousSameLane.y + (previousSameLane.h || 0)
      : Math.max(0, title.y - height * 0.42);
  return [x0, start, x1, title.y];
}

type RawSeg = { x1: number; y1: number; x2: number; y2: number; source: number; };
const q = (value: number): number => Math.round(value / SNAP_PX) * SNAP_PX;
const keyOf = (x: number, y: number): string => `${q(x)},${q(y)}`;
const segBbox = (s: RawSeg): Bbox => [Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2)];

function segmentIntersection(a: RawSeg, b: RawSeg): { x: number; y: number; ta: number; tb: number } | null {
  const adx = a.x2 - a.x1, ady = a.y2 - a.y1;
  const bdx = b.x2 - b.x1, bdy = b.y2 - b.y1;
  const den = adx * bdy - ady * bdx;
  if (Math.abs(den) < 1e-8) return null;
  const dx = b.x1 - a.x1, dy = b.y1 - a.y1;
  const ta = (dx * bdy - dy * bdx) / den;
  const tb = (dx * ady - dy * adx) / den;
  if (ta < -1e-6 || ta > 1 + 1e-6 || tb < -1e-6 || tb > 1 + 1e-6) return null;
  return { x: a.x1 + ta * adx, y: a.y1 + ta * ady, ta, tb };
}

function hasJunctionMark(segs: RawSeg[], candidates: number[], x: number, y: number): boolean {
  const radius = 8;
  const near = candidates.map((index) => segs[index]).filter((seg) => {
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    return len <= radius * 1.6
      && Math.hypot(seg.x1 - x, seg.y1 - y) <= radius
      && Math.hypot(seg.x2 - x, seg.y2 - y) <= radius;
  });
  if (near.length < 5) return false;
  const quadrants = new Set<number>();
  for (const seg of near) {
    const mx = (seg.x1 + seg.x2) / 2 - x, my = (seg.y1 + seg.y2) / 2 - y;
    quadrants.add((mx >= 0 ? 1 : 0) + (my >= 0 ? 2 : 0));
  }
  return quadrants.size >= 3;
}

function spatialCellsFor(bbox: Bbox): string[] {
  const x0 = Math.floor((bbox[0] - SNAP_PX) / SPATIAL_CELL_PX);
  const y0 = Math.floor((bbox[1] - SNAP_PX) / SPATIAL_CELL_PX);
  const x1 = Math.floor((bbox[2] + SNAP_PX) / SPATIAL_CELL_PX);
  const y1 = Math.floor((bbox[3] + SNAP_PX) / SPATIAL_CELL_PX);
  const out: string[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(`${x},${y}`);
  return out;
}

function topologyFor(sheet: string, segsFlat: number[] | undefined, region: Bbox): SchematicTopology {
  if (!segsFlat?.length) return {
    status: "no_vector_linework", nodes: [], edges: [], crossings: [], arrows: [],
    connected_components: 0, input_segments: 0, retained_segments: 0,
    note: "No vector linework is available for this diagram; topology is not inferred from text alone.",
  };
  const inputSegments = segsFlat.length >> 2;
  const raw: RawSeg[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < inputSegments; i++) {
    const seg: RawSeg = {
      x1: segsFlat[i * 4], y1: segsFlat[i * 4 + 1], x2: segsFlat[i * 4 + 2], y2: segsFlat[i * 4 + 3], source: i,
    };
    const mx = (seg.x1 + seg.x2) / 2, my = (seg.y1 + seg.y2) / 2;
    if (mx < region[0] || mx > region[2] || my < region[1] || my > region[3]) continue;
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    if (len < 2) continue;
    const ka = keyOf(seg.x1, seg.y1), kb = keyOf(seg.x2, seg.y2);
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (seen.has(key)) continue;
    seen.add(key);
    raw.push(seg);
  }
  if (raw.length > MAX_TOPOLOGY_SEGMENTS) return {
    status: "refused_too_dense", nodes: [], edges: [], crossings: [], arrows: [],
    connected_components: 0, input_segments: inputSegments, retained_segments: raw.length,
    note: `Diagram contains ${raw.length} vector segments, above the ${MAX_TOPOLOGY_SEGMENTS} bounded topology ceiling; points/text remain available, topology is refused rather than truncated.`,
  };

  const spatial = new Map<string, number[]>();
  raw.forEach((seg, index) => {
    for (const cell of spatialCellsFor(segBbox(seg))) {
      const bucket = spatial.get(cell);
      if (bucket) bucket.push(index);
      else spatial.set(cell, [index]);
    }
  });
  const pairKeys = new Set<number>();
  for (const bucket of spatial.values()) {
    for (let a = 0; a < bucket.length; a++) {
      for (let b = a + 1; b < bucket.length; b++) {
        const i = Math.min(bucket[a], bucket[b]), j = Math.max(bucket[a], bucket[b]);
        pairKeys.add(i * raw.length + j);
        if (pairKeys.size > MAX_INTERSECTION_CANDIDATES) return {
          status: "refused_too_dense", nodes: [], edges: [], crossings: [], arrows: [],
          connected_components: 0, input_segments: inputSegments, retained_segments: raw.length,
          note: `Diagram produces more than ${MAX_INTERSECTION_CANDIDATES} spatially plausible line intersections; points/text remain available, topology is refused rather than partially computed.`,
        };
      }
    }
  }
  const nearbyIndices = (x: number, y: number): number[] => {
    const out = new Set<number>();
    for (const cell of spatialCellsFor([x - 8, y - 8, x + 8, y + 8])) {
      for (const index of spatial.get(cell) || []) out.add(index);
    }
    return [...out];
  };

  const splits: Array<Array<{ t: number; x: number; y: number }>> = raw.map((seg) => [
    { t: 0, x: q(seg.x1), y: q(seg.y1) }, { t: 1, x: q(seg.x2), y: q(seg.y2) },
  ]);
  const crossings: SchematicCrossing[] = [];
  // Only segment pairs sharing a coarse spatial cell are considered. Dense
  // candidates are refused above instead of letting a schematic's decorative
  // linework turn this into unbounded O(n²) work.
  for (const pairKey of pairKeys) {
      const i = Math.floor(pairKey / raw.length);
      const j = pairKey % raw.length;
    const ai = segBbox(raw[i]);
      const bj = segBbox(raw[j]);
      if (ai[2] + SNAP_PX < bj[0] || bj[2] + SNAP_PX < ai[0] || ai[3] + SNAP_PX < bj[1] || bj[3] + SNAP_PX < ai[1]) continue;
      const hit = segmentIntersection(raw[i], raw[j]);
      if (!hit) continue;
      const aInterior = hit.ta > 1e-4 && hit.ta < 1 - 1e-4;
      const bInterior = hit.tb > 1e-4 && hit.tb < 1 - 1e-4;
      if (!aInterior && !bInterior) continue; // shared endpoints already node naturally
      const marked = aInterior && bInterior && hasJunctionMark(raw, nearbyIndices(hit.x, hit.y), hit.x, hit.y);
      if (aInterior && bInterior && !marked) {
        crossings.push({
          at: [q(hit.x), q(hit.y)], status: "unresolved_crossing",
          evidence: { sheet, bbox: [hit.x - 4, hit.y - 4, hit.x + 4, hit.y + 4] },
        });
        continue;
      }
      const sx = q(hit.x), sy = q(hit.y);
      if (aInterior) splits[i].push({ t: hit.ta, x: sx, y: sy });
      if (bInterior) splits[j].push({ t: hit.tb, x: sx, y: sy });
      if (marked) crossings.push({
        at: [sx, sy], status: "connected_junction_mark",
        evidence: { sheet, bbox: [hit.x - 8, hit.y - 8, hit.x + 8, hit.y + 8] },
      });
  }

  const nodeMap = new Map<string, number>();
  const nodes: Array<{ at: [number, number]; edges: number[] }> = [];
  const nodeFor = (x: number, y: number): number => {
    const key = keyOf(x, y);
    const existing = nodeMap.get(key);
    if (existing != null) return existing;
    const id = nodes.length;
    nodes.push({ at: [q(x), q(y)], edges: [] });
    nodeMap.set(key, id);
    return id;
  };
  const edges: SchematicEdge[] = [];
  const edgeKeys = new Set<string>();
  raw.forEach((seg, sourceIndex) => {
    const pts = splits[sourceIndex]
      .sort((a, b) => a.t - b.t)
      .filter((point, index, list) => index === 0 || Math.abs(point.t - list[index - 1].t) > 1e-5);
    for (let i = 1; i < pts.length; i++) {
      const a = nodeFor(pts[i - 1].x, pts[i - 1].y), b = nodeFor(pts[i].x, pts[i].y);
      if (a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      const bbox = union([pts[i - 1].x, pts[i - 1].y, pts[i - 1].x, pts[i - 1].y], [pts[i].x, pts[i].y, pts[i].x, pts[i].y]);
      const id = edges.length;
      edges.push({
        id, a, b, length_px: Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
        direction: "unknown", evidence: { sheet, bbox, source_segment: seg.source },
      });
      nodes[a].edges.push(id); nodes[b].edges.push(id);
    }
  });

  const arrows: SchematicArrow[] = [];
  for (let nodeId = 0; nodeId < nodes.length; nodeId++) {
    const node = nodes[nodeId];
    const incident = node.edges.map((edgeId) => edges[edgeId]);
    const short = incident.filter((edge) => edge.length_px >= 4 && edge.length_px <= 32);
    for (let i = 0; i < short.length; i++) {
      for (let j = i + 1; j < short.length; j++) {
        const vector = (edge: SchematicEdge): [number, number] => {
          const other = edge.a === nodeId ? nodes[edge.b].at : nodes[edge.a].at;
          const len = Math.max(edge.length_px, 1e-9);
          return [(other[0] - node.at[0]) / len, (other[1] - node.at[1]) / len];
        };
        const va = vector(short[i]), vb = vector(short[j]);
        const angle = Math.acos(Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1]))) * 180 / Math.PI;
        if (angle < 25 || angle > 100) continue;
        const bx = va[0] + vb[0], by = va[1] + vb[1];
        const bl = Math.hypot(bx, by);
        if (bl < 0.2) continue;
        const ux = bx / bl, uy = by / bl;
        const shaft = incident
          .filter((edge) => edge.id !== short[i].id && edge.id !== short[j].id && edge.length_px > Math.max(short[i].length_px, short[j].length_px) * 1.4)
          .map((edge) => ({ edge, v: vector(edge) }))
          .filter(({ v }) => v[0] * ux + v[1] * uy > 0.9)
          .sort((a, b) => b.edge.length_px - a.edge.length_px)[0];
        if (!shaft || arrows.some((arrow) => arrow.shaft_edge === shaft.edge.id)) continue;
        shaft.edge.direction = shaft.edge.a === nodeId ? "b_to_a" : "a_to_b";
        arrows.push({
          tip: node.at, shaft_edge: shaft.edge.id, direction: "toward_tip",
          evidence: {
            sheet,
            bbox: [node.at[0] - 34, node.at[1] - 34, node.at[0] + 34, node.at[1] + 34],
          },
        });
      }
    }
  }

  let components = 0;
  const visited = new Set<number>();
  for (let start = 0; start < nodes.length; start++) {
    if (visited.has(start)) continue;
    components++;
    const queue = [start]; visited.add(start);
    while (queue.length) {
      const id = queue.pop()!;
      for (const edgeId of nodes[id].edges) {
        const edge = edges[edgeId];
        const next = edge.a === id ? edge.b : edge.a;
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
  }
  return {
    status: "computed",
    nodes: nodes.map((node, id) => ({ id, at: node.at, degree: node.edges.length })),
    edges,
    crossings,
    arrows,
    connected_components: components,
    input_segments: inputSegments,
    retained_segments: raw.length,
    note: "Endpoint and T-junction connectivity is retained. Interior crossings stay disconnected unless compact drawn junction geometry supports a connection; unresolved crossings require review. Edge direction is set only where an attached vector arrowhead is detected.",
  };
}

function tetherEvidenceFor(
  sheet: string,
  segsFlat: number[] | undefined,
  region: Bbox,
  point: SchematicPoint,
  instrument: SchematicInstrument,
): ControlEvidence | null {
  if (!segsFlat?.length) return null;
  const top = point.evidence.bbox[3];
  const bottom = instrument.evidence.bbox[1];
  const gap = bottom - top;
  if (gap < 8 || gap > Math.max(80, (region[3] - region[1]) * 0.7)) return null;
  const x = (point.at[0] + instrument.at[0]) / 2;
  const xTolerance = Math.max(8, point.evidence.bbox[3] - point.evidence.bbox[1]);
  const retained: Bbox[] = [];
  let covered = 0;
  for (let i = 0; i < segsFlat.length; i += 4) {
    const x1 = segsFlat[i], y1 = segsFlat[i + 1], x2 = segsFlat[i + 2], y2 = segsFlat[i + 3];
    const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    if (dy < 3 || dy < dx * 3) continue;
    const mx = (x1 + x2) / 2;
    if (Math.abs(mx - x) > xTolerance) continue;
    const y0 = Math.max(top, Math.min(y1, y2));
    const y3 = Math.min(bottom, Math.max(y1, y2));
    if (y3 <= y0) continue;
    covered += y3 - y0;
    retained.push([Math.min(x1, x2), y0, Math.max(x1, x2), y3]);
  }
  // Dashed control wiring intentionally has gaps. Require enough authored
  // vertical ink to rule out coincidental text alignment, without demanding
  // a continuous line that this diagram grammar does not contain.
  if (!retained.length || covered < Math.min(24, gap * 0.12)) return null;
  const bbox = retained.reduce(union);
  return { sheet, text: "authored vector tether", bbox, source: "vector_geometry" };
}

function ioBindingsFor(
  sheet: string,
  points: SchematicPoint[],
  instruments: SchematicInstrument[],
  segsFlat: number[] | undefined,
  region: Bbox,
): SchematicIoBinding[] {
  const candidates: Array<{
    point: SchematicPoint;
    instrument: SchematicInstrument;
    tether: ControlEvidence;
    score: number;
  }> = [];
  for (const point of points) {
    for (const instrument of instruments) {
      const dy = instrument.at[1] - point.at[1];
      const dx = Math.abs(instrument.at[0] - point.at[0]);
      const xTolerance = Math.max(
        10,
        point.evidence.bbox[3] - point.evidence.bbox[1],
        instrument.evidence.bbox[3] - instrument.evidence.bbox[1],
      );
      if (dy <= 5 || dx > xTolerance) continue;
      const tether = tetherEvidenceFor(sheet, segsFlat, region, point, instrument);
      if (!tether) continue;
      candidates.push({ point, instrument, tether, score: dx * 20 + dy });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.point.id.localeCompare(b.point.id));
  const usedPoints = new Set<string>();
  const usedInstruments = new Set<string>();
  const bindings: SchematicIoBinding[] = [];
  for (const candidate of candidates) {
    if (usedPoints.has(candidate.point.id) || usedInstruments.has(candidate.instrument.id)) continue;
    const pointAlternatives = candidates.filter((other) => other.point.id === candidate.point.id && !usedInstruments.has(other.instrument.id));
    if (pointAlternatives.length > 1 && pointAlternatives[1].score <= candidate.score * 1.08 + 4) continue;
    usedPoints.add(candidate.point.id);
    usedInstruments.add(candidate.instrument.id);
    bindings.push({
      id: `io-binding:${sheet}:${bindings.length}`,
      point_id: candidate.point.id,
      point_type: candidate.point.point_type,
      instrument_id: candidate.instrument.id,
      instrument_label: candidate.instrument.label,
      interpretation_basis: "explicit_io_token_plus_collinear_vector_tether",
      point_evidence: candidate.point.evidence,
      instrument_evidence: candidate.instrument.evidence,
      tether_evidence: candidate.tether,
    });
  }
  return bindings;
}

function rowBbox(row: ScheduleTable["rows"][number]): Bbox | null {
  const boxes = Object.values(row.cells || {}).map((cell) => cell?.bbox).filter((bbox): bbox is Bbox => Array.isArray(bbox) && bbox.length === 4);
  return boxes.length ? boxes.reduce(union) : null;
}

const NON_HVAC_BAS_SCHEDULE_TITLE_RE = /\b(?:PLUMBING\s+FIXTURE|ROOM\s+FINISH|FINISH\s+SCHEDULE|DOOR|WINDOW|LUMINAIRE|LIGHTING\s+FIXTURE|PANELBOARD|ELECTRICAL\s+PANEL|FURNITURE|CASEWORK|ARCHITECTURAL\s+HARDWARE|REINFORCING|REBAR)\s+SCHEDULE\b/i;

function scheduleRefs(tag: string, tables: ScheduleTable[]): Pick<SchematicEquipmentTag, "schedule_refs" | "rejected_schedule_refs" | "schedule_binding_status"> {
  const want = canon(tag).replace(/[^A-Z0-9]/g, "");
  const refs: SchematicEquipmentTag["schedule_refs"] = [];
  const rejected: SchematicEquipmentTag["rejected_schedule_refs"] = [];
  const seen = new Set<string>();
  tables.forEach((table) => {
    (table.rows || []).forEach((row) => {
      const key = canon(row.key).replace(/[^A-Z0-9]/g, "");
      if (!key || key !== want) return;
      const ref = {
        sheet: table.sheet,
        title: clean(table.title?.text) || null,
        row_key: clean(row.key),
        bbox: rowBbox(row),
      };
      const identity = `${ref.sheet}\u0000${ref.title || ""}\u0000${ref.row_key}\u0000${JSON.stringify(ref.bbox)}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      // Exact short tags are frequently reused by unrelated disciplines
      // (real finding: a damper-like D-1 inside a mechanical control diagram
      // matched D-1 in a PLUMBING FIXTURE SCHEDULE). Keep that authored row
      // visible as a rejected candidate, but never call it a BAS/HVAC binding.
      if (NON_HVAC_BAS_SCHEDULE_TITLE_RE.test(ref.title || "")) {
        rejected.push({ ...ref, reason: "non_hvac_bas_schedule_family" });
      } else refs.push(ref);
    });
  });
  return {
    schedule_refs: refs,
    rejected_schedule_refs: rejected,
    schedule_binding_status: refs.length === 1 ? "bound" : refs.length > 1 ? "ambiguous" : "unbound",
  };
}

function equipmentInRegion(sheet: string, spans: GraphSpan[], region: Bbox, tables: ScheduleTable[]): SchematicEquipmentTag[] {
  const rawInside = spans.filter((span) => inRegion(span, region));
  const inside = joinGraphSpans(rawInside);
  const candidates: Array<{ tag: string; span: GraphSpan }> = [];
  for (const span of inside) {
    const tag = canon(span.str);
    if (isEquipTag(tag)) candidates.push({ tag, span });
  }
  // A tag is often embedded in a longer authored label ("HUMIDIFIER (
  // HUM-1") rather than emitted as its own PDF text run. Retain the original
  // run as evidence and parse only a syntactically complete hyphenated token;
  // isEquipTag remains the semantic gate.
  for (const span of rawInside) {
    for (const match of canon(span.str).matchAll(/\b[A-Z][A-Z0-9]{0,11}(?:-[A-Z0-9]{1,12})+\b/g)) {
      if (isEquipTag(match[0])) candidates.push({ tag: match[0], span });
    }
  }
  // Vertical stacks such as HWP over 1 and B over 2 are common inside risers.
  const short = spans.filter((span) => inRegion(span, region) && /^[A-Z]{1,8}$/.test(canon(span.str)));
  const suffixes = spans.filter((span) => inRegion(span, region) && /^\d+[A-Z0-9]*$/.test(canon(span.str)));
  for (const prefix of short) {
    const [px, py] = atOf(prefix);
    const suffix = suffixes
      .filter((candidate) => {
        const [x, y] = atOf(candidate);
        const h = Math.max(prefix.h, candidate.h, 8);
        return y > py && y - py <= h * 2.2 && Math.abs(x - px) <= h * 1.2;
      })
      .sort((a, b) => atOf(a)[1] - atOf(b)[1])[0];
    if (!suffix) continue;
    const tag = `${canon(prefix.str)}-${canon(suffix.str)}`;
    if (isEquipTag(tag)) candidates.push({
      tag,
      span: { ...prefix, str: tag, x: Math.min(prefix.x, suffix.x), y: prefix.y,
        w: Math.max(prefix.x + prefix.w, suffix.x + suffix.w) - Math.min(prefix.x, suffix.x),
        h: suffix.y + suffix.h - prefix.y },
    });
  }
  const byTagAndSpot = new Map<string, SchematicEquipmentTag>();
  for (const { tag, span } of candidates) {
    const at = atOf(span);
    const key = `${tag}:${Math.round(at[0] / 8)}:${Math.round(at[1] / 8)}`;
    byTagAndSpot.set(key, { tag, at, evidence: evidenceFor(sheet, span), ...scheduleRefs(tag, tables) });
  }
  return [...byTagAndSpot.values()];
}

function componentLabelsInRegion(sheet: string, spans: GraphSpan[], region: Bbox): ControlSchematic["component_labels"] {
  const relevant = spans.filter((span) => inRegion(span, region));
  const candidates: GraphSpan[] = relevant.filter((span) => COMPONENT_RE.test(clean(span.str)));
  // CAD frequently emits a compact two-line component label as two runs
  // ("DX" over "CC"). Join only vertically aligned pairs whose resulting
  // phrase is itself in the bounded component vocabulary.
  for (const first of relevant) {
    const [fx, fy] = atOf(first);
    for (const second of relevant) {
      if (second === first) continue;
      const [sx, sy] = atOf(second);
      const h = Math.max(first.h, second.h, 8);
      if (sy <= fy || sy - fy > h * 2.6 || Math.abs(sx - fx) > h * 2.2) continue;
      const label = `${canon(first.str)} ${canon(second.str)}`;
      if (!COMPONENT_RE.test(label)) continue;
      const box = union(bboxOf(first), bboxOf(second));
      candidates.push({ str: label, x: box[0], y: box[1], w: box[2] - box[0], h: box[3] - box[1] });
    }
  }
  const found = new Map<string, ControlSchematic["component_labels"][number]>();
  for (const candidate of candidates) {
    const label = canon(candidate.str);
    const [x, y] = atOf(candidate);
    found.set(`${label}:${Math.round(x / 8)}:${Math.round(y / 8)}`, {
      label,
      evidence: evidenceFor(sheet, candidate),
    });
  }
  return [...found.values()];
}

function sequenceRefsFor(
  title: GraphSpan,
  sheet: string,
  narratives: NarrativeSequenceBlock[],
  region: Bbox,
): Pick<ControlSchematic, "sequence_refs" | "sequence_binding_status"> {
  const words = titleWords(title.str, CONTROL_TITLE_RE);
  if (!words.size) return { sequence_refs: [], sequence_binding_status: "unbound" };
  const ranked = narratives
    .filter((sequence) => sequence.sheet === sheet)
    .map((sequence) => ({
      sequence,
      overlap: wordOverlap(words, sequence.title),
      system_overlap: sequenceSystemOverlap(words, sequence.title),
      semantic_system_overlap: sequenceSystemFamilyOverlap(title.str, sequence.title),
    }))
    .filter(({ overlap }) => overlap >= Math.min(2, words.size))
    .sort((a, b) => b.overlap - a.overlap || b.system_overlap - a.system_overlap
      || b.semantic_system_overlap - a.semantic_system_overlap || a.sequence.title.localeCompare(b.sequence.title));
  // A same-sheet detail can use a terse numbered caption such as
  // "3.2.3 SEQUENCE OF OPERATION – DOAH-T1" while its schematic title also
  // carries a facility prefix. If it is the only authored sequence on that
  // sheet, one specific shared system token is sufficient. Generic project
  // words (AIR/OPS/ATCT/FAN/PUMP) cannot establish this link.
  if (!ranked.length) {
    const sameSheet = narratives.filter((sequence) => sequence.sheet === sheet);
    ranked.push(...sameSheet
      .map((sequence) => ({
        sequence,
        overlap: wordOverlap(words, sequence.title),
        system_overlap: sequenceSystemOverlap(words, sequence.title),
        semantic_system_overlap: sequenceSystemFamilyOverlap(title.str, sequence.title),
      }))
      .filter(({ system_overlap, semantic_system_overlap }) => system_overlap >= 1 || semantic_system_overlap >= 1)
      .sort((a, b) => b.system_overlap - a.system_overlap
        || b.semantic_system_overlap - a.semantic_system_overlap || a.sequence.title.localeCompare(b.sequence.title)));
  }
  // A detail may use the generic heading "SEQUENCE OF OPERATION" above its
  // own specific "VAV BOX - CONTROL DIAGRAM" caption.  Title words cannot
  // establish that relationship, but the authored detail envelope can: bind
  // only source-owned same-sheet sequence headings whose title center lies
  // inside this diagram region. One is bound; competing candidates remain
  // ambiguous below. No nearest-neighbor or cross-region guess is made.
  if (!ranked.length) {
    ranked.push(...narratives
      .filter((sequence) => sequence.sheet === sheet)
      .filter((sequence) => GENERIC_SEQUENCE_TITLE_RE.test(clean(sequence.title)))
      .filter((sequence) => {
        const bbox = sequence.title_evidence.bbox;
        const x = (bbox[0] + bbox[2]) / 2;
        const y = (bbox[1] + bbox[3]) / 2;
        return x >= region[0] && x <= region[2] && y >= region[1] && y <= region[3];
      })
      .map((sequence) => ({ sequence, overlap: 0, system_overlap: 0, semantic_system_overlap: 0 })));
  }
  // Issued sets commonly place a schematic on one sheet and its authored SOO
  // on the immediately following sheet. Cross-sheet binding is deliberately
  // narrower than same-sheet binding: same source PDF, adjacent page, at least
  // two shared title words, at least one non-generic system anchor, and at
  // least half of the shorter title covered. Anything else remains unbound.
  if (!ranked.length) {
    const current = sheetPageIdentity(sheet);
    if (current) {
      ranked.push(...narratives
        .filter((sequence) => {
          const candidate = sheetPageIdentity(sequence.sheet);
          return candidate?.source === current.source && Math.abs(candidate.page - current.page) === 1;
        })
        .map((sequence) => {
          const sequenceWords = titleWords(sequence.title, /$^/);
          const overlap = wordOverlap(words, sequence.title);
          return {
            sequence,
            overlap,
            system_overlap: sequenceSystemOverlap(words, sequence.title),
            semantic_system_overlap: sequenceSystemFamilyOverlap(title.str, sequence.title),
            coverage: overlap / Math.max(1, Math.min(words.size, sequenceWords.size)),
          };
        })
        .filter(({ overlap, system_overlap, coverage }) => overlap >= 2 && system_overlap >= 1 && coverage >= 0.5)
        .sort((a, b) => b.overlap - a.overlap || b.system_overlap - a.system_overlap
          || b.semantic_system_overlap - a.semantic_system_overlap || b.coverage - a.coverage
          || a.sequence.title.localeCompare(b.sequence.title)));
    }
  }
  if (!ranked.length) return { sequence_refs: [], sequence_binding_status: "unbound" };
  const best = ranked.filter(({ overlap, system_overlap, semantic_system_overlap }) => overlap === ranked[0].overlap
    && system_overlap === ranked[0].system_overlap
    && semantic_system_overlap === ranked[0].semantic_system_overlap);
  return {
    sequence_refs: best.map(({ sequence }) => ({
      id: sequence.id,
      sheet: sequence.sheet,
      title: sequence.title,
      status: sequence.status,
      title_bbox: sequence.title_evidence.bbox,
    })),
    sequence_binding_status: best.length === 1 ? "bound" : "ambiguous",
  };
}

function floorDatumsInRegion(ctx: ControlSheetContext, region: Bbox): RiserDatum[] {
  const datums: RiserDatum[] = [];
  const candidates = ctx.spans
    .filter((span) => inRegion(span, region) && FLOOR_DATUM_RE.test(clean(span.str)))
    .sort((a, b) => atOf(a)[1] - atOf(b)[1] || a.x - b.x);
  for (const span of candidates) {
    const label = canon(span.str);
    const y = atOf(span)[1];
    // CAD exports frequently emit the same datum text twice and repeat it on
    // both sides of the riser. A floor may also have two authored names at the
    // same elevation (for example ROOF LEVEL / LEVEL 62). Those are aliases
    // for one datum, not two floors.
    const existing = datums.find((datum) => Math.abs(datum.y - y) <= Math.max(4, span.h * 0.35));
    if (existing) {
      if (canon(existing.label) !== label && !existing.aliases.some((alias) => canon(alias.label) === label)) {
        existing.aliases.push({ label: clean(span.str), evidence: evidenceFor(ctx.key, span) });
      }
      continue;
    }
    datums.push({ label: clean(span.str), y, evidence: evidenceFor(ctx.key, span), aliases: [] });
  }
  return datums;
}

function expandedRiserTitle(title: GraphSpan, spans: GraphSpan[]): GraphSpan {
  const original = clean(title.str);
  if (!/^(?:RISER\s+DIAGRAM|PIPING\s+DIAGRAM|WATER\s+RISER)$/i.test(original)) return title;
  const [tx] = atOf(title);
  const prefix = spans
    .filter((span) => span !== title)
    .filter((span) => {
      const text = clean(span.str);
      const [x] = atOf(span);
      const verticalGap = title.y - (span.y + span.h);
      return text.length >= 4 && text.length <= 100
        && verticalGap >= -2 && verticalGap <= Math.max(20, title.h * 1.5)
        && Math.abs(x - tx) <= Math.max(title.w, span.w) * 0.35
        && span.h >= title.h * 0.55
        && !/\b(?:NOTE|SEE|DETAIL|SECTION|SHEET)\b/i.test(text);
    })
    .sort((a, b) => Math.abs(title.y - (a.y + a.h)) - Math.abs(title.y - (b.y + b.h)))[0];
  if (!prefix) return title;
  const box = union(bboxOf(prefix), bboxOf(title));
  return {
    str: `${clean(prefix.str)} ${original}`,
    x: box[0], y: box[1], w: box[2] - box[0], h: box[3] - box[1],
  };
}

function riserSystem(label: string): Pick<RiserServiceGroup, "normalized_system" | "pressure_zone" | "service_pair"> {
  const text = canon(label);
  const normalized_system: RiserServiceGroup["normalized_system"] = /\bCH(?:ILLED)?\s*W/.test(text)
    ? "chilled_water"
    : /\b(?:HH?W|HEATING\s+WATER)/.test(text)
      ? "heating_water"
      : /\bCONDENSER(?:\s+WATER)?\b/.test(text)
        ? "condenser_water"
        : "unknown";
  return {
    normalized_system,
    pressure_zone: /\bHIGH\b/.test(text) ? "high" : /\bLOW\b/.test(text) ? "low" : null,
    service_pair: /(?:S\s*\/\s*R|\bCHW\s*\/\s*R|\bHW\s*\/\s*R|SUPPLY\s*(?:AND|\/)\s*RETURN)/.test(text)
      ? "supply_return"
      : "unspecified",
  };
}

function serviceGroupsInRegion(ctx: ControlSheetContext, region: Bbox, title: GraphSpan): RiserServiceGroup[] {
  const grouped = new Map<string, RiserServiceGroup>();
  for (const span of ctx.spans) {
    if (!inRegion(span, region)) continue;
    const label = clean(span.str);
    if (label.length > 100 || !/\bRISER\b/i.test(label)) continue;
    if (/\b(?:RISER\s+DIAGRAM|PIPE\s+RISER\s+ISOLATOR|RISER\s+ISOLATOR)\b/i.test(label)) continue;
    if (Math.abs(span.x - title.x) < 2 && Math.abs(span.y - title.y) < 2) continue;
    const system = riserSystem(label);
    // Generic note prose mentioning a riser is not a service identity. An
    // authored service label must name a supported medium or pressure zone.
    if (system.normalized_system === "unknown" && system.pressure_zone == null) continue;
    const key = `${canon(label)}:${system.normalized_system}:${system.pressure_zone || "none"}`;
    const evidence = evidenceFor(ctx.key, span);
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.evidence.some((item) => JSON.stringify(item.bbox) === JSON.stringify(evidence.bbox))) existing.evidence.push(evidence);
    }
    else grouped.set(key, {
      id: `riser-service:${ctx.key}:${grouped.size}`,
      label,
      ...system,
      interpretation_basis: "authored_riser_label_conservative_abbreviation",
      evidence: [evidence],
    });
  }
  return [...grouped.values()];
}

function continuationsInRegion(ctx: ControlSheetContext, region: Bbox): RiserContinuation[] {
  const found = new Map<string, RiserContinuation>();
  const regionHeight = Math.max(1, region[3] - region[1]);
  for (const span of ctx.spans) {
    if (!inRegion(span, region)) continue;
    const text = clean(span.str);
    const match = text.match(CONTINUATION_RE);
    if (!match) continue;
    const target = canon(match[1]);
    const y = atOf(span)[1];
    const ratio = (y - region[1]) / regionHeight;
    const boundary: RiserContinuation["boundary"] = ratio <= 0.2 ? "top" : ratio >= 0.8 ? "bottom" : "interior";
    const key = `${target}:${boundary}:${Math.round(y / 8)}`;
    if (found.has(key)) continue;
    found.set(key, {
      id: `riser-continuation:${ctx.key}:${found.size}`,
      text,
      target_sheet: target,
      boundary,
      evidence: evidenceFor(ctx.key, span),
    });
  }
  return [...found.values()];
}

function systemsFromTitle(sheet: string, title: GraphSpan): DiagramSystemEvidence[] {
  const label = clean(title.str);
  const upper = canon(label);
  const normalized_system: DiagramSystemEvidence["normalized_system"] | null = /\bCONDENSER\s+WATER\b/.test(upper)
    ? "condenser_water"
    : /\bCHILLED\s+WATER\b|\bCHW\b/.test(upper)
      ? "chilled_water"
      : /\b(?:HEATING|HOT)\s+WATER\b|\bHH?W\b/.test(upper)
        ? "heating_water"
        : /\bBUILDING\s+AUTOMATION\s+NETWORK\b/.test(upper)
          ? "building_automation_network"
          : null;
  return normalized_system ? [{
    normalized_system,
    authored_label: label,
    interpretation_basis: "authored_diagram_title",
    evidence: evidenceFor(sheet, title),
  }] : [];
}

function networkTransportsInRegion(ctx: ControlSheetContext, region: Bbox): NetworkTransportGroup[] {
  const found = new Map<NetworkTransportGroup["name"], NetworkTransportGroup>();
  for (const span of ctx.spans) {
    if (!inRegion(span, region)) continue;
    const label = clean(span.str);
    const upper = canon(label).replace(/\s*\/\s*/g, "/");
    const name: NetworkTransportGroup["name"] | null = /\bBACNET\/IP\b/.test(upper)
      ? "BACnet/IP"
      : /\bBACNET\/(?:MS\/TP|MSTP)\b/.test(upper)
        ? "BACnet MS/TP"
        : /^BACNET$/i.test(label)
          ? "BACnet"
          : /^CMNET$/i.test(label)
            ? "CMnet"
            : /^MODBUS$/i.test(label)
              ? "Modbus"
              : /^UFT\s+NETWORK$/i.test(label)
              ? "UFT Network"
              : /^ETHERNET$/i.test(label)
                ? "Ethernet"
                : null;
    if (!name) continue;
    const evidence = evidenceFor(ctx.key, span);
    const existing = found.get(name);
    if (existing) {
      if (!existing.authored_labels.includes(label)) existing.authored_labels.push(label);
      if (!existing.evidence.some((item) => JSON.stringify(item.bbox) === JSON.stringify(evidence.bbox))) existing.evidence.push(evidence);
    } else found.set(name, {
      kind: name === "UFT Network" ? "named_network" : name === "Ethernet" ? "physical_link" : "protocol",
      name,
      authored_labels: [label],
      evidence: [evidence],
    });
  }
  return [...found.values()];
}

function networkComponentsInRegion(ctx: ControlSheetContext, region: Bbox): NetworkComponentGroup[] {
  const evidence = ctx.spans
    .filter((span) => inRegion(span, region) && /^ME\s+STACK$/i.test(clean(span.str)))
    .map((span) => evidenceFor(ctx.key, span))
    .filter((item, index, list) => !list.some((other, otherIndex) => otherIndex < index
      && JSON.stringify(other.bbox) === JSON.stringify(item.bbox)));
  return evidence.length ? [{ component_type: "ME Stack", evidence }] : [];
}

function floorPlacementsFor(
  sheet: string,
  region: Bbox,
  datums: RiserDatum[],
  tags: DiagramTagGroup[],
  components: NetworkComponentGroup[],
): DiagramFloorPlacement[] {
  if (!datums.length) return [];
  const ordered = [...datums].sort((a, b) => a.y - b.y);
  const subjects: Array<{
    kind: DiagramFloorPlacement["subject_kind"];
    label: string;
    evidence: ControlEvidence;
  }> = [];
  for (const tag of tags) {
    for (const evidence of tag.evidence) subjects.push({ kind: "diagram_tag", label: tag.tag, evidence });
  }
  for (const component of components) {
    for (const evidence of component.evidence) subjects.push({ kind: "network_component", label: component.component_type, evidence });
  }

  const placements: DiagramFloorPlacement[] = [];
  for (const subject of subjects) {
    const y = (subject.evidence.bbox[1] + subject.evidence.bbox[3]) / 2;
    // Riser floor lines form the bottom edge of the story they name. The first
    // authored datum at or below a symbol therefore owns the band above it.
    // Anything below the final datum is left unassigned; it may be a title
    // block, keyed note, or exterior continuation rather than that floor.
    const datumIndex = ordered.findIndex((datum) => y <= datum.y + 2);
    if (datumIndex < 0) continue;
    const datum = ordered[datumIndex];
    const bandTop = datumIndex === 0 ? region[1] : ordered[datumIndex - 1].y;
    if (y < bandTop - 2) continue;
    placements.push({
      id: `floor-placement:${sheet}:${placements.length}`,
      subject_kind: subject.kind,
      subject: subject.label,
      floor_label: datum.label,
      floor_aliases: datum.aliases.map(({ label }) => label),
      band_bbox: [region[0], bandTop, region[2], datum.y],
      interpretation_basis: "authored_subject_inside_authored_floor_band",
      subject_evidence: subject.evidence,
      floor_evidence: datum.evidence,
    });
  }
  return placements;
}

function diagramTagsInRegion(sheet: string, spans: GraphSpan[], region: Bbox, tables: ScheduleTable[]): DiagramTagGroup[] {
  const candidates: Array<{ tag: string; span: GraphSpan }> = [];
  const excluded = /^(?:AI|AO|BI|BO|DI|DO|NEMA|TYP|O)-/;
  for (const span of spans) {
    if (!inRegion(span, region)) continue;
    for (const match of canon(span.str).matchAll(/\b[A-Z][A-Z0-9]{0,11}(?:-[A-Z0-9]{1,12})+\b/g)) {
      const tag = match[0];
      if (!excluded.test(tag) && isEquipTag(tag)) candidates.push({ tag, span });
    }
  }
  // Some CAD authors stack the family and numeric suffix vertically. Only a
  // bounded mechanical/BAS family vocabulary may be joined; arbitrary short
  // words and note numbers must not become equipment.
  const family = /^(?:AHU|RTU|MAU|DOAS|FCU|VAV|FPB|EF|SF|RF|P|HWP|CHWP|CWP|CWGP|HWGP|CH|CHLR|BLR|B|CT|VFD|TCP|TXP|CM|CCC|MPAC|HPAC|AC|WH|EX|ET|AS|FC|V)$/;
  const prefixes = spans.filter((span) => inRegion(span, region) && family.test(canon(span.str)));
  const suffixes = spans.filter((span) => inRegion(span, region) && /^\d+[A-Z0-9]*$/.test(canon(span.str)));
  for (const prefix of prefixes) {
    const [px, py] = atOf(prefix);
    const suffix = suffixes
      .filter((candidate) => {
        const [x, y] = atOf(candidate);
        const h = Math.max(prefix.h, candidate.h, 8);
        return y > py && y - py <= h * 2.2 && Math.abs(x - px) <= h * 1.2;
      })
      .sort((a, b) => atOf(a)[1] - atOf(b)[1])[0];
    if (!suffix) continue;
    const tag = `${canon(prefix.str)}-${canon(suffix.str)}`;
    const box = union(bboxOf(prefix), bboxOf(suffix));
    candidates.push({ tag, span: { str: tag, x: box[0], y: box[1], w: box[2] - box[0], h: box[3] - box[1] } });
  }
  const byTag = new Map<string, DiagramTagGroup>();
  for (const { tag, span } of candidates) {
    const evidence = evidenceFor(sheet, span);
    const existing = byTag.get(tag);
    if (existing) {
      if (!existing.evidence.some((item) => JSON.stringify(item.bbox) === JSON.stringify(evidence.bbox))) existing.evidence.push(evidence);
    } else byTag.set(tag, { tag, evidence: [evidence], schedule_refs: scheduleRefs(tag, tables).schedule_refs });
  }
  return [...byTag.values()];
}

function deviceStatesInRegion(ctx: ControlSheetContext, region: Bbox, tags: DiagramTagGroup[]): DiagramDeviceState[] {
  const states = ctx.spans.filter((span) => inRegion(span, region) && /^(?:N\.?\s*O\.?|N\.?\s*C\.?)$/i.test(clean(span.str)));
  const tagEvidence = tags
    .filter(({ tag }) => /^V-\d+[A-Z0-9]*$/.test(tag))
    .flatMap(({ tag, evidence }) => evidence.map((item) => ({ tag, evidence: item })));
  const candidates: Array<{ tagIndex: number; stateIndex: number; score: number }> = [];
  tagEvidence.forEach((tag, tagIndex) => {
    const [tx, ty] = [(tag.evidence.bbox[0] + tag.evidence.bbox[2]) / 2, (tag.evidence.bbox[1] + tag.evidence.bbox[3]) / 2];
    states.forEach((state, stateIndex) => {
      const [sx, sy] = atOf(state);
      const h = Math.max(8, state.h, tag.evidence.bbox[3] - tag.evidence.bbox[1]);
      const dx = Math.abs(sx - tx), dy = Math.abs(sy - ty);
      if (dx > h * 8 || dy > h * 3) return;
      candidates.push({ tagIndex, stateIndex, score: Math.hypot(dx / (h * 8), dy / (h * 3)) });
    });
  });
  candidates.sort((a, b) => a.score - b.score || a.tagIndex - b.tagIndex || a.stateIndex - b.stateIndex);
  const usedTags = new Set<number>(), usedStates = new Set<number>();
  const out: DiagramDeviceState[] = [];
  for (const candidate of candidates) {
    if (usedTags.has(candidate.tagIndex) || usedStates.has(candidate.stateIndex)) continue;
    usedTags.add(candidate.tagIndex); usedStates.add(candidate.stateIndex);
    const tag = tagEvidence[candidate.tagIndex];
    const stateSpan = states[candidate.stateIndex];
    const token = /^N\.?\s*O\.?$/i.test(clean(stateSpan.str)) ? "NO" : "NC";
    out.push({
      device_tag: tag.tag,
      state: token === "NO" ? "normally_open" : "normally_closed",
      authored_token: token,
      interpretation_basis: "one_to_one_local_tag_state_geometry",
      tag_evidence: tag.evidence,
      state_evidence: evidenceFor(ctx.key, stateSpan),
    });
  }
  return out;
}

function diagramStateConflicts(risers: RiserDiagram[]): DiagramConflict[] {
  const claims = new Map<string, DiagramConflict["claims"]>();
  for (const riser of risers) {
    const system = riser.systems[0]?.normalized_system;
    if (!system) continue;
    for (const state of riser.device_states) {
      const key = `${system}:${state.device_tag}`;
      const rows = claims.get(key) || [];
      rows.push({
        sheet: riser.sheet,
        diagram_title: riser.title,
        state: state.state,
        tag_evidence: state.tag_evidence,
        state_evidence: state.state_evidence,
      });
      claims.set(key, rows);
    }
  }
  const conflicts: DiagramConflict[] = [];
  for (const [key, rows] of claims) {
    if (new Set(rows.map(({ state }) => state)).size < 2) continue;
    const [normalized_system, device_tag] = key.split(":");
    conflicts.push({
      id: `diagram-conflict:${normalized_system}:${device_tag}`,
      conflict_type: "normal_state_mismatch",
      normalized_system: normalized_system as DiagramSystemEvidence["normalized_system"],
      device_tag,
      status: "design_clarification_required",
      claims: rows,
    });
  }
  return conflicts;
}

function normalizedSheetNumber(value: string | null | undefined): string {
  return canon(value || "").replace(/[^A-Z0-9]/g, "");
}

function boundariesAreReciprocal(
  from: RiserContinuation["boundary"],
  to: RiserContinuation["boundary"],
): boolean {
  return (from === "top" && to === "bottom") || (from === "bottom" && to === "top");
}

/**
 * Resolves authored off-page references against authored sheet numbers.
 * A reciprocal result proves only that two diagrams cite each other at
 * complementary drawing boundaries. It does not promote any raw vector line
 * to a connected pipe, duct, wire, or installed device.
 */
function continuationLinksFor(risers: RiserDiagram[]): DiagramContinuationLink[] {
  const bySheetNumber = new Map<string, RiserDiagram[]>();
  for (const riser of risers) {
    const number = normalizedSheetNumber(riser.sheet_number);
    if (!number) continue;
    const rows = bySheetNumber.get(number) || [];
    rows.push(riser);
    bySheetNumber.set(number, rows);
  }

  const links: DiagramContinuationLink[] = [];
  const consumed = new Set<string>();
  const add = (
    source: RiserDiagram,
    continuation: RiserContinuation,
    status: DiagramContinuationLink["status"],
    target: RiserDiagram | null,
    reciprocal: RiserContinuation | null,
  ) => {
    links.push({
      id: `diagram-continuation-link:${source.id}:${continuation.id}`,
      from_diagram_id: source.id,
      from_sheet: source.sheet,
      from_sheet_number: source.sheet_number,
      to_diagram_id: target?.id || null,
      to_sheet: target?.sheet || null,
      to_sheet_number: continuation.target_sheet,
      status,
      from_boundary: continuation.boundary,
      to_boundary: reciprocal?.boundary || null,
      from_evidence: continuation.evidence,
      to_evidence: reciprocal?.evidence || null,
    });
  };

  for (const source of risers) {
    for (const continuation of source.continuations) {
      if (consumed.has(continuation.id)) continue;
      const targets = bySheetNumber.get(normalizedSheetNumber(continuation.target_sheet)) || [];
      if (!targets.length) {
        add(source, continuation, "unresolved_target", null, null);
        continue;
      }
      if (targets.length !== 1) {
        add(source, continuation, "ambiguous_target", null, null);
        continue;
      }
      const target = targets[0];
      const sourceNumber = normalizedSheetNumber(source.sheet_number);
      const reciprocalCandidates = sourceNumber
        ? target.continuations.filter((candidate) => normalizedSheetNumber(candidate.target_sheet) === sourceNumber)
        : [];
      if (!reciprocalCandidates.length) {
        add(source, continuation, "target_found_one_way", target, null);
        continue;
      }
      const complementary = reciprocalCandidates.filter((candidate) => boundariesAreReciprocal(continuation.boundary, candidate.boundary));
      if (complementary.length === 1) {
        consumed.add(complementary[0].id);
        add(source, continuation, "reciprocal", target, complementary[0]);
        continue;
      }
      const candidate = complementary[0] || reciprocalCandidates[0];
      consumed.add(candidate.id);
      add(source, continuation, complementary.length > 1 ? "ambiguous_target" : "boundary_conflict", target, candidate);
    }
  }
  return links;
}

function traceCandidatesInRegion(ctx: ControlSheetContext, region: Bbox, datums: RiserDatum[]): RiserTraceCandidate[] {
  if (!ctx.segs?.length || datums.length < 2) return [];
  const candidates: RiserTraceCandidate[] = [];
  for (let i = 0; i < ctx.segs.length; i += 4) {
    const x1 = ctx.segs[i], y1 = ctx.segs[i + 1], x2 = ctx.segs[i + 2], y2 = ctx.segs[i + 3];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    if (mx < region[0] || mx > region[2] || my < region[1] || my > region[3]) continue;
    if (Math.abs(x2 - x1) > 3 || Math.abs(y2 - y1) < ctx.height * 0.12) continue;
    const crossed = datums.filter((datum) => datum.y >= Math.min(y1, y2) - 3 && datum.y <= Math.max(y1, y2) + 3);
    if (crossed.length < 2) continue;
    const bbox: Bbox = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
    const from = crossed[0].label, to = crossed.at(-1)!.label;
    // Exact duplicate strokes are common in CAD exports. Near-parallel pipe
    // outlines are intentionally retained as unresolved candidates because
    // deciding whether they are one pipe, two pipes, or a border requires
    // service-label/port connectivity that this evidence-only stage lacks.
    if (candidates.some((item) => item.from_datum === from && item.to_datum === to
      && Math.abs(item.x - mx) <= 1 && Math.abs(item.bbox[1] - bbox[1]) <= 1 && Math.abs(item.bbox[3] - bbox[3]) <= 1)) continue;
    candidates.push({
      id: `riser-trace-candidate:${ctx.key}:${candidates.length}`,
      x: mx,
      from_datum: from,
      to_datum: to,
      bbox,
      direction: "unknown",
      status: "unresolved_vector_candidate",
      evidence: { sheet: ctx.key, text: "", bbox, source: "vector_geometry" },
    });
  }
  return candidates;
}

function extractRisers(ctx: ControlSheetContext, tables: ScheduleTable[]): RiserDiagram[] {
  const candidates = ctx.spans
    .filter((span) => isRiserDiagramTitle(span, ctx.height) && clean(span.str).length <= 180)
    .map((span) => expandedRiserTitle(span, ctx.spans))
    .filter((span) => atOf(span)[0] <= ctx.width * 0.9 || /^MECHANICAL\s+WATER\s+RISER$/i.test(clean(span.str)));
  // Drawing title blocks often repeat the sheet title vertically. Prefer the
  // horizontal in-drawing title when it exists; retain a vertical title when
  // it is the only authored title on a genuinely rotated diagram.
  const horizontal = candidates.filter((span) => span.w >= span.h * 1.5);
  const horizontalOrAll = horizontal.length ? horizontal : candidates;
  const specificTitles = horizontalOrAll.filter((span) => !/^MECHANICAL\s+WATER\s+RISER$/i.test(clean(span.str)));
  const possibleTitles = specificTitles.length ? specificTitles : horizontalOrAll;
  const titles = possibleTitles.filter((title, index, list) => !list.some((other, otherIndex) => otherIndex < index
    && canon(other.str) === canon(title.str)
    && Math.abs(atOf(other)[0] - atOf(title)[0]) <= 8
    && Math.abs(atOf(other)[1] - atOf(title)[1]) <= 8));
  return titles.map((title) => {
    const titleText = clean(title.str);
    const diagramKind: RiserDiagram["diagram_kind"] = /NETWORK(?:\s+ARCHITECTURE)?\s+(?:RISER\s+)?DIAGRAM$/i.test(titleText)
      ? "network_architecture"
      : /FLOW\s+DIAGRAM$/i.test(titleText)
        ? "flow"
      : /(?:PIPING\s+DIAGRAM|(?:CONDENSER|CHILLED|HEATING|HOT)\s+WATER\s+(?:DIAGRAM|PIPING\s+SCHEMATIC))$/i.test(titleText)
          ? "piping"
          : "riser";
    // Riser/network titles conventionally sit below the diagram. Bound the
    // graph to drawing content and keep sheet-border/title-block vectors out.
    const titleIsRightBlockFallback = atOf(title)[0] > ctx.width * 0.9;
    const regionBottom = titleIsRightBlockFallback
      ? ctx.height * 0.97
      : atOf(title)[1] > ctx.height * 0.25
        ? Math.min(ctx.height * 0.97, title.y + Math.max(title.h * 2, ctx.height * 0.02))
        : ctx.height * 0.95;
    const region: Bbox = [
      ctx.width * 0.015,
      ctx.height * 0.015,
      ctx.width * 0.93,
      regionBottom,
    ];
    const datums = floorDatumsInRegion(ctx, region);
    const traceCandidates = traceCandidatesInRegion(ctx, region, datums);
    const serviceGroups = serviceGroupsInRegion(ctx, region, title);
    const continuations = continuationsInRegion(ctx, region);
    const diagramTags = diagramTagsInRegion(ctx.key, ctx.spans, region, tables);
    const networkTransports = networkTransportsInRegion(ctx, region);
    const networkComponents = networkComponentsInRegion(ctx, region);
    const floorPlacements = floorPlacementsFor(ctx.key, region, datums, diagramTags, networkComponents);
    const topology = topologyFor(ctx.key, ctx.segs, region);
    const status: RiserDiagram["status"] = topology.status === "no_vector_linework"
      ? "no_vector_linework"
      : topology.status === "refused_too_dense"
        ? "refused_too_dense"
        : diagramKind === "riser" && datums.length < 2
          ? "insufficient_floor_datums"
          : "evidence_inventory";
    const unresolvedCrossings = topology.crossings.filter((crossing) => crossing.status === "unresolved_crossing").length;
    return {
      id: `riser:${ctx.key}:${Math.round(title.x)}:${Math.round(title.y)}`,
      sheet: ctx.key,
      sheet_number: clean(ctx.sheet_number) || null,
      title: titleText,
      title_evidence: evidenceFor(ctx.key, title),
      diagram_kind: diagramKind,
      region,
      datums,
      systems: systemsFromTitle(ctx.key, title),
      service_groups: serviceGroups,
      continuations,
      diagram_tags: diagramTags,
      device_states: deviceStatesInRegion(ctx, region, diagramTags),
      network_transports: networkTransports,
      network_components: networkComponents,
      floor_placements: floorPlacements,
      trace_candidates: traceCandidates,
      topology,
      status,
      semantic_status: "evidence_inventory",
      review: {
        human_review_required: true,
        unresolved_trace_candidates: traceCandidates.length,
        unresolved_crossings: unresolvedCrossings,
        note: "Authored labels, floors, equipment references and off-page continuations are cited. Raw vector traces remain candidates until service-label and equipment-port connectivity proves a semantic riser graph.",
      },
      human_review_required: true,
    };
  });
}

function engineeringReadinessFor(
  schematics: ControlSchematic[],
  risers: RiserDiagram[],
  continuationLinks: DiagramContinuationLink[],
): ControlSchematicResult["engineering_readiness"] {
  const diagrams = [...schematics, ...risers];
  const statuses = diagrams.map((diagram) => diagram.semantic_status);
  const verified = statuses.filter((status) => status === "verified_semantic_graph").length;
  const partial = statuses.filter((status) => status === "partial_connectivity").length;
  const inventory = statuses.filter((status) => status === "evidence_inventory").length;
  const unresolvedCrossings = schematics.reduce((sum, item) => sum + item.review.unresolved_crossings, 0)
    + risers.reduce((sum, item) => sum + item.review.unresolved_crossings, 0);
  const unresolvedTraces = risers.reduce((sum, item) => sum + item.review.unresolved_trace_candidates, 0);
  const unmappedInstruments = schematics.reduce((sum, item) => sum + item.review.unmapped_instruments, 0);
  const unresolvedSequenceBindings = schematics.filter((item) => item.sequence_binding_status !== "bound").length;
  const unboundEquipment = schematics.reduce(
    (sum, item) => sum + item.equipment.filter((equipment) => equipment.schedule_binding_status !== "bound").length,
    0,
  );
  const unresolvedContinuations = continuationLinks.filter(({ status }) => status !== "reciprocal").length;
  const blockers: ControlSchematicResult["engineering_readiness"]["blockers"] = [];
  if (!diagrams.length) blockers.push({
    code: "DIAGRAM_COVERAGE_NOT_ESTABLISHED",
    count: 1,
    explanation: "No control, flow, piping, or riser diagram was detected; confirm whether the issued set omits them or extraction missed them.",
  });
  if (inventory + partial) blockers.push({
    code: "SEMANTIC_CONNECTIVITY_UNVERIFIED",
    count: inventory + partial,
    explanation: "One or more diagrams have cited evidence but not a fully verified equipment-port-device graph.",
  });
  if (unresolvedCrossings) blockers.push({
    code: "UNRESOLVED_DIAGRAM_CROSSINGS",
    count: unresolvedCrossings,
    explanation: "Crossing linework has not been proven connected or non-connected by authored junction evidence.",
  });
  if (unresolvedTraces) blockers.push({
    code: "UNRESOLVED_RISER_TRACES",
    count: unresolvedTraces,
    explanation: "Vertical vector candidates are not yet bound to a service, device ports, direction, and floor transitions.",
  });
  if (unresolvedContinuations) blockers.push({
    code: "UNRESOLVED_OFF_PAGE_CONTINUATIONS",
    count: unresolvedContinuations,
    explanation: "One or more authored off-page references lack a unique reciprocal callout at a complementary diagram boundary.",
  });
  if (unmappedInstruments) blockers.push({
    code: "UNMAPPED_INSTRUMENT_LABELS",
    count: unmappedInstruments,
    explanation: "Instrument mnemonics lack a cited project legend, explicit I/O token, point-list row, or SOO relationship sufficient for typing.",
  });
  if (unresolvedSequenceBindings) blockers.push({
    code: "UNRESOLVED_SEQUENCE_BINDINGS",
    count: unresolvedSequenceBindings,
    explanation: "A control schematic is not uniquely bound to one cited sequence-of-operation block.",
  });
  if (unboundEquipment) blockers.push({
    code: "UNBOUND_SCHEMATIC_EQUIPMENT",
    count: unboundEquipment,
    explanation: "Equipment shown in a control schematic lacks exactly one relevant cited HVAC/BAS schedule row; zero and multiple candidates remain unresolved.",
  });
  const status: ControlSchematicResult["engineering_readiness"]["status"] = !diagrams.length
    ? "coverage_not_established"
    : verified === diagrams.length && blockers.length === 0
      ? "principal_engineering_ready"
      : verified + partial > 0
        ? "partial_engineering_model"
        : "evidence_inventory_only";
  return {
    status,
    diagram_count: diagrams.length,
    verified_semantic_graphs: verified,
    partial_semantic_graphs: partial,
    evidence_inventory_graphs: inventory,
    blockers,
    human_review_required: true,
    ready_for_unattended_release: false,
  };
}

/** Shared extraction entry point used by Session/UI/MCP. */
export function extractControlSchematics(contexts: ControlSheetContext[], graph?: SheetGraph | null): ControlSchematicResult {
  const schematics: ControlSchematic[] = [];
  const risers: RiserDiagram[] = [];
  const tables = graph?.tables || [];
  const narratives = graph?.sequence_narratives || [];
  for (const ctx of contexts) {
    const titleCandidates = ctx.spans
      .filter((span) => isControlSchematicTitle(span, ctx.height) && clean(span.str).length <= 180)
      .map((span) => expandedControlTitle(span, ctx.spans));
    const titles = titleCandidates.filter((title, index, list) => !list.some((other, otherIndex) => otherIndex < index
      && canon(other.str) === canon(title.str)
      && Math.abs(atOf(other)[0] - atOf(title)[0]) <= 8
      && Math.abs(atOf(other)[1] - atOf(title)[1]) <= 8));
    for (const title of titles) {
      const region = diagramRegion(title, titles, ctx.spans, ctx.width, ctx.height);
      const relevant = ctx.spans.filter((span) => inRegion(span, region));
      const explicitPoints: SchematicPoint[] = relevant
        .filter((span) => IO_TYPES.has(canon(span.str)))
        .map((span, index) => ({
          id: `point:${ctx.key}:${Math.round(span.x)}:${Math.round(span.y)}:${index}`,
          point_type: canon(span.str) as SchematicPoint["point_type"],
          at: atOf(span),
          evidence: evidenceFor(ctx.key, span),
          typing_basis: "explicit_printed_io_token",
        }));
      const instruments: SchematicInstrument[] = relevant
        .filter((span) => INSTRUMENT_RE.test(canon(span.str)) && !IO_TYPES.has(canon(span.str)))
        .map((span, index) => ({
          id: `instrument:${ctx.key}:${Math.round(span.x)}:${Math.round(span.y)}:${index}`,
          label: canon(span.str),
          at: atOf(span),
          evidence: evidenceFor(ctx.key, span),
          io_type: null,
          status: "unmapped_instrument_label",
        }));
      const counts = { AI: 0, AO: 0, DI: 0, DO: 0 };
      explicitPoints.forEach((point) => { counts[point.point_type]++; });
      const topology = topologyFor(ctx.key, ctx.segs, region);
      const ioBindings = ioBindingsFor(ctx.key, explicitPoints, instruments, ctx.segs, region);
      for (const binding of ioBindings) {
        const instrument = instruments.find((candidate) => candidate.id === binding.instrument_id);
        if (instrument) {
          instrument.io_type = binding.point_type;
          instrument.status = "mapped_to_explicit_io";
        }
      }
      const sequenceBinding = sequenceRefsFor(title, ctx.key, narratives, region);
      if (!plainSchematicHasControlSupport(ctx, title, sequenceBinding, explicitPoints, instruments, topology)) continue;
      schematics.push({
        id: `schematic:${ctx.key}:${Math.round(title.x)}:${Math.round(title.y)}`,
        sheet: ctx.key,
        title: clean(title.str),
        title_evidence: evidenceFor(ctx.key, title),
        region,
        explicit_points: explicitPoints,
        point_totals: { ...counts, total: explicitPoints.length },
        instruments,
        io_bindings: ioBindings,
        equipment: equipmentInRegion(ctx.key, ctx.spans, region, tables),
        component_labels: componentLabelsInRegion(ctx.key, ctx.spans, region),
        media_labels: relevant.filter((span) => MEDIA_RE.test(canon(span.str))).map((span) => ({
          label: canon(span.str), evidence: evidenceFor(ctx.key, span),
        })),
        sequence_refs: sequenceBinding.sequence_refs,
        sequence_binding_status: sequenceBinding.sequence_binding_status,
        topology,
        semantic_status: "evidence_inventory",
        review: {
          human_review_required: true,
          unresolved_crossings: topology.crossings.filter((crossing) => crossing.status === "unresolved_crossing").length,
          unmapped_instruments: instruments.filter(({ status }) => status === "unmapped_instrument_label").length,
        },
      });
    }
    risers.push(...extractRisers(ctx, tables));
  }
  const diagramConflicts = diagramStateConflicts(risers);
  const continuationLinks = continuationLinksFor(risers);
  const engineeringReadiness = engineeringReadinessFor(schematics, risers, continuationLinks);
  return {
    schema_version: "opentakeoff.control_schematic.v1",
    schematics,
    risers,
    diagram_conflicts: diagramConflicts,
    continuation_links: continuationLinks,
    engineering_readiness: engineeringReadiness,
    totals: {
      schematics: schematics.length,
      riser_diagrams: risers.length,
      explicit_points: schematics.reduce((sum, schematic) => sum + schematic.explicit_points.length, 0),
      explicit_io_bindings: schematics.reduce((sum, schematic) => sum + schematic.io_bindings.length, 0),
      instruments_unmapped: schematics.reduce((sum, schematic) => sum + schematic.review.unmapped_instruments, 0),
      unresolved_sequence_bindings: schematics.filter((schematic) => schematic.sequence_binding_status !== "bound").length,
      // This total describes every diagram in this result, just like the
      // engineering-readiness blocker immediately above. Omitting riser
      // crossings made one receipt report two answers for the same evidence.
      unresolved_crossings: schematics.reduce((sum, schematic) => sum + schematic.review.unresolved_crossings, 0)
        + risers.reduce((sum, riser) => sum + riser.review.unresolved_crossings, 0),
      authored_riser_service_groups: risers.reduce((sum, riser) => sum + riser.service_groups.length, 0),
      off_page_continuations: risers.reduce((sum, riser) => sum + riser.continuations.length, 0),
      off_page_continuation_links: continuationLinks.length,
      unresolved_off_page_continuations: continuationLinks.filter(({ status }) => status !== "reciprocal").length,
      unresolved_trace_candidates: risers.reduce((sum, riser) => sum + riser.trace_candidates.length, 0),
      diagram_state_conflicts: diagramConflicts.length,
      authored_network_transports: risers.reduce((sum, riser) => sum + riser.network_transports.length, 0),
      authored_network_components: risers.reduce((sum, riser) => sum + riser.network_components.length, 0),
      authored_floor_placements: risers.reduce((sum, riser) => sum + riser.floor_placements.length, 0),
      verified_semantic_graphs: engineeringReadiness.verified_semantic_graphs,
    },
    exclusions: [
      "Instrument mnemonics are not converted to AI/AO/DI/DO without explicit printed I/O, a project legend, or other cited authored evidence.",
      "Interior line crossings remain disconnected unless compact drawn junction geometry supports a connection.",
      "Riser direction remains unknown unless an authored arrow is detected; vertical geometry alone never chooses supply/return direction.",
      "Raw vertical vector traces are unresolved candidates, not counted risers, until authored service labels and equipment ports are connected to them.",
      "A floor placement means cited text lies inside an authored floor band; it does not by itself prove network or piping connectivity, installed multiplicity, or service responsibility.",
      "NO/NC is retained as the authored normal state. It is not reinterpreted as fail position or commanded operating state.",
      "Installed plan quantity is not inferred from a schematic occurrence. Schematic topology and installed plan evidence remain separate.",
      "All results require estimator review; this pass cannot approve or release a BAS takeoff.",
    ],
  };
}
