/**
 * Gates 1–5 for corpus takeoffs (T-HVAC-01 / T-BAS-01).
 *
 * Gate 3 uses vector PDF text under the bbox (findText / span join) — not OCR.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function validateBbox(bbox, bounds) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) {
    return "bbox must contain four finite numbers";
  }
  const [x0, y0, x1, y1] = bbox;
  if (!(x1 > x0 && y1 > y0)) return "bbox must be non-degenerate";
  if (bounds) {
    const [bx0, by0, bx1, by1] = bounds;
    if (x0 < bx0 || y0 < by0 || x1 > bx1 || y1 > by1) return "bbox is outside page bounds";
  }
  return null;
}

function norm(s) {
  return String(s || "").toUpperCase().replace(/\s+/g, "");
}

function tagInText(hay, needle) {
  const h = norm(hay);
  const n = norm(needle);
  if (!n) return false;
  return h.includes(n);
}

async function vectorGrounds(session, sheetId, bbox, expectedTag) {
  if (!bbox || !expectedTag) return { ok: false, text: "" };
  // Prefer findText hits that overlap the cite box.
  try {
    const found = session.findText?.(sheetId, String(expectedTag), { limit: 200 });
    for (const hit of found?.hits || []) {
      if (!Array.isArray(hit?.bbox) || hit.bbox.length !== 4) continue;
      if (!tagInText(hit.str, expectedTag)) continue;
      const [ax0, ay0, ax1, ay1] = bbox;
      const [bx0, by0, bx1, by1] = hit.bbox;
      const ix0 = Math.max(ax0, bx0);
      const iy0 = Math.max(ay0, by0);
      const ix1 = Math.min(ax1, bx1);
      const iy1 = Math.min(ay1, by1);
      if (ix1 > ix0 && iy1 > iy0) return { ok: true, text: hit.str };
    }
  } catch {
    // continue to span join
  }
  try {
    const state = session.sheet?.(sheetId);
    if (state && !state.spans) {
      const { textSpans } = await import("./pdf.ts");
      state.spans = textSpans(state.page);
    }
    const [cx0, cy0, cx1, cy1] = bbox;
    const parts = (state?.spans || [])
      .filter((span) => {
        const x0 = span.x0 ?? span.x;
        const y0 = span.y0 ?? span.y;
        const x1 = span.x1 ?? (x0 + (span.w || 0));
        const y1 = span.y1 ?? (y0 + (span.h || 0));
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        return mx >= cx0 - 2 && mx <= cx1 + 2 && my >= cy0 - 2 && my <= cy1 + 2;
      })
      .sort((a, b) => (a.y0 ?? a.y) - (b.y0 ?? b.y) || (a.x0 ?? a.x) - (b.x0 ?? b.x))
      .map((span) => span.str)
      .filter(Boolean);
    const joined = parts.join("");
    if (parts.length && tagInText(joined, expectedTag)) {
      return { ok: true, text: parts.join(" ") };
    }
  } catch {
    // fall through
  }
  return { ok: false, text: "" };
}

function hvacItems(takeoff) {
  const out = [];
  for (const [name, cat] of Object.entries(takeoff.categories || {})) {
    for (const item of cat.items || []) out.push({ category: name, ...item });
  }
  return out;
}

function basItems(takeoff) {
  const out = [];
  for (const list of takeoff.categories?.points_lists?.lists || []) {
    for (const item of list.items || []) {
      out.push({ category: list.title, list_title: list.title, ...item });
    }
  }
  return out;
}

function gate1Quantity(truth, result) {
  const failures = [];
  const checks = [];
  if (truth.kind === "hvac_equipment") {
    for (const [name, tCat] of Object.entries(truth.categories || {})) {
      const rCat = result.categories?.[name];
      if (!rCat) {
        failures.push({ class: "COVERAGE", gate: 1, detail: `missing category ${name}` });
        continue;
      }
      if (rCat.count !== tCat.count) {
        failures.push({ class: "VALUE", gate: 1, detail: `${name} count ${rCat.count} != truth ${tCat.count}` });
      } else {
        checks.push({ gate: 1, assertion: "QUANTITY", category: name, ok: true, count: rCat.count });
      }
      const tTags = new Set((tCat.items || []).map((i) => norm(i.tag)));
      const rTags = new Set((rCat.items || []).map((i) => norm(i.tag)));
      for (const tag of tTags) {
        if (!rTags.has(tag)) failures.push({ class: "COVERAGE", gate: 1, detail: `${name} missing tag ${tag}` });
      }
      for (const tag of rTags) {
        if (!tTags.has(tag)) failures.push({ class: "DUPLICATE", gate: 1, detail: `${name} unexpected tag ${tag}` });
      }
    }
  } else if (truth.kind === "bas_points") {
    const t = truth.categories.points_lists.totals;
    const r = result.categories.points_lists.totals;
    for (const k of ["rows", "AI", "AO", "BI", "BO"]) {
      if (r[k] !== t[k]) {
        failures.push({ class: "VALUE", gate: 1, detail: `totals.${k} ${r[k]} != truth ${t[k]}` });
      } else {
        checks.push({ gate: 1, assertion: "QUANTITY", field: k, ok: true, value: r[k] });
      }
    }
    const tLists = truth.categories.points_lists.lists;
    const rLists = result.categories.points_lists.lists;
    if (tLists.length !== rLists.length) {
      failures.push({ class: "COVERAGE", gate: 1, detail: `list count ${rLists.length} != truth ${tLists.length}` });
    }
    for (const tl of tLists) {
      const rl = rLists.find((l) => norm(l.title) === norm(tl.title) && l.sheet_id === tl.sheet_id);
      if (!rl) {
        failures.push({ class: "COVERAGE", gate: 1, detail: `missing list ${tl.title}` });
        continue;
      }
      if (rl.rows !== tl.rows) {
        failures.push({ class: "VALUE", gate: 1, detail: `${tl.title} rows ${rl.rows} != ${tl.rows}` });
      }
    }
  }
  return { ok: failures.length === 0, checks, failures };
}

function gate2CiteForm(result, session) {
  const failures = [];
  const checks = [];
  const items = result.kind === "hvac_equipment" ? hvacItems(result) : basItems(result);
  const sheets = new Map((session.sheetList?.() || []).map((s) => [s.key, s]));
  for (const item of items) {
    if (!item.sheet_id) {
      failures.push({ class: "CITE_FORM", gate: 2, detail: `${item.tag} missing sheet_id` });
      continue;
    }
    const sheet = sheets.get(item.sheet_id);
    if (!sheet) {
      failures.push({ class: "CITE_FORM", gate: 2, detail: `${item.tag} unknown sheet ${item.sheet_id}` });
      continue;
    }
    const err = validateBbox(item.bbox_px, sheet.widthPx != null
      ? [0, 0, sheet.widthPx, sheet.heightPx]
      : null);
    if (err) {
      failures.push({ class: "CITE_FORM", gate: 2, detail: `${item.tag} ${err}` });
    } else {
      checks.push({ gate: 2, assertion: "CITE_RESOLVABLE", tag: item.tag, ok: true });
    }
  }
  return { ok: failures.length === 0, checks, failures };
}

async function gate3VectorGround(result, session, { samplePerCategory = null } = {}) {
  const failures = [];
  const checks = [];
  const byCat = new Map();
  const items = result.kind === "hvac_equipment" ? hvacItems(result) : basItems(result);
  for (const item of items) {
    const key = item.category;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(item);
  }
  for (const [cat, catItems] of byCat) {
    let sample = catItems;
    if (samplePerCategory && catItems.length > samplePerCategory) {
      const step = catItems.length / samplePerCategory;
      sample = [];
      for (let i = 0; i < samplePerCategory; i++) {
        sample.push(catItems[Math.min(catItems.length - 1, Math.floor(i * step))]);
      }
    }
    for (const item of sample) {
      const g = await vectorGrounds(session, item.sheet_id, item.bbox_px, item.tag);
      if (!g.ok) {
        failures.push({
          class: "CITE_GROUND",
          gate: 3,
          detail: `${cat}/${item.tag} vector text under bbox does not contain tag (got ${JSON.stringify(g.text)})`,
        });
      } else {
        checks.push({ gate: 3, assertion: "CITE_GROUNDED_VECTOR", tag: item.tag, ok: true, text: g.text });
      }
    }
  }
  return { ok: failures.length === 0, checks, failures };
}

function gate4Completeness(truth, result) {
  const failures = [];
  const checks = [];
  const tPages = truth.page_accounting?.pages || [];
  const rPages = result.page_accounting?.pages || [];
  if (tPages.length !== rPages.length) {
    failures.push({
      class: "COVERAGE",
      gate: 4,
      detail: `page count ${rPages.length} != truth ${tPages.length}`,
    });
  }
  if ((result.page_accounting?.pages_accounted_for || 0) !== (truth.page_accounting?.sheet_count || truth.sheet_count)) {
    failures.push({
      class: "COVERAGE",
      gate: 4,
      detail: `pages_accounted_for ${result.page_accounting?.pages_accounted_for} != sheet_count ${truth.sheet_count}`,
    });
  }
  const tMap = new Map(tPages.map((p) => [p.sheet_id, p]));
  for (const rp of rPages) {
    const tp = tMap.get(rp.sheet_id);
    if (!tp) {
      failures.push({ class: "COVERAGE", gate: 4, detail: `unexpected page ${rp.sheet_id}` });
      continue;
    }
    if (rp.status !== tp.status) {
      failures.push({
        class: "VALUE",
        gate: 4,
        detail: `${rp.sheet_id} status ${rp.status} != truth ${tp.status}`,
      });
    }
  }
  // No duplicate tags within categories
  if (result.kind === "hvac_equipment") {
    for (const [name, cat] of Object.entries(result.categories || {})) {
      const seen = new Set();
      for (const item of cat.items || []) {
        const k = norm(item.tag);
        if (seen.has(k)) failures.push({ class: "DUPLICATE", gate: 4, detail: `${name} duplicate ${item.tag}` });
        seen.add(k);
      }
    }
  } else {
    for (const list of result.categories?.points_lists?.lists || []) {
      const seen = new Set();
      for (const item of list.items || []) {
        const k = `${norm(list.title)}|${norm(item.tag)}`;
        if (seen.has(k)) failures.push({ class: "DUPLICATE", gate: 4, detail: `${list.title} duplicate ${item.tag}` });
        seen.add(k);
      }
    }
  }
  if (!failures.length) {
    checks.push({
      gate: 4,
      assertion: "COMPLETENESS",
      ok: true,
      pages: rPages.length,
      empty: result.page_accounting?.empty_pages,
    });
  }
  return { ok: failures.length === 0, checks, failures };
}

/**
 * Gate 5 — live adversarial interrogation.
 * Asks the model to answer probes; grader checks answers against truth (not the model self-grade).
 */
