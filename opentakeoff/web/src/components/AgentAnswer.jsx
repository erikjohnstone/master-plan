// Structured renderer for Agent chat Answers.
// Models write markdown (tables, bold, lists). Dumping that as pre-wrap text
// makes takeoffs unreadable — pipe tables and ** markers look like a dump.
// This is a small, dependency-free subset aimed at estimator readability.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CiteValue from "./CiteValue.jsx";
import { useFocusWorkspace } from "./WorkspaceDock.jsx";
import { buildCiteIndex, linkMarks, citeTitle } from "../lib/citeMatch.js";

/** Turn the plain-text runs of an inline pass into clickable evidence.
 *
 *  Runs LAST and only over unformatted string slices, so it can never split a
 *  <strong>/<em>/<code> node the markdown pass already built. A mark inside
 *  bold text simply stays bold and unlinked — losing a link is fine, corrupting
 *  the answer is not. */
function citeNodes(str, cites, onOpenCitation, keyBase) {
  if (!cites || cites.size === 0) return [str];
  const segs = linkMarks(str, cites);
  if (segs.length === 1 && !segs[0].citation) return [str];
  return segs.map((seg, i) => (seg.citation ? (
    <CiteValue
      key={`${keyBase}-c${i}`}
      text={seg.text}
      cite={seg.citation}
      onOpenCitation={onOpenCitation}
      mono
      weight={600}
      title={citeTitle(seg.citation)}
    />
  ) : seg.text));
}

