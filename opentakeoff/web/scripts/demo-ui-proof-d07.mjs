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
const demo = resolve(corpus, "demos/D07-vav-plan-link-fan-refuse");
const pdf = resolve(corpus, "raw/bldg5406-hvac-demo-mechanical.pdf");
const prompt = readFileSync(resolve(demo, "prompt.txt"), "utf8").trim();
const truth = JSON.parse(readFileSync(resolve(demo, "truth.json"), "utf8"));
const followUp = truth.follow_up?.prompt
  || "Can EF-3 be located on a plan sheet with sweep_schedule_row? What CFM does its FAN SCHEDULE row list?";

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const mcpServer = buildServer();
await mcpServer.connect(serverTransport);
const mcpClient = new Client({ name: "opentakeoff-ui-proof-d07", version: "1.0.0" });
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
  const retryable = (status) => status === 429 || status === 500 || status === 502 || status === 503;
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
await new Promise((resolveListen) => proxy.listen(8790, "127.0.0.1", resolveListen));

const browser = await chromium.launch({
  headless: !headed,
  executablePath: process.env.CHROME_EXECUTABLE_PATH || "/usr/local/bin/google-chrome",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: {
    dir: "/tmp/opentakeoff-ui-videos-d07",
    size: { width: 1920, height: 1080 },
  },
});
await context.addInitScript(() => {
  localStorage.setItem("opentakeoff_ai_endpoint", "http://127.0.0.1:8790");
  localStorage.setItem("opentakeoff_ai_model", "gpt-oss-120b");
  localStorage.setItem("opentakeoff_ai_provider", "openai");
  localStorage.setItem("opentakeoff_mcp_endpoint", "http://127.0.0.1:8790/tool");
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
  await page.getByText("Open your plans").waitFor({ state: "hidden", timeout: 180_000 });
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 180_000 });
  await page.getByText("Rendering sheet…").waitFor({ state: "hidden", timeout: 180_000 });
  await page.screenshot({ path: "/opt/cursor/artifacts/d07_ui_loaded.png" });

  await page.locator('button[title^="Agent —"]').click();
  const goal = page.locator('textarea[name="agent-goal"]');
  await goal.fill(prompt);
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const stop = page.getByRole("button", { name: /Stop/ });
  await stop.waitFor({ state: "visible", timeout: 10_000 });
  await stop.waitFor({ state: "hidden", timeout: 600_000 });
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "/opt/cursor/artifacts/d07_ui_primary_answer.png" });

  const panelRoot = page.locator('textarea[name="agent-goal"]').locator("xpath=ancestor::div[contains(@style,\"width: 380\")]").first();
  const panelText = await panelRoot.innerText();
  console.log(`UI_AGENT_PRIMARY\n${panelText.slice(0, 4500)}`);

  if (!/\bAnswer\b/i.test(panelText)) {
    throw new Error("D07 UI panel missing answer-first thread (no Answer section).");
  }
  const answerBodies = [...panelText.matchAll(/(?:^|\n)\s*Answer\b\s*\n([\s\S]*?)(?=\n\s*(?:Answer|Sources|Technical steps|Goal:|Ask a follow-up|You)\b|$)/gi)]
    .map((m) => m[1].trim())
    .filter((body) => body.length >= 40 && !/^\[Evidence gate:/i.test(body));
  const primaryAnswer = answerBodies[0] || "";
  if (primaryAnswer.length < 80) {
    throw new Error("D07 UI Answer section is empty or too short.");
  }
  const answerNorm = normalize(primaryAnswer);
  const has = (...needles) => needles.every((n) => answerNorm.includes(normalize(n)));
  const near = (labels, value) => {
    const lab = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const v = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:${lab})[^\\n]{0,160}?\\b${v}\\b|\\b${v}\\b[^\\n]{0,80}(?:${lab})`, "i").test(answerNorm);
  };

  if (!has("VAV-1") || !has("VAV-5") || !has("VAV-9")) {
    throw new Error("D07 UI Answer missing required VAV tags.");
  }
  if (!has("EF-1") || !has("EF-2") || !has("EF-5")) {
    throw new Error("D07 UI Answer missing required EF tags.");
  }
  if (!/(?:VAV|AIR TERMINAL|SCHEDULE|BOXES?)[^\n]{0,80}\b9\b|\b9\b[^\n]{0,40}(?:VAV|AIR TERMINAL|BOX)/i.test(answerNorm)) {
    throw new Error("D07 UI Answer missing VAV schedule count 9.");
  }
  if (!near(["CFM"], 2170) && !/\b2170\b/.test(answerNorm)) {
    throw new Error("D07 UI Answer missing VAV-1 CFM 2170.");
  }
  // EF-2 must keep schedule CFM even when plan sweep refuses.
  if (!/\b400\b/.test(answerNorm)) {
    throw new Error("D07 UI Answer missing EF-2 CFM 400.");
  }
  if (!/\bREFUS/.test(answerNorm) && !/NOT (?:DRAWN|FOUND|LOCATED)|NO PLAN/.test(answerNorm)) {
    throw new Error("D07 UI Answer missing honest EF-2 plan refusal.");
  }
  if (!/TRANE/i.test(answerNorm)) {
    throw new Error("D07 UI Answer missing TRANE manufacturer.");
  }

  const sourcesHeader = page.getByRole("button", { name: /Sources · \d+ · click to open/i });
  await sourcesHeader.waitFor({ state: "visible", timeout: 10_000 });
  await sourcesHeader.click();
  await page.waitForTimeout(500);
  const detailToggles = panelRoot.getByRole("button", { name: /Details ·/i });
  const viewButtons = panelRoot.getByRole("button", { name: /^View$/i });
  const cardCount = await viewButtons.count();
  console.log(`UI_SOURCE_CARDS count=${cardCount}`);
  if (cardCount < 1) throw new Error("D07 UI missing clickable source cards.");
  if (await detailToggles.count()) {
    await detailToggles.first().click();
    await page.waitForTimeout(800);
  }
  const sourcesBlock = await panelRoot.innerText();
  if (!/Schedule|Tag \/ MARK|Column|Value|BBox|VAV-|CFM|EF-/i.test(sourcesBlock)) {
    throw new Error("D07 source card dropdown missing structured detail fields.");
  }
  await viewButtons.first().click();
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: "/opt/cursor/artifacts/d07_ui_source_card_open.png" });

  const primaryAnswerHeaders = panelRoot.locator('[data-agent-role="assistant"]');
  if (await primaryAnswerHeaders.count()) {
    await primaryAnswerHeaders.first().scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: "/opt/cursor/artifacts/d07_ui_primary_answer.png" });

  await goal.fill(followUp);
  await page.waitForTimeout(1_000);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await stop.waitFor({ state: "visible", timeout: 10_000 });
  await stop.waitFor({ state: "hidden", timeout: 300_000 });
  await page.waitForTimeout(2_000);
  const followAnswerNodes = panelRoot.locator('[data-agent-role="assistant"]');
  const followAnswerCount = await followAnswerNodes.count();
  if (followAnswerCount > 0) {
    await followAnswerNodes.nth(followAnswerCount - 1).scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: "/opt/cursor/artifacts/d07_ui_followup_answer.png" });
  const afterFollow = await panelRoot.innerText();
  console.log(`UI_AGENT_FOLLOWUP\n${afterFollow.slice(-2500)}`);
  const followBodies = [...afterFollow.matchAll(/(?:^|\n)\s*Answer\b\s*\n([\s\S]*?)(?=\n\s*(?:Answer|Sources|Technical steps|Goal:|Ask a follow-up)\b|$)/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  const followAnswer = [...followBodies].reverse().find((body) =>
    /\bEF-3\b/i.test(body) && (/\b300\b/.test(body) || /REFUS|NOT (?:DRAWN|FOUND|LOCATED)|NO PLAN/i.test(body)))
    || followBodies[followBodies.length - 1]
    || "";
  console.log(`UI_FOLLOWUP_ANSWER\n${followAnswer.slice(0, 1200)}`);
  if (followAnswer.length < 20) {
    throw new Error("D07 follow-up missing Answer thread entry.");
  }
  const followNorm = normalize(followAnswer);
  if (!/\bREFUS/.test(followNorm) && !/NOT (?:DRAWN|FOUND|LOCATED)|NO PLAN/.test(followNorm)) {
    throw new Error("D07 follow-up missing EF-3 plan refusal.");
  }
  if (!/\b300\b/.test(followNorm)) {
    throw new Error("D07 follow-up missing EF-3 CFM 300.");
  }

  await page.waitForTimeout(4_000);
  succeeded = true;
  console.log("D07_UI_PROOF_OK");
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
    const dest = `/opt/cursor/artifacts/d07_ui_prompt_answer_cards_followup_${stamp}.webm`;
    if (succeeded) {
      copyFileSync(path, dest);
      console.log(`D07_UI_VIDEO ${dest}`);
    } else {
      console.log(`D07_UI_VIDEO_DISCARDED ${path}`);
    }
  }
}

if (!succeeded) process.exit(1);