export async function gate5Interrogation(truth, result, { apiKey, model } = {}) {
  const failures = [];
  const checks = [];
  const turns = [];
  const probes = buildProbes(truth, result);
  const key = apiKey || process.env.CEREBRAS_API_KEY?.trim();
  const resolvedModel = model || process.env.CEREBRAS_MODEL || "gpt-oss-120b";
  if (!key) {
    return {
      ok: false,
      checks,
      failures: [{ class: "INTERROGATION", gate: 5, detail: "CEREBRAS_API_KEY required for live Gate 5" }],
      transcript: { turns, probes, verdict: { ok: false } },
    };
  }

  const system = `You are under adversarial takeoff interrogation. Answer ONLY from the provided takeoff JSON. Be precise with numbers and tags. If something is excluded, say so. Reply as JSON: {"answers":[{"id":"...","answer":"...","number":null}]}`;
  const user = JSON.stringify({
    takeoff_id: truth.takeoff_id,
    probes: probes.map((p) => ({ id: p.id, question: p.question })),
    takeoff: summarizeForProbe(result),
    exclusions: result.exclusions,
  });

  turns.push({ turn: 1, role: "interrogator", text: probes.map((p) => p.question).join("\n") });

  let raw;
  try {
    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolvedModel,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        checks,
        failures: [{ class: "INTERROGATION", gate: 5, detail: `Cerebras HTTP ${res.status}: ${body.slice(0, 200)}` }],
        transcript: { turns, probes, verdict: { ok: false } },
      };
    }
    const json = await res.json();
    raw = json.choices?.[0]?.message?.content || "";
  } catch (err) {
    return {
      ok: false,
      checks,
      failures: [{ class: "INTERROGATION", gate: 5, detail: String(err?.message || err) }],
      transcript: { turns, probes, verdict: { ok: false } },
    };
  }

  turns.push({ turn: 2, role: "takeoff", text: raw });
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    failures.push({ class: "INTERROGATION", gate: 5, detail: "model reply was not JSON" });
    return { ok: false, checks, failures, transcript: { turns, probes, verdict: { ok: false } } };
  }

  const answers = new Map((parsed.answers || []).map((a) => [a.id, a]));
  for (const probe of probes) {
    const a = answers.get(probe.id);
    if (!a) {
      failures.push({ class: "INTERROGATION", gate: 5, detail: `missing answer for ${probe.id}` });
      continue;
    }
    const ok = gradeProbe(probe, a, truth, result);
    if (!ok) {
      failures.push({
        class: "INTERROGATION",
        gate: 5,
        detail: `${probe.id} failed: expected ${JSON.stringify(probe.expect)}, got ${JSON.stringify(a)}`,
      });
    } else {
      checks.push({ gate: 5, assertion: "INTERROGATION", id: probe.id, ok: true });
    }
  }

  return {
    ok: failures.length === 0,
    checks,
    failures,
    transcript: {
      turns,
      probes,
      model_answers: parsed.answers || [],
      verdict: { ok: failures.length === 0, model: resolvedModel },
    },
  };
}