function inlineMd(text, cites, onOpenCitation) {
  const s = String(text || "");
  const nodes = [];
  // Bold **…**, then italic *…*, then inline code `…`, else plain.
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m;
  const plain = (chunk, at) => nodes.push(...citeNodes(chunk, cites, onOpenCitation, at));
  while ((m = re.exec(s))) {
    if (m.index > last) plain(s.slice(last, m.index), last);
    if (m[2] != null) nodes.push(<strong key={m.index}>{m[2]}</strong>);
    else if (m[3] != null) nodes.push(<em key={m.index}>{m[3]}</em>);
    else if (m[4] != null) {
      nodes.push(
        <code key={m.index} style={{ fontFamily: "var(--f-mono)", fontSize: "0.92em", background: "var(--paper)", padding: "0 3px", borderRadius: 3 }}>
          {m[4]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) plain(s.slice(last), last);
  return nodes.length ? nodes : s;
}

/** Strip model-internal highlight tokens that belong in Sources, not chat. */
function scrubEstimatorNoise(raw) {
  return String(raw || "")
    // Unicode/ASCII highlight id stamps the model sometimes embeds mid-cell.
    .replace(/【[^】]*】/g, "")
    .replace(/\[[^\]]*mk-[0-9a-f-]{8,}[^\]]*\]/gi, "")
    // Collapse horizontal runs only — never eat newlines (tables need them).
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n");
}

function parseTable(lines, start) {
  const rows = [];
  let i = start;
  while (i < lines.length && /^\s*\|/.test(lines[i])) {
    const cells = lines[i]
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim());
    // Skip markdown separator rows: |---|---|
    if (!cells.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(cells);
    i += 1;
  }
  return { rows, next: i };
}

// Presentation only: the existing answer contract flattens table rows into
// "label: value · label: value" text. Lay out those explicit separators; never
// query, infer units, repair values, group columns, or create takeoff records.
// Ambiguous/unstructured text keeps the ordinary markdown rendering.
function displayFields(item) {
  const chunks = item.split(" · ");
  if (chunks.length < 4) return null;
  const fields = chunks.map(chunk => {
    const pair = /^(.+?):(?: |$)(.*)$/.exec(chunk);
    if (!pair || !pair[1].trim()) return null;
    return { label: pair[1], value: pair[2] };
  });
  return fields.every(Boolean) ? fields : null;
}

// Models often use nonbreaking spaces across an entire column label. Add
// layout-only break opportunities without replacing any original characters.
function wrapFieldLabel(nodes) {
  return (Array.isArray(nodes) ? nodes : [nodes]).flatMap((node, index) => {
    if (typeof node !== "string") return [node];
    return node.split(/([\u00a0\u202f])/u).flatMap((part, partIndex) =>
      /^[\u00a0\u202f]$/u.test(part)
        ? [part, <wbr key={`${index}-${partIndex}`} />]
        : [part]);
  });
}

function AnswerFields({ fields, cites, onOpenCitation }) {
  return (
    <details className="agent-answer-record" data-agent-answer-record>
      <summary>
        <span className="agent-answer-record-label">{inlineMd(fields[0].label, null, null)}</span>
        <strong>{inlineMd(fields[0].value, null, null)}</strong>
        <span className="agent-answer-record-count">{fields.length} fields</span>
      </summary>
      <dl className="agent-answer-fields">
        {fields.map((field, index) => (
          <div key={index}>
            <dt>{wrapFieldLabel(inlineMd(field.label, cites, onOpenCitation))}</dt>
            <dd>{inlineMd(field.value, cites, onOpenCitation)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// This reader owns only transient presentation state. The original answer and
// evidence objects stay owned by AgentPanel; there is no new data pipeline.
function AnswerResults({ items, rows, cites, onOpenCitation }) {
  const [host, setHost] = useState(null);
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const [compare, setCompare] = useState(false);
  const launch = useRef(null);
  const back = useRef(null);
  const detail = useRef(null);
  const restore = useRef(null);
  const scroll = useRef(0);
  const focusWorkspace = useFocusWorkspace();
  useEffect(() => () => { restore.current?.(); }, []);
  const comparable = rows.length > 1 && rows.every(row =>
    row.length === rows[0].length && row.every((field, i) => field.label === rows[0][i].label));
  const visible = rows.map((fields, index) => ({ fields, index })).filter(({ fields }) =>
    fields.some(field => `${field.label} ${field.value}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const current = rows[selected] || rows[0];
  useEffect(() => {
    if (host) back.current?.focus();
  }, [host]);
  useEffect(() => { if (detail.current) detail.current.scrollTop = 0; }, [selected, compare]);
  const close = () => {
    setHost(null);
    restore.current?.();
    restore.current = null;
    requestAnimationFrame(() => {
      if (host?.isConnected) host.scrollTop = scroll.current;
      if (launch.current?.isConnected) launch.current.focus({ preventScroll: true });
    });
  };
  const cite = citation => { close(); onOpenCitation(citation); };
  return (
    <div className="agent-answer-results-entry">
      <div>
        <strong>{rows.length} answer {rows.length === 1 ? "row" : "rows"}</strong>
        <p>Explore the values in a full-workspace reader.</p>
      </div>
      <button ref={launch} type="button" className="btn-primary" onClick={() => {
        const target = launch.current?.closest(".agent-thread");
        if (!target) return;
        scroll.current = target.scrollTop;
        target.scrollTop = 0;
        restore.current = focusWorkspace();
        setHost(target);
      }}>Explore results</button>
      <details className="agent-answer-original">
        <summary>Original answer rows</summary>
        <ul>{items.map((item, index) => <li key={index}>{inlineMd(item, cites, onOpenCitation)}</li>)}</ul>
      </details>
      {host && createPortal(
        <section className="agent-results-reader" data-agent-results role="region" aria-label="Answer results" onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        }}>
          <header className="agent-results-heading">
            <button ref={back} type="button" onClick={close}>← Back to conversation</button>
            <div><h3>Answer results</h3><p>{rows.length} rows · Values from this answer, unchanged</p></div>
            {comparable && <div className="agent-results-modes" aria-label="Result view">
              <button type="button" aria-pressed={!compare} onClick={() => setCompare(false)}>Details</button>
              <button type="button" aria-pressed={compare} onClick={() => setCompare(true)}>Compare rows</button>
            </div>}
          </header>
          {compare ? <div className="agent-results-comparison" tabIndex={0} aria-label="Compare answer rows">
            <table><thead><tr>{rows[0].map((field, i) => <th key={i}>{wrapFieldLabel(inlineMd(field.label, null, null))}</th>)}</tr></thead>
              <tbody>{rows.map((fields, ri) => <tr key={ri}>{fields.map((field, ci) => <td key={ci}>{ci === 0
                ? <span className="agent-results-row-label" title={field.value}>{inlineMd(field.value, cites, cite)}</span>
                : inlineMd(field.value, cites, cite)}</td>)}</tr>)}</tbody>
            </table>
          </div> : <div className="agent-results-body">
            <nav className="agent-results-nav" aria-label="Answer rows">
              <label>Find a row<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search labels or values" /></label>
              <div>{visible.map(({ fields, index }) => <button key={index} type="button" aria-current={selected === index ? "true" : undefined} onClick={() => setSelected(index)}>
                <span>{inlineMd(fields[0].label, null, null)}</span><strong title={fields[0].value}>{inlineMd(fields[0].value, null, null)}</strong><small>{fields.length} fields</small>
              </button>)}</div>
              {!visible.length && <p>No matching rows. Clear the search to see all rows.</p>}
            </nav>
            <article ref={detail} className="agent-results-detail" aria-label="Selected answer row" tabIndex={0}>
              <header><span>{inlineMd(current[0].label, null, null)}</span><h4 title={current[0].value}>{inlineMd(current[0].value, cites, cite)}</h4><p>{current.length} fields · Original order</p></header>
              <dl className="agent-answer-fields">{current.map((field, index) => <div key={index}>
                <dt>{wrapFieldLabel(inlineMd(field.label, cites, cite))}</dt><dd>{inlineMd(field.value, cites, cite)}</dd>
              </div>)}</dl>
            </article>
          </div>}
        </section>, host)}
    </div>
  );
}

function blockNodes(raw, cites, onOpenCitation) {
  const text = scrubEstimatorNoise(raw);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let key = 0;

  const pushPara = (buf) => {
    const joined = buf.join(" ").trim();
    if (!joined) return;
    // Collapse lone automated-check notes into a muted footer chip.
    if (/^\[Automated check:/i.test(joined)) {
      out.push(
        <div key={key++} style={{ marginTop: 8, padding: "6px 8px", borderRadius: 6, background: "var(--paper)", color: "var(--ink-muted)", fontSize: 11, lineHeight: 1.45 }}>
          {joined.replace(/^\[|\]$/g, "")}
        </div>,
      );
      return;
    }
    out.push(
      <p key={key++} style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.55 }}>
        {inlineMd(joined, cites, onOpenCitation)}
      </p>,
    );
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Evidence / automated gates — keep secondary, never look like the Answer.
    // Four alternatives, matching AgentPanel's META_LINE_RE exactly. This list
    // had three: a [Workflow: …] line was routed to Technical steps by the
    // panel but rendered here as an ordinary paragraph, so the two disagreed
    // about what counts as machinery rather than answer.
    if (/^\[(?:Evidence gate|Automated check|Loop nudge|Workflow):/i.test(trimmed)) {
      out.push(
        <div key={key++} style={{ margin: "6px 0", padding: "6px 8px", borderRadius: 6, background: "var(--paper)", color: "var(--ink-muted)", fontSize: 11, lineHeight: 1.45 }}>
          {trimmed.replace(/^\[|\]$/g, "")}
        </div>,
      );
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      out.push(<hr key={key++} style={{ border: "none", borderTop: "1px solid var(--ink-faint)", margin: "10px 0" }} />);
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
      || /^\*\*(.+)\*\*$/.exec(trimmed);
    if (heading && !trimmed.includes("|")) {
      const level = heading[1]?.startsWith?.("#") ? heading[1].length : 3;
      const title = heading[2] || heading[1];
      const Tag = level === 1 ? "h3" : level === 2 ? "h4" : "h5";
      out.push(title.length > 240 ? (
        <details key={key++} className="agent-answer-long-heading">
          <summary>Full heading</summary>
          <Tag>{inlineMd(title, cites, onOpenCitation)}</Tag>
        </details>
      ) : (
        <Tag key={key++} style={{ margin: "10px 0 6px", fontSize: level === 1 ? 14.5 : 13.5, fontWeight: 700, lineHeight: 1.35, color: "var(--ink)" }}>
          {inlineMd(title, cites, onOpenCitation)}
        </Tag>
      ));
      i += 1;
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length) {
      const { rows, next } = parseTable(lines, i);
      if (rows.length >= 1) {
        const [header, ...body] = rows.length > 1 ? rows : [null, ...rows];
        out.push(
          <div key={key++} style={{ overflowX: "auto", margin: "6px 0 10px", border: "1px solid var(--ink-faint)", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, lineHeight: 1.4 }}>
              {header && (
                <thead>
                  <tr style={{ background: "var(--paper)" }}>
                    {header.map((cell, ci) => (
                      <th key={ci} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--ink-faint)", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {inlineMd(cell, cites, onOpenCitation)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {(header ? body : rows).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: "5px 8px", borderBottom: "1px solid var(--ink-faint)", verticalAlign: "top", overflowWrap: "anywhere" }}>
                        {inlineMd(cell, cites, onOpenCitation)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        i = next;
        continue;
      }
    }

    if (/^\s*[-*•]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/.test(lines[i]) : /^\s*[-*•]\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim());
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      const fields = items.map(displayFields);
      if (!ordered && fields.every(Boolean)) {
        out.push(<AnswerResults key={key++} items={items} rows={fields} cites={cites} onOpenCitation={onOpenCitation} />);
        continue;
      }
      out.push(
        <ListTag key={key++} className={fields.every(Boolean) && !ordered ? "agent-answer-records" : undefined} style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
          {items.map((item, ii) => (
            <li key={ii} style={{ marginBottom: 3 }}>{fields[ii]
              ? <AnswerFields fields={fields[ii]} cites={cites} onOpenCitation={onOpenCitation} />
              : inlineMd(item, cites, onOpenCitation)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // Paragraph: gather consecutive plain lines.
    const buf = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !/^\s*\|/.test(lines[i])
      && !/^\s*[-*•]\s+/.test(lines[i])
      && !/^\s*\d+[.)]\s+/.test(lines[i])
      && !/^#{1,3}\s+/.test(lines[i].trim())
      && !/^---+$/.test(lines[i].trim())
      && !/^\[(?:Evidence gate|Automated check|Loop nudge):/i.test(lines[i].trim())
    ) {
      buf.push(lines[i].trim());
      i += 1;
    }
    pushPara(buf);
  }

  return out;
}

export default function AgentAnswer({ text, citations, onOpenCitation }) {
  // Marks the run actually cited, indexed once per render rather than per
  // paragraph. An answer mentioning VAV-1 becomes a link to the ink VAV-1 was
  // read from — the thing "Sources · N" made you go looking for.
  const cites = useMemo(() => buildCiteIndex(citations), [citations]);
  if (!text) return null;
  return (
    <div
      data-agent-answer="structured"
      style={{ color: "var(--ink)", overflowWrap: "anywhere", fontFamily: "inherit" }}
    >
      {blockNodes(text, cites, onOpenCitation)}
    </div>
  );
}
