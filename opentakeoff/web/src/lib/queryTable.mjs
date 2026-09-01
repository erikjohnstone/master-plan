/**
 * Shared schedule/table query — same logic MCP `query_table` and the Takeoff UI
 * agent tool must use. Operates on a SheetGraph (Session+ODL or geometric).
 *
 * Do not reimplement title matching / unique MARK counting / building_tag_counts
 * / point_type_counts in the UI — import this.
 */
import { rowKeyAnswersFor } from "./sheetgraph.ts";
import { queryTitleMatchesNeedle } from "./scheduleTitleMatch.mjs";

/**
 * @param {object} graph - SheetGraph with .tables / .available
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.row_key]
 * @param {string} [opts.column]
 * @param {string} [opts.cell_value]
 * @param {string} [opts.cell_contains]
 * @param {number} [opts.limit]
 * @returns {object} wire-shaped query_table result
 */
export function queryTable(graph, opts = {}) {
  const {
    title,
    row_key,
    column,
    cell_value,
    cell_contains,
    limit = 100,
  } = opts;

  if (!title && !row_key && !column && !cell_value && !cell_contains) {
    return { error: "Pass at least one of title, row_key, column, cell_value, or cell_contains." };
  }
  if (!graph?.available && !(graph?.tables?.length)) {
    return { error: "This set has no text layer (a scan) — the sheet graph is unavailable." };
  }

  const titleNeedle = title?.trim().toUpperCase().replace(/\s+/g, " ")
    .replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim() || undefined;
  const rowNeedle = row_key?.trim().toUpperCase().replace(/\s+/g, "");
  const columnNeedle = column?.trim().toUpperCase();
  const valueNeedle = cell_value?.trim().toUpperCase().replace(/\s+/g, " ");
  const containsNeedle = cell_contains?.trim().toUpperCase().replace(/\s+/g, " ");

  const titleMatches = (rawTitle) => queryTitleMatchesNeedle(rawTitle, titleNeedle || "");

  const allRaw = (graph.tables || []).flatMap((table) => {
    if (!titleMatches(table.title?.text || "")) return [];
    const selectedHeaders = columnNeedle
      ? table.headers.filter((header) => header.toUpperCase().includes(columnNeedle))
      : table.headers;
    if (columnNeedle && !selectedHeaders.length) return [];
    return table.rows.flatMap((row) => {
      if (rowNeedle && !rowKeyAnswersFor(row.key, rowNeedle)) return [];
      if (valueNeedle && !Object.values(row.cells).some((cell) =>
        cell?.text.trim().toUpperCase().replace(/\s+/g, " ") === valueNeedle)) return [];
      if (containsNeedle && !Object.values(row.cells).some((cell) =>
        cell?.text.trim().toUpperCase().replace(/\s+/g, " ").includes(containsNeedle))) return [];
      const allCells = Object.fromEntries(table.headers.flatMap((header) => {
        const cell = row.cells[header];
        return cell?.text ? [[header, { text: cell.text, bbox: cell.bbox }]] : [];
      }));
      const rowKey = row.key.trim().toUpperCase().replace(/\s+/g, "");
      const identityHeaders = table.headers.filter((header) =>
        allCells[header]?.text.trim().toUpperCase().replace(/\s+/g, "") === rowKey);
      const titleText = (table.title?.text || "").toUpperCase();
      const identityHeader = identityHeaders.find((header) =>
        header.toUpperCase().split(/\s+/).some((word) =>
          !["ID", "MARK", "CODE", "SYMBOL", "TAG", "NO", "NUMBER"].includes(word)
          && titleText.includes(word))) ?? identityHeaders[0];
      const identityCell = identityHeader ? allCells[identityHeader] : null;
      const cells = Object.fromEntries(selectedHeaders.flatMap((header) => {
        const cell = row.cells[header];
        return cell?.text ? [[header, { text: cell.text, bbox: cell.bbox }]] : [];
      }));
      if (columnNeedle && !Object.keys(cells).length) return [];
      return [{
        sheet: table.sheet,
        kind: table.kind,
        title: table.title ? { text: table.title.text, bbox: table.title.bbox } : null,
        region: table.region,
        headers: selectedHeaders,
        row: {
          key: row.key,
          identity: identityCell ? {
            header: identityHeader,
            text: identityCell.text,
            bbox: identityCell.bbox,
          } : null,
          cells,
          all_cells: allCells,
        },
      }];
    });
  });

  const all = (titleNeedle && /CHILLER/i.test(titleNeedle) && !/HEAT\s*RECOVERY/i.test(titleNeedle))
    ? allRaw.filter((match) => !/HEAT\s*RECOVERY/i.test(match.title?.text || ""))
    : allRaw;

  const uniqueRaw = [...new Map(all.map((match) => {
    const titleText = match.title?.text || "";
    const titleBase = titleText.toUpperCase().replace(/\s+/g, " ").trim()
      .replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim();
    return [`${titleBase}::${match.row.key.toUpperCase().replace(/\s+/g, "")}`, match];
  })).values()];

  const familyKeyRe = (titleStr) => {
    const t = String(titleStr || "").toUpperCase();
    if (/VOLUME CONTROL BOX|VARIABLE AIR VOLUME|AIR TERMINAL BOX/.test(t)) return /^VAV[\s\-]/i;
    if (/FAN\s*COIL/.test(t)) return /^(?:FCU|EV)[\s\-]/i;
    if (/AIR HANDLING UNIT/.test(t) && !/DEDICATED/.test(t)) return /^AHU[\s\-]/i;
    if (/DEDICATED OUTDOOR AIR/.test(t)) return /^DOAH[\s\-]/i;
    if (/BOILER/.test(t)) return /^B[\s\-]/i;
    return null;
  };

  const unique = uniqueRaw.filter((match) => {
    if (row_key || column || cell_value || cell_contains) return true;
    const re = familyKeyRe(match.title?.text);
    if (!re) return true;
    return re.test(String(match.row.key || ""));
  });

  if (row_key) {
    const equipmentScheduleRank = (titleStr, key) => {
      const t = String(titleStr || "").toUpperCase().replace(/\s+/g, " ");
      const family = String(key || "").toUpperCase().match(/^([A-Z]{2,8})(?=-)/)?.[1] || "";
      if (/VIBRATION ISOLATION|SOUND POWER|CONTROL VALVE|POINTS LIST|PUMP SCHEDULE/i.test(t)) return 90;
      if (family === "DOAH" && /DEDICATED OUTDOOR AIR/.test(t)) return /HANDLING/.test(t) ? 0 : 1;
      if (family === "AHU" && /AIR HANDLING UNIT/.test(t) && !/DEDICATED/.test(t)) return 0;
      if (family === "FCU" && /FAN\s*COIL/.test(t)) return 0;
      if (family === "VAV" && /VOLUME CONTROL BOX|VARIABLE AIR VOLUME|\bVAV\b/.test(t)) return 0;
      if ((family === "CH" || family === "B") && /(?:CHILLER|BOILER)/.test(t)) return 0;
      if (/SCHEDULE/.test(t)) return 40;
      return 60;
    };
    unique.sort((a, b) =>
      equipmentScheduleRank(a.title?.text, a.row.key)
      - equipmentScheduleRank(b.title?.text, b.row.key));
  }

  const broad = !row_key && !column && !cell_value && !cell_contains;
  const keysOnly = broad && unique.length > 3;
  const annotateFamily = (match) => {
    const re = familyKeyRe(match.title?.text);
    const family_mark = !re || re.test(String(match.row.key || ""));
    return { ...match, family_mark, row: { ...match.row, family_mark } };
  };
  const matches = unique.slice(0, limit).map((match) => {
    const annotated = annotateFamily(match);
    if (!keysOnly) return annotated;
    const identity = annotated.row.identity;
    const markCell = identity
      ? { [identity.header]: { text: identity.text, bbox: identity.bbox } }
      : {};
    return {
      sheet: annotated.sheet,
      kind: annotated.kind,
      title: annotated.title,
      region: annotated.region,
      family_mark: annotated.family_mark,
      headers: identity ? [identity.header] : [],
      row: {
        key: annotated.row.key,
        identity,
        family_mark: annotated.family_mark,
        cells: markCell,
        all_cells: markCell,
      },
    };
  });

  const buildingTagCounts = (() => {
    if (!keysOnly) return undefined;
    const counts = {};
    for (const match of unique) {
      const tag = match.row.key || "";
      const m = tag.match(/-([AMT])(?=[A-Z0-9]|$)/i);
      const b = m ? m[1].toUpperCase() : "other";
      counts[b] = (counts[b] || 0) + 1;
    }
    return counts;
  })();

  const pointTypeCounts = (() => {
    if (!keysOnly) return undefined;
    const counts = { AI: 0, AO: 0, BI: 0, BO: 0, other: 0 };
    let typed = 0;
    for (const match of unique) {
      const tag = String(match.row.key || "").toUpperCase();
      const m = tag.match(/^(AI|AO|BI|BO)\d/i);
      if (m) {
        counts[m[1].toUpperCase()] += 1;
        typed += 1;
      } else {
        counts.other += 1;
      }
    }
    if (typed < Math.max(4, Math.ceil(unique.length * 0.5))) return undefined;
    if (counts.other === 0) {
      const { other: _drop, ...typedOnly } = counts;
      return typedOnly;
    }
    return counts;
  })();

  const multiTitleHint = (() => {
    if (!row_key || keysOnly) return null;
    const titles = [...new Set(unique.map((m) => m.title?.text).filter(Boolean))];
    if (titles.length < 2) return null;
    const primary = unique[0]?.title?.text || titles[0];
    return `MARK ${row_key} appears on ${titles.length} tables. When asked which schedule the unit is on, cite the primary equipment schedule title first (matches[0].title="${primary}"), not vibration-isolation / valve / sound / points-list cross-refs.`;
  })();

  const nonFamilyHint = (() => {
    if (keysOnly || !unique.length) return null;
    const bad = matches.filter((m) => m.family_mark === false);
    if (!bad.length) return null;
    const sample = bad[0];
    const key = sample.row?.key || row_key || cell_contains || "?";
    const titleStr = sample.title?.text || titleNeedle || "this schedule";
    const ident = sample.row?.identity?.header || "non-TAG";
    return `Row key "${key}" on "${titleStr}" is not a family equipment MARK (identity header ${ident}; family_mark=false). Do not count it as a scheduled VAV/AHU/FCU/etc. unit — answer no when asked if it is a scheduled unit of that family.`;
  })();

  return {
    query: {
      title: title ?? null,
      row_key: row_key ?? null,
      column: column ?? null,
      cell_value: cell_value ?? null,
      cell_contains: cell_contains ?? null,
    },
    count: unique.length,
    truncated: unique.length > limit,
    matches,
    ...(buildingTagCounts ? { building_tag_counts: buildingTagCounts } : {}),
    ...(pointTypeCounts ? { point_type_counts: pointTypeCounts } : {}),
    ...(unique.length === 0 ? {
      next_move: cell_contains
        ? "Zero rows matched. Retry once with cell_contains set to an exact equipment tag from the user question and no title filter, then inspect returned descriptions; do not paraphrase the same empty description query."
        : "Zero rows matched. Drop invented title filters, use a filter value that already appears in tool evidence, or refuse if the evidence is not present.",
    } : keysOnly ? {
      next_move: pointTypeCounts
        ? `Use count=${unique.length} as the points-list row total and point_type_counts=${JSON.stringify(pointTypeCounts)} for the AI/AO/BI/BO breakdown. Do not re-filter with cell_contains for each point type. Re-query with row_key only for MARK cells you must cite.`
        : `Use count=${unique.length} as the scheduled row total and building_tag_counts=${JSON.stringify(buildingTagCounts)} for building splits. Re-query with row_key for citation cell bboxes.`,
    } : nonFamilyHint ? {
      next_move: nonFamilyHint,
    } : multiTitleHint ? {
      next_move: multiTitleHint,
    } : {}),
  };
}