function summarizeForProbe(result) {
  if (result.kind === "hvac_equipment") {
    return {
      kind: result.kind,
      categories: Object.fromEntries(Object.entries(result.categories).map(([k, v]) => [k, {
        count: v.count,
        building: v.building,
        sample_tags: (v.items || []).slice(0, 8).map((i) => i.tag),
      }])),
      empty_pages: result.page_accounting?.empty_pages,
      sheet_count: result.sheet_count,
      exclusions: result.exclusions,
    };
  }
  return {
    kind: result.kind,
    lists: (result.categories?.points_lists?.lists || []).map((l) => ({
      title: l.title,
      sheet_id: l.sheet_id,
      rows: l.rows,
      AI: l.AI,
      AO: l.AO,
      BI: l.BI,
      BO: l.BO,
    })),
    totals: result.categories?.points_lists?.totals,
    empty_pages: result.page_accounting?.empty_pages,
    sheet_count: result.sheet_count,
    exclusions: result.exclusions,
  };
}

function buildProbes(truth, result) {
  const probes = [];
  if (truth.kind === "hvac_equipment") {
    // Spot-check the three largest present families (set-agnostic).
    const ranked = Object.entries(truth.categories || {})
      .map(([name, cat]) => ({ name, count: cat.count }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
    for (const fam of ranked.slice(0, 3)) {
      probes.push({
        id: `qty-${fam.name.toLowerCase()}`,
        question: `How many unique scheduled tags are in category ${fam.name}?`,
        expect: { number: fam.count },
      });
    }
    const exclusionHint = (truth.exclusions || result.exclusions || [])[0]
      || "items outside this takeoff's declared exclusions";
    probes.push({
      id: "neg-exclusion",
      question: `Did you count the following as in-scope HVAC equipment units: "${exclusionHint}"? Answer yes or no.`,
      expect: { answer_includes: ["no"] },
    });
    // False-premise: invent a category name that is not present on this set.
    const present = new Set(Object.keys(truth.categories || {}));
    const fake = ["RTU", "CRAC_EXTRA", "MAU_PHANTOM"].find((n) => !present.has(n)) || "PHANTOM_FAMILY";
    probes.push({
      id: "false-absent-family",
      question: `How many unique scheduled tags are in category ${fake}?`,
      expect: { number: 0 },
    });
    probes.push({
      id: "empty-pages",
      question: "How many sheets are empty for HVAC equipment schedules on this set?",
      expect: { number: truth.page_accounting.empty_pages },
    });
  } else {
    const t = truth.categories.points_lists.totals;
    const lists = truth.categories.points_lists.lists || [];
    probes.push({
      id: "qty-rows",
      question: "What is the overall extractable points/DDC row total?",
      expect: { number: t.rows },
    });
    probes.push({
      id: "qty-ai",
      question: "What is the overall AI count across extractable lists?",
      expect: { number: t.AI },
    });
    probes.push({
      id: "qty-bo",
      question: "What is the overall BO count across extractable lists?",
      expect: { number: t.BO },
    });
    probes.push({
      id: "neg-hvac",
      question: "Did you include HVAC equipment schedule MARKs in the BAS points takeoff? Answer yes or no.",
      expect: { answer_includes: ["no"] },
    });
    // Spot-check the largest extractable list present on this set.
    const largest = [...lists].sort((a, b) => b.rows - a.rows)[0];
    if (largest) {
      probes.push({
        id: "qty-largest-list",
        question: `How many extractable rows are on list "${largest.title}"?`,
        expect: { number: largest.rows },
      });
    }
    probes.push({
      id: "empty-pages",
      question: "How many sheets are empty for BAS points lists on this set?",
      expect: { number: truth.page_accounting.empty_pages },
    });
  }
  return probes;
}

function gradeProbe(probe, answer, truth, result) {
  if (probe.expect.number != null) {
    const n = typeof answer.number === "number" ? answer.number : Number(String(answer.answer).match(/-?\d+/)?.[0]);
    return Number.isFinite(n) && n === probe.expect.number;
  }
  if (probe.expect.answer_includes) {
    const text = String(answer.answer || "").toLowerCase();
    return probe.expect.answer_includes.every((s) => text.includes(String(s).toLowerCase()));
  }
  return false;
}

export async function verifyTakeoffGates(truth, result, session, opts = {}) {
  const g1 = gate1Quantity(truth, result);
  const g2 = gate2CiteForm(result, session);
  const g3 = await gate3VectorGround(result, session, {
    samplePerCategory: opts.groundSamplePerCategory ?? 3,
  });
  const g4 = gate4Completeness(truth, result);
  let g5 = { ok: true, checks: [], failures: [], transcript: null };
  if (!opts.skipInterrogation) {
    g5 = await gate5Interrogation(truth, result, opts);
  } else {
    g5 = {
      ok: true,
      checks: [{ gate: 5, assertion: "INTERROGATION", ok: true, skipped: true }],
      failures: [],
      transcript: { skipped: true },
    };
  }

  const failures = [...g1.failures, ...g2.failures, ...g3.failures, ...g4.failures, ...g5.failures];
  return {
    ok: failures.length === 0,
    gates: {
      1: { name: "Quantity", ...g1 },
      2: { name: "Cite resolvability", ...g2 },
      3: { name: "Cite groundedness (vector)", ...g3 },
      4: { name: "Completeness", ...g4 },
      5: { name: "Interrogation", ...g5 },
    },
    failures,
    interrogation: g5.transcript,
  };
}

export function loadTruth(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}
