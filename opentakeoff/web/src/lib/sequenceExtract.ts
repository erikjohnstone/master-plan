/**
 * P3 — sequence-of-operations extraction on the shared Session path.
 * Builds on corpusTakeoff SOO detectors; never invents points from narrative.
 */
import {
  detectSooPresence,
  isSooNarrativeTitle,
  tableHeaderBlob,
} from "./corpusTakeoff.mjs";
import type { ScheduleTable, SheetGraph } from "./sheetgraph.ts";
import { cellEvidence, rowEvidence, titleEvidence } from "./takeoffEvidence.mjs";

export type SequenceStatus = "extracted" | "narrative_only" | "tabular_stub" | "absent";

export interface SequenceSection {
  heading: string;
  body: string;
  evidence: ReturnType<typeof cellEvidence>[];
}

export interface ExtractedSequence {
  id: string;
  title: string;
  systemTag: string;
  status: SequenceStatus;
  sections: SequenceSection[];
  /** Always empty on scored path — SOO-derived points remain refuse_not_done. */
  impliedPoints: string[];
  evidence: ReturnType<typeof titleEvidence>[];
  sources: string[];
  sheet: string;
  tableId: number;
}

const SECTION_HEADING_RE =
  /^(?:\d+\.?|\([a-z]\)|[A-Z]\.|SECTION\s+\d+|SEQ(?:UENCE)?\s*\d*)/i;
const EQUIP_TAG_RE = /\b(AHU|RTU|FCU|VAV|DOAS|BOILER|CHILLER|PUMP|EF|SF)[-\s]?[\w-]*/i;

function inferSystemTag(title: string, blob: string): string {
  const m = `${title} ${blob}`.match(EQUIP_TAG_RE);
  return m ? m[0].replace(/\s+/g, "-").toUpperCase() : "UNKNOWN";
}

function rowSectionText(row: ScheduleTable["rows"][number]): string {
  const parts: string[] = [];
  const key = String(row.key || "").trim();
  if (key) parts.push(key);
  for (const cell of Object.values(row.cells || {})) {
    const t = String(cell?.text || "").trim();
    if (t) parts.push(t);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function sectionsFromTable(
  table: ScheduleTable,
  tableId: number,
): SequenceSection[] {
  const sections: SequenceSection[] = [];
  for (const row of table.rows || []) {
    const body = rowSectionText(row);
    if (!body || body.length < 8) continue;
    const heading = SECTION_HEADING_RE.test(String(row.key || "").trim())
      ? String(row.key).trim()
      : body.slice(0, 80);
    const evidence = [];
    for (const [col, cell] of Object.entries(row.cells || {})) {
      if (!cell?.text) continue;
      evidence.push(cellEvidence({
        sheetKey: table.sheet,
        tableId,
        rowKey: row.key,
        colKey: col,
        cell,
        layer: "L5",
      }));
    }
    if (!evidence.length) {
      evidence.push(rowEvidence(table.sheet, tableId, row, "L5"));
    }
    sections.push({ heading, body, evidence });
  }
  return sections;
}

function sequenceStatus(table: ScheduleTable, sections: SequenceSection[]): SequenceStatus {
  if (sections.length >= 2) return "extracted";
  if (sections.length === 1) return "tabular_stub";
  return "narrative_only";
}

function isSequenceTable(table: ScheduleTable): boolean {
  const title = String(table.title?.text || "").trim();
  if (isSooNarrativeTitle(title)) return true;
  const blob = tableHeaderBlob(table);
  if (/\bSEQUENCES?\s+OF\s+OPERATIONS?\b/i.test(title + " " + blob)) return true;
  if (/\bSEQUENCE\s+OF\s+CONTROL\b/i.test(title + " " + blob)) return true;
  if (/\bCONTROL\s+SEQUENCES?\b/i.test(title + " " + blob)) return true;
  return false;
}

/**
 * Extract SOO / control sequence objects from an already-built sheet graph.
 * Narrative-only sheets disclose presence with title evidence; no implied points.
 */
export function extractSequencesFromGraph(graph: SheetGraph | null | undefined): ExtractedSequence[] {
  const tables = [...(graph?.tables || [])].sort((a, b) =>
    String(a.sheet).localeCompare(String(b.sheet))
    || String(a.title?.text || "").localeCompare(String(b.title?.text || "")),
  );

  const out: ExtractedSequence[] = [];
  tables.forEach((table, tableId) => {
    if (!isSequenceTable(table)) return;
    const title = String(table.title?.text || "").trim() || "(untitled sequence table)";
    const blob = tableHeaderBlob(table);
    const sections = sectionsFromTable(table, tableId);
    const status = sequenceStatus(table, sections);
    const ev = [titleEvidence(table.sheet, tableId, table.title || { text: title }, "L2")];
    out.push({
      id: `seq:${tableId}`,
      title,
      systemTag: inferSystemTag(title, blob),
      status,
      sections,
      impliedPoints: [],
      evidence: ev,
      sources: ["schedule"],
      sheet: table.sheet,
      tableId,
    });
  });

  if (out.length) return out;

  const soo = detectSooPresence(graph);
  for (const hit of soo.titles || []) {
    out.push({
      id: `soo:${out.length}`,
      title: hit.title,
      systemTag: inferSystemTag(hit.title, ""),
      status: "narrative_only",
      sections: [],
      impliedPoints: [],
      evidence: [{
        page: parseInt(String(hit.sheet_id || "").split("#")[1] || "1", 10) || 1,
        bbox: [0, 0, 0, 0],
        layer: "L2",
        kind: "header",
        rawIds: [`soo:title:${hit.title.slice(0, 40)}`],
        rawText: hit.title,
        confidence: 0.5,
      }],
      sources: ["schedule"],
      sheet: hit.sheet_id || "",
      tableId: -1,
    });
  }
  return out;
}

export { detectSooPresence };
