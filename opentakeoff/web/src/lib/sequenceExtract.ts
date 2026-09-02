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
      // No table exists for a title-only SOO hit, so there's no real bbox to
      // cite — a bespoke evidence shape, not titleEvidence() (which needs a
      // table's own title cell). TS can't verify this loose-typed .mjs
      // helper shape exactly; see the pre-existing sibling casts in this file.
      evidence: [{
        page: parseInt(String(hit.sheet_id || "").split("#")[1] || "1", 10) || 1,
        bbox: [0, 0, 0, 0],
        layer: "L2",
        kind: "header",
        rawIds: [`soo:title:${hit.title.slice(0, 40)}`],
        rawText: hit.title,
        confidence: 0.5,
      }] as ExtractedSequence["evidence"],
      sources: ["schedule"],
      sheet: hit.sheet_id || "",
      tableId: -1,
    });
  }
  return out;
}

const SEQUENCE_EXCLUSIONS = [
  "impliedPoints is always empty — this compiles SOO narrative sections with citations, it never derives typed AI/AO/BI/BO point counts from prose (that stays refuse_not_done on the bas_points path's own estimator_product.soo gate)",
  "Non-tabular narrative pages with no schedule/table structure at all are not walked — only tables ODL/sheetgraph already extracted (title-hunt + row-shape detection); a pure-prose SOO sheet with zero table structure is disclosed via detectSooPresence's title-only hit, not section-extracted",
  "Section boundaries are inferred from row/heading shape (numbered/lettered lists, SECTION/SEQUENCE headers) — a firm that writes its SOO as unbroken paragraph text with no such markers may extract as a single tabular_stub section rather than per-step sections",
];

/**
 * Compile a full sequence-of-operations takeoff — every real SOO/control-
 * sequence table or narrative-title hit across the set, with section text
 * and per-cell citations. Same envelope shape as compileHvacTakeoff /
 * compileBasTakeoff (T-HVAC-01 / T-BAS-01) so it rides the identical
 * MCP tool / HTTP endpoint / UI panel plumbing — see corpusTakeoff.mjs's
 * compileCorpusTakeoff dispatcher and takeoffWorkbookSheets.
 *
 * Deliberately NEVER derives typed I/O points from SOO prose — that stays
 * refuse_not_done (see bas_points' own estimator_product.soo gate). This
 * exists so an agent can retrieve and cite the actual sequence TEXT, which
 * extractSequencesFromGraph already extracts but no MCP tool previously
 * exposed at all.
 */
export function compileSequencesTakeoff(sessionOrSheets: unknown, graph: SheetGraph | null | undefined) {
  const sequences = extractSequencesFromGraph(graph);
  const byStatus = { extracted: 0, narrative_only: 0, tabular_stub: 0, absent: 0 };
  let sectionsTotal = 0;
  for (const seq of sequences) {
    byStatus[seq.status] = (byStatus[seq.status] || 0) + 1;
    sectionsTotal += seq.sections.length;
  }

  const sheetKeys = Array.isArray((graph as any)?.sheets)
    ? (graph as any).sheets.map((s: any) => ({
      key: s.key || s.sheet || s.id,
      number: s.sheetNumber ?? s.number ?? null,
    }))
    : [];
  const seqBySheet = new Map<string, typeof sequences>();
  for (const seq of sequences) {
    const list = seqBySheet.get(seq.sheet) || [];
    list.push(seq);
    seqBySheet.set(seq.sheet, list);
  }
  const pages: Array<{ sheet_id: string; sheet_number: unknown; status: string; titles: string[] }> =
    sheetKeys.map((s: { key: string; number: unknown }) => {
      const here = seqBySheet.get(s.key) || [];
      return {
        sheet_id: s.key,
        sheet_number: s.number,
        status: here.length === 0 ? "empty_for_sequences" : "has_sequence",
        titles: here.map((h) => h.title),
      };
    });

  return {
    schema_version: 1,
    takeoff_id: "T-SOO-01",
    kind: "sequences",
    compiler: "sequenceExtract.compileSequencesTakeoff",
    sheet_count: sheetKeys.length,
    categories: {
      sequences: {
        provenance:
          "Every table this project's shared vector pipeline (sheetgraph.ts + ODL) already found and classified as a sequence-of-operations / control-sequence table (title match, or corpusTakeoff.mjs's detectSooPresence narrative-title hit when no table exists), walked row-by-row into headed sections with per-cell citations. Never invents section text; never derives typed points from it.",
        list: sequences.map((seq) => ({
          id: seq.id,
          title: seq.title,
          system_tag: seq.systemTag,
          status: seq.status,
          sheet_id: seq.sheet,
          table_id: seq.tableId,
          section_count: seq.sections.length,
          sections: seq.sections.map((s) => ({ heading: s.heading, body: s.body, evidence: s.evidence })),
          evidence: seq.evidence,
        })),
        totals: { sequences: sequences.length, sections: sectionsTotal, ...byStatus },
      },
    },
    totals: { sequences: sequences.length, sections: sectionsTotal, ...byStatus },
    page_accounting: {
      sheet_count: sheetKeys.length,
      pages_accounted_for: pages.length,
      empty_pages: pages.filter((p) => p.status.startsWith("empty")).length,
      pages,
    },
    exclusions: SEQUENCE_EXCLUSIONS,
  };
}

export { detectSooPresence };
