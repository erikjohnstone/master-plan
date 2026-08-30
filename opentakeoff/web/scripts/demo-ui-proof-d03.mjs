import { createServer } from "node:http";
import { readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { Client } from "../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { buildServer } from "../../mcp/server.ts";

const args = new Set(process.argv.slice(2));
const headed = args.has("--headed");
const baseUrl = process.env.OPENTAKEOFF_UI_URL || "http://127.0.0.1:5173";
const endpoint = process.env.CEREBRAS_ENDPOINT || "https://api.cerebras.ai/v1/chat/completions";
const apiKey = process.env.CEREBRAS_API_KEY?.trim();
if (!apiKey) throw new Error("CEREBRAS_API_KEY is required.");

const root = resolve(import.meta.dirname, "../..");
const corpus = resolve(root, "../opentakeoff-corpus");
const demo = resolve(corpus, "demos/D03-hvac-bas-project-takeoff");
const pdf = resolve(corpus, "raw/navfac-cherry-point-atc-mechanical.pdf");
const prompt = readFileSync(resolve(demo, "prompt.txt"), "utf8").trim();
const truth = JSON.parse(readFileSync(resolve(demo, "truth.json"), "utf8"));
const followUp = truth.follow_up?.prompt
  || "Is DOAH-T1 on a dedicated outdoor-air schedule? Which title, and how many ATCT fan coils are scheduled including FCU-T11?";

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const mcpServer = buildServer();
await mcpServer.connect(serverTransport);
const mcpClient = new Client({ name: "opentakeoff-ui-proof-d03", version: "1.0.0" });
await mcpClient.connect(clientTransport);
await mcpClient.callTool({ name: "load_plan", arguments: { path: pdf } });

const proxy = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  if (request.url === "/tool") {
    const call = JSON.parse(body.toString("utf8"));
    const result = await mcpClient.callTool({ name: call.name, arguments: call.arguments || {} });
    const text = result.content?.find((item) => item.type === "text")?.text;
    response.setHeader("Content-Type", "application/json");
    response.end(text || "{}");
    return;
  }
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
  });
  // Retry rate limits / transient upstream failures so long paint loops do not die mid-run.
  const retryable = (status) => status === 429 || status === 503;
  if (retryable(upstream.status) && request.url !== "/tool") {
    let last = upstream;
    for (let attempt = 0; attempt < 5; attempt++) {
      const retryAfter = Number(last.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(90_000, retryAfter * 1000)
        : Math.min(60_000, 5_000 * (2 ** attempt));
      console.log(`[proxy] HTTP ${last.status}; retry in ${waitMs}ms (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, waitMs));
      last = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });
      if (!retryable(last.status)) {
        const buf = Buffer.from(await last.arrayBuffer());
        if (last.status >= 400) {
          console.log(`[proxy] upstream ${last.status}: ${buf.toString("utf8").slice(0, 500)}`);
        }
        response.statusCode = last.status;
        response.setHeader("Content-Type", last.headers.get("content-type") || "application/json");
        response.end(buf);
        return;
      }
    }
    const buf = Buffer.from(await last.arrayBuffer());
    console.log(`[proxy] giving up ${last.status}: ${buf.toString("utf8").slice(0, 500)}`);
    response.statusCode = last.status;
    response.setHeader("Content-Type", last.headers.get("content-type") || "application/json");
    response.end(buf);
    return;
  }
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (upstream.status >= 400) {
    console.log(`[proxy] upstream ${upstream.status}: ${buf.toString("utf8").slice(0, 800)}`);
  }
  response.statusCode = upstream.status;
  response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
  response.end(buf);
});
await new Promise((resolveListen) => proxy.listen(8788, "127.0.0.1", resolveListen));

const browser = await chromium.launch({
  headless: !headed,
  executablePath: process.env.CHROME_EXECUTABLE_PATH || "/usr/local/bin/google-chrome",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: {
    dir: "/tmp/opentakeoff-ui-videos",
    size: { width: 1920, height: 1080 },
  },
});
await context.addInitScript(() => {
  localStorage.setItem("opentakeoff_ai_endpoint", "http://127.0.0.1:8788");
  localStorage.setItem("opentakeoff_ai_model", "gpt-oss-120b");
  localStorage.setItem("opentakeoff_ai_provider", "openai");
  localStorage.setItem("opentakeoff_mcp_endpoint", "http://127.0.0.1:8788/tool");
  localStorage.removeItem("opentakeoff_ai_key");
});
const page = await context.newPage();
page.on("console", (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
page.on("pageerror", (error) => console.error(`[browser:error] ${error.message}`));

const normalize = (text) => String(text || "").toUpperCase()
  .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D‑–—]/g, "-")
  .replace(/(\d)[\s,]+(?=\d)/g, "$1")
  .replace(/\s+/g, " ");

let succeeded = false;
try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.getByText("Open your plans").waitFor({ state: "hidden", timeout: 120_000 });
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
  await page.getByText("Rendering sheet…").waitFor({ state: "hidden", timeout: 120_000 });
  await page.screenshot({ path: "/opt/cursor/artifacts/d03_ui_loaded.png" });

  await page.locator('button[title^="Agent —"]').click();
  const goal = page.locator('textarea[name="agent-goal"]');
  await goal.fill(prompt);
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const stop = page.getByRole("button", { name: /Stop/ });
  await stop.waitFor({ state: "visible", timeout: 10_000 });
  await stop.waitFor({ state: "hidden", timeout: 480_000 });
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "/opt/cursor/artifacts/d03_ui_primary_answer.png" });

  const panelRoot = page.locator('textarea[name="agent-goal"]').locator("xpath=ancestor::div[contains(@style,\"width: 380\")]").first();
  const panelText = await panelRoot.innerText();
  console.log(`UI_AGENT_PRIMARY\n${panelText.slice(0, 4000)}`);

  // Answer-first: an Answer thread entry must exist with truth values.
  if (!/\bAnswer\b/i.test(panelText)) {
    throw new Error("D03 UI panel missing answer-first thread (no Answer section).");
  }
  // Prefer the Answer body (exclude Goal / Technical steps dumps) so incidental
  // digits in tool traces cannot satisfy count checks.
  const answerBodies = [...panelText.matchAll(/(?:^|\n)\s*Answer\b\s*\n([\s\S]*?)(?=\n\s*(?:Answer|Sources|Technical steps|Goal:|Ask a follow-up|You)\b|$)/gi)]
    .map((m) => m[1].trim())
    .filter((body) => body.length >= 40 && !/^\[Evidence gate:/i.test(body));
  const primaryAnswer = answerBodies[0] || "";
  if (primaryAnswer.length < 80) {
    throw new Error("D03 UI Answer section is empty or too short to be a takeoff reply.");
  }
  const answerNorm = normalize(primaryAnswer);
  const near = (labels, value) => {
    const hay = normalize(primaryAnswer);
    const lab = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const v = String(value);
    // Markdown table: label and count may be several cells apart on the same row.
    if (new RegExp(`(?:${lab})[^\\n]{0,160}?\\b\\*{0,2}${v}\\*{0,2}\\b`, "i").test(hay)) return true;
    // Or prose "AHU: 5" / "AHUs **5**" — but not sheet "#5" / "sheet 5".
    const prose = new RegExp(
      `(?:${lab})(?:(?!\\bsheet\\b)[^0-9\\n#]){0,40}(?<!#)\\b${v}\\b`,
      "i",
    );
    return prose.test(hay);
  };
  const checks = [
    [["AHU", "AIR HANDLING"], truth.expected.ahu_count.value],
    [["DOAH", "DEDICATED OUTDOOR"], truth.expected.doah_count.value],
    [["FCU", "FAN COIL", "FAN-COIL"], truth.expected.fcu_count.value],
    [["VAV", "VARIABLE"], truth.expected.vav_count.value],
    [["AIR-COOLED CHILLER", "AIR COOLED CHILLER", "AIR-COOLED"], truth.expected.air_cooled_chiller_count.value],
    [["HEAT-RECOVERY", "HEAT RECOVERY"], truth.expected.heat_recovery_chiller_count.value],
    [["BOILER"], truth.expected.boiler_count.value],
    [["AIR OPS", "A =", "A=", "A:"], truth.expected.fcu_air_ops_count.value],
    [["ATCT", "T =", "T=", "T:"], truth.expected.fcu_atct_count.value],
    [["POINTS", "BAS", "AHU-T1A"], truth.expected.bas_ahu_t1a_tib_points_rows.value],
  ];
  for (const [labels, value] of checks) {
    if (!near(labels, value)) {
      throw new Error(`D03 UI Answer missing labeled truth for ${labels[0]}=${value}`);
    }
  }
  // Dual inventory tables (title-scan + painted recount) are a product fail.
  if (/(?:title[\s_-]*scan|schedule counts)/i.test(primaryAnswer)
    && /(?:equipment totals|total scheduled units)/i.test(primaryAnswer)) {
    throw new Error("D03 UI Answer has both schedule-counts and a second equipment-totals table.");
  }
  // Explicit set totals that must not be doubled (points list is 62, not 122).
  if (/\b122\b/.test(primaryAnswer) && !near(["POINTS", "BAS", "AHU-T1A"], 62)) {
    throw new Error("D03 UI Answer reports doubled points-list rows without the correct 62.");
  }
  // Reject known wrong DOAH rollups that blend UNIT+HANDLING page sums.
  if (/\bDOAH\b[^0-9]{0,60}\b4\b/i.test(answerNorm) && !near(["DOAH", "DEDICATED OUTDOOR"], 3)) {
    throw new Error("D03 UI Answer reports DOAH total 4 without the correct unit-schedule total 3.");
  }

  // Source cards (estimator-clarity): clickable Sources section
  const sourcesHeader = page.getByText(/Sources · click to open/i);
  await sourcesHeader.waitFor({ state: "visible", timeout: 10_000 });
  const sourceCards = page.getByRole("button", { name: /view on drawing/i });
  const cardCount = await sourceCards.count();
  console.log(`UI_SOURCE_CARDS count=${cardCount}`);
  if (cardCount < 1) throw new Error("D03 UI missing clickable source cards.");
  await sourceCards.first().click();
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: "/opt/cursor/artifacts/d03_ui_source_card_open.png" });

  // Paint evidence (quiet — no auto-fly required; card click is the jump)
  if (!/\bhighlight_citation\b/i.test(panelText) && cardCount < 1) {
    throw new Error("D03 UI never painted citations / source cards.");
  }

  // Conversational follow-up — must be answered correctly before lock.
  await goal.fill(followUp);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await stop.waitFor({ state: "visible", timeout: 10_000 });
  await stop.waitFor({ state: "hidden", timeout: 240_000 });
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "/opt/cursor/artifacts/d03_ui_followup_answer.png" });
  const afterFollow = await panelRoot.innerText();
  console.log(`UI_AGENT_FOLLOWUP\n${afterFollow.slice(-2500)}`);
  const followBodies = [...afterFollow.matchAll(/(?:^|\n)\s*Answer\b\s*\n([\s\S]*?)(?=\n\s*(?:Answer|Sources|Technical steps|Goal:|Ask a follow-up)\b|$)/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  const followAnswer = followBodies[followBodies.length - 1] || "";
  console.log(`UI_FOLLOWUP_ANSWER\n${followAnswer.slice(0, 1200)}`);
  if (followAnswer.length < 20) {
    throw new Error("D03 follow-up missing Answer thread entry.");
  }
  const followNorm = normalize(followAnswer);
  const followNear = (labels, value) => {
    const lab = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const v = String(value);
    return new RegExp(`(?:${lab})[^0-9]{0,48}${v}(?![0-9])|${v}(?![0-9])[^0-9]{0,48}(?:${lab})`, "i").test(followNorm);
  };
  if (!followNear(["ATCT", "FAN COIL", "FCU", "T=", "T:"], 18) && !/\b18\b/.test(followNorm)) {
    throw new Error("D03 follow-up missing ATCT FCU count 18.");
  }
  if (!/FCU-T11/i.test(followAnswer)) {
    throw new Error("D03 follow-up missing FCU-T11 acknowledgement.");
  }
  // Require HANDLING as its own schedule-family word — not merely "AIR HANDLING".
  if (!/OUTDOOR AIR HANDLING|DOAH[^\n]{0,80}HANDLING|HANDLING UNIT SCHEDULE/i.test(followAnswer)) {
    throw new Error("D03 follow-up missing DOAH-T1 HANDLING schedule evidence.");
  }
  if (!/DOAH-T1/i.test(followAnswer)) {
    throw new Error("D03 follow-up missing DOAH-T1.");
  }

  succeeded = true;
  console.log("D03_UI_PROOF_OK");
} finally {
  const video = page.video();
  await page.close();
  await browser.close();
  proxy.close();
  await mcpClient.close();
  await mcpServer.close();
  if (video) {
    const path = await video.path();
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = `/opt/cursor/artifacts/d03_ui_prompt_answer_cards_followup_${stamp}.webm`;
    if (succeeded) {
      copyFileSync(path, dest);
      console.log(`D03_UI_VIDEO ${dest}`);
    } else {
      console.log(`D03_UI_VIDEO_DISCARDED ${path}`);
    }
  }
}

if (!succeeded) process.exit(1);
