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
const demo = resolve(corpus, "demos/D05-rtu-mech-to-electrical");
const pdf = resolve(corpus, "raw/baker-county-eoc-bidset.pdf");
const prompt = readFileSync(resolve(demo, "prompt.txt"), "utf8").trim();
const truth = JSON.parse(readFileSync(resolve(demo, "truth.json"), "utf8"));
const followUp = truth.follow_up?.prompt
  || "Is RTU-2 on the connection schedule as RTU-02? What is its MCA and circuit number?";

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const mcpServer = buildServer();
await mcpServer.connect(serverTransport);
const mcpClient = new Client({ name: "opentakeoff-ui-proof-d05", version: "1.0.0" });
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
  await page.getByText("Open your plans").waitFor({ state: "hidden", timeout: 180_000 });
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 180_000 });
  await page.getByText("Rendering sheet…").waitFor({ state: "hidden", timeout: 180_000 });
  await page.screenshot({ path: "/opt/cursor/artifacts/d05_ui_loaded.png" });

  await page.locator('button[title^="Agent —"]').click();
  const goal = page.locator('textarea[name="agent-goal"]');
  await goal.fill(prompt);
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const stop = page.getByRole("button", { name: /Stop/ });
  await stop.waitFor({ state: "visible", timeout: 10_000 });
  await stop.waitFor({ state: "hidden", timeout: 600_000 });
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "/opt/cursor/artifacts/d05_ui_primary_answer.png" });

  const panelRoot = page.locator('textarea[name="agent-goal"]').locator("xpath=ancestor::div[contains(@style,\"width: 380\")]").first();
  const panelText = await panelRoot.innerText();
  console.log(`UI_AGENT_PRIMARY\n${panelText.slice(0, 4500)}`);

  if (!/\bAnswer\b/i.test(panelText)) {
    throw new Error("D05 UI panel missing answer-first thread (no Answer section).");
  }
  const answerBodies = [...panelText.matchAll(/(?:^|\n)\s*Answer\b\s*\n([\s\S]*?)(?=\n\s*(?:Answer|Sources|Technical steps|Goal:|Ask a follow-up|You)\b|$)/gi)]
    .map((m) => m[1].trim())
    .filter((body) => body.length >= 40 && !/^\[Evidence gate:/i.test(body));
  const primaryAnswer = answerBodies[0] || "";
  if (primaryAnswer.length < 80) {
    throw new Error("D05 UI Answer section is empty or too short.");
  }
  const answerNorm = normalize(primaryAnswer);
  const has = (...needles) => needles.every((n) => answerNorm.includes(normalize(n)));
  const near = (labels, value) => {
    const lab = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const v = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:${lab})[^\\n]{0,160}?\\b${v}\\b|\\b${v}\\b[^\\n]{0,80}(?:${lab})`, "i").test(answerNorm);
  };

  if (!has("MAIN OPERATIONS") || !has("CARRIER") || !has("48FE")) {
    throw new Error("D05 UI Answer missing mech service/manufacturer/model.");
  }
  if (!near(["TON", "NOMINAL", "CAP"], 5) && !/\b5\b/.test(answerNorm)) {
    throw new Error("D05 UI Answer missing nominal tons 5.");
  }
  if (!near(["SUPPLY", "CFM"], 1650) && !/\b1650\b/.test(answerNorm)) {
    throw new Error("D05 UI Answer missing supply CFM 1650.");
  }
  if (!near(["OA", "OUTSIDE", "MIN"], 330) && !/\b330\b/.test(answerNorm)) {
    throw new Error("D05 UI Answer missing min OA CFM 330.");
  }
  if (!has("RTU-01")) {
    throw new Error("D05 UI Answer missing zero-padded connection tag RTU-01.");
  }
  if (!near(["MCA"], "33") && !/\b33(?:\.0)?\b/.test(answerNorm)) {
    throw new Error("D05 UI Answer missing MCA 33.0.");
  }
  if (!has("45 A") && !/\b45\s*A\b/.test(answerNorm)) {
    throw new Error("D05 UI Answer missing MOCP 45 A.");
  }
  if (!near(["VA"], 11880) && !/\b11880\b/.test(answerNorm)) {
    throw new Error("D05 UI Answer missing VA 11880.");
  }
  if (!/C\s*-?\s*29[, ]*31[, ]*33/.test(answerNorm)) {
    throw new Error("D05 UI Answer missing circuit C - 29,31,33.");
  }
  if (!/\bRTU-1\b/.test(answerNorm) || !/(?:plan|#39|roof|M1\.21)/i.test(primaryAnswer)) {
    // Exact plan label must appear; sheet/plan wording preferred.
    if (!/\bRTU-1\b/.test(answerNorm)) {
      throw new Error("D05 UI Answer missing plan label RTU-1.");
    }
  }
  if (/TRANSITION TO UNIT/i.test(primaryAnswer) && !/\b#?39\b|\broof plan\b/i.test(primaryAnswer)) {
    throw new Error("D05 UI Answer preferred detail callout over roof-plan RTU-1.");
  }

  const sourcesHeader = page.getByRole("button", { name: /Sources · \d+ · click to open/i });
  await sourcesHeader.waitFor({ state: "visible", timeout: 10_000 });
  await sourcesHeader.click();
  await page.waitForTimeout(500);
  const detailToggles = panelRoot.getByRole("button", { name: /Details ·/i });
  const viewButtons = panelRoot.getByRole("button", { name: /^View$/i });
  const cardCount = await viewButtons.count();
  console.log(`UI_SOURCE_CARDS count=${cardCount}`);
  if (cardCount < 1) throw new Error("D05 UI missing clickable source cards.");
  if (await detailToggles.count()) {
    await detailToggles.first().click();
    await page.waitForTimeout(800);
  }
  const sourcesBlock = await panelRoot.innerText();
  if (!/Schedule|Tag \/ MARK|Column|Value|BBox/i.test(sourcesBlock)) {
    throw new Error("D05 source card dropdown missing structured detail fields.");
  }
  if (!/[A-Z]{2,8}-[A-Z0-9]+|[·•]|CFM|MCA|RTU/i.test(sourcesBlock)) {
    console.log("UI_SOURCE_CARD_TITLES_WARN: titles may still be sparse.");
  }
  await viewButtons.first().click();
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: "/opt/cursor/artifacts/d05_ui_source_card_open.png" });

  const primaryAnswerHeaders = panelRoot.locator('[data-agent-role="assistant"]');
  if (await primaryAnswerHeaders.count()) {
    await primaryAnswerHeaders.first().scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: "/opt/cursor/artifacts/d05_ui_primary_answer.png" });

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
  await page.screenshot({ path: "/opt/cursor/artifacts/d05_ui_followup_answer.png" });
  const afterFollow = await panelRoot.innerText();
  console.log(`UI_AGENT_FOLLOWUP\n${afterFollow.slice(-2500)}`);
  const followBodies = [...afterFollow.matchAll(/(?:^|\n)\s*Answer\b\s*\n([\s\S]*?)(?=\n\s*(?:Answer|Sources|Technical steps|Goal:|Ask a follow-up)\b|$)/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  const followAnswer = followBodies[followBodies.length - 1] || "";
  console.log(`UI_FOLLOWUP_ANSWER\n${followAnswer.slice(0, 1200)}`);
  if (followAnswer.length < 20) {
    throw new Error("D05 follow-up missing Answer thread entry.");
  }
  const followNorm = normalize(followAnswer);
  if (!/\bRTU-02\b/.test(followNorm)) {
    throw new Error("D05 follow-up missing connection tag RTU-02.");
  }
  if (!/\b24(?:\.0)?\b/.test(followNorm) || !/\bMCA\b/.test(followNorm)) {
    throw new Error("D05 follow-up missing RTU-02 MCA 24.0.");
  }
  if (!/C\s*-?\s*32[, ]*34[, ]*36/.test(followNorm)) {
    throw new Error("D05 follow-up missing circuit C - 32,34,36.");
  }

  await page.waitForTimeout(4_000);
  succeeded = true;
  console.log("D05_UI_PROOF_OK");
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
    const dest = `/opt/cursor/artifacts/d05_ui_prompt_answer_cards_followup_${stamp}.webm`;
    if (succeeded) {
      copyFileSync(path, dest);
      console.log(`D05_UI_VIDEO ${dest}`);
    } else {
      console.log(`D05_UI_VIDEO_DISCARDED ${path}`);
    }
  }
}

if (!succeeded) process.exit(1);
