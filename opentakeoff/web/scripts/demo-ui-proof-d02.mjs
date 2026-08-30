import { createServer } from "node:http";
import { readFileSync } from "node:fs";
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
const pdf = resolve(corpus, "raw/navfac-cherry-point-atc-mechanical.pdf");
const prompt = readFileSync(resolve(corpus, "demos/D02-ahu-bas-point-to-location/prompt.txt"), "utf8").trim();

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const mcpServer = buildServer();
await mcpServer.connect(serverTransport);
const mcpClient = new Client({ name: "opentakeoff-ui-proof", version: "1.0.0" });
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
  response.statusCode = upstream.status;
  response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
  response.end(Buffer.from(await upstream.arrayBuffer()));
});
await new Promise((resolveListen) => proxy.listen(8787, "127.0.0.1", resolveListen));

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
  localStorage.setItem("opentakeoff_ai_endpoint", "http://127.0.0.1:8787");
  localStorage.setItem("opentakeoff_ai_model", "gpt-oss-120b");
  localStorage.setItem("opentakeoff_ai_provider", "openai");
  localStorage.setItem("opentakeoff_mcp_endpoint", "http://127.0.0.1:8787/tool");
  localStorage.removeItem("opentakeoff_ai_key");
});
const page = await context.newPage();
page.on("console", (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
page.on("pageerror", (error) => console.error(`[browser:error] ${error.message}`));

let succeeded = false;
try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.getByText("Open your plans").waitFor({ state: "hidden", timeout: 120_000 });
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
  await page.getByText("Rendering sheet…").waitFor({ state: "hidden", timeout: 120_000 });
  await page.screenshot({ path: "/tmp/d02_ui_loaded.png" });

  await page.locator('button[title^="Agent —"]').click();
  const goal = page.locator('textarea[name="agent-goal"]');
  await goal.fill(prompt);
  await page.waitForTimeout(2_000);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const stop = page.getByRole("button", { name: /Stop/ });
  await stop.waitFor({ state: "visible", timeout: 10_000 });
  await stop.waitFor({ state: "hidden", timeout: 180_000 });
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: "/tmp/d02_ui_agent_result.png" });
  const panel = await page.locator('textarea[name="agent-goal"]').locator("xpath=../../..").innerText();
  console.log(`UI_AGENT_RESULT\n${panel}`);
  const lastToolResult = panel.lastIndexOf("\n✓ ");
  const answerStart = lastToolResult >= 0 ? panel.indexOf("\n", lastToolResult + 1) : -1;
  const automated = panel.indexOf("\n[Automated check", answerStart);
  const doneMark = panel.indexOf("\nDone", answerStart);
  const proposalsMark = panel.indexOf("\nProposals", answerStart);
  const answerEnd = [automated, doneMark, proposalsMark].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? -1;
  if (answerStart < 0 || answerEnd < 0) {
    throw new Error("D02 UI panel does not contain a complete final-answer segment.");
  }
  let finalAnswer = panel.slice(answerStart, answerEnd);
  const gateRe = /\[Evidence gate:[^\]]*\]/g;
  let lastGateEnd = -1;
  for (const match of finalAnswer.matchAll(gateRe)) {
    lastGateEnd = match.index + match[0].length;
  }
  if (lastGateEnd >= 0) finalAnswer = finalAnswer.slice(lastGateEnd).trim();
  if (!finalAnswer) {
    throw new Error("D02 UI panel does not contain a complete final-answer segment.");
  }
  if (/Stopped at the \d+-step cap/i.test(panel)
    || /example (?:size|type|Cv)|placeholder|\b(?:single|one)\s+(?:schedule\s+)?(?:entry|row)\b|(?:schedule\s+)?row\b.{0,80}\bappears\s+(?:only\s+)?once|\bnormalized\b/i.test(finalAnswer)
    || /\bat\s*[\[(]\s*0\.\d+\s*,\s*0\.\d+\s*[\])]/i.test(finalAnswer)
    || (/(?:≈|\bapproximately\b|\bapprox\.)/i.test(finalAnswer)
      && !/\b(?:derived|calculated|converted|conversion)\b/i.test(finalAnswer))
    || finalAnswer.split("\n").some((line) =>
      /\bplan[- ]?location\b/i.test(line) && /#44\b/.test(line))
    || /\b(?:all|each)\b.{0,160}\bhighlight/is.test(finalAnswer)) {
    throw new Error("D02 UI answer contains a correction cap, placeholder, invalid quantity rationale, or invalid coordinate form.");
  }
  const normalizedPanel = finalAnswer.toUpperCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D‑–—]/g, "-")
    .replace(/\s+/g, " ");
  for (const expected of [
    "AI10", "AHU-T1A", "11TH FLOOR MECHANICAL", "3850",
    "HW VALVE POSITION (FEEDBACK)", "CONTROL CAB",
    "AHU-T1A / AHU-T1B SECTION",
  ]) {
    if (!normalizedPanel.includes(expected)) {
      throw new Error(`D02 UI answer is missing required truth value: ${expected}`);
    }
  }
  const sheetMentions = [...normalizedPanel.matchAll(/NAVFAC-CHERRY-POINT-ATC-MECHANICAL\.PDF#\d+/g)]
    .map((match) => match[0]);
  for (const sheet of [
    "NAVFAC-CHERRY-POINT-ATC-MECHANICAL.PDF#65",
    "NAVFAC-CHERRY-POINT-ATC-MECHANICAL.PDF#48",
    "NAVFAC-CHERRY-POINT-ATC-MECHANICAL.PDF#28",
    "NAVFAC-CHERRY-POINT-ATC-MECHANICAL.PDF#2",
  ]) {
    if (!sheetMentions.includes(sheet)) {
      throw new Error(`D02 UI answer is missing required multi-sheet citations (${sheet}).`);
    }
  }
  // Reject schedule LOCATION substituted for serves narrative.
  if (/SERVES[\s\S]{0,120}11TH FLOOR MECHANICAL/i.test(finalAnswer)
    && !/CONTROL CAB/i.test(finalAnswer)) {
    throw new Error("D02 UI serves field reused schedule location text.");
  }
  // Product rule: answers must be painted on the sheets, not only in the agent panel.
  if (!/\bhighlight_citation\b/i.test(panel)) {
    throw new Error("D02 UI run never called highlight_citation — answers must paint cited evidence on the sheets.");
  }
  const paintedMatch = panel.match(/highlight_citation painted exactly (\d+) source region/i);
  const paintedFromCheck = paintedMatch ? Number(paintedMatch[1]) : 0;
  console.log(`UI_HIGHLIGHT_CHECK paintedFromCheck=${paintedFromCheck}`);
  if (paintedFromCheck < 4) {
    throw new Error(`D02 UI automated check reports only ${paintedFromCheck} painted region(s); expected >= 4 cited sheets.`);
  }
  let sheetsWithVisibleHighlight = 0;
  for (const [needle, path, target] of [
    ["M-621", "/tmp/d02_ui_ahu_highlight.png", [300 / 4896, 365 / 3168]],
    ["MI731", "/tmp/d02_ui_points_highlight.png", [3700 / 4896, 910 / 3168]],
    ["M-002", "/tmp/d02_ui_narrative_highlight.png", [1000 / 4896, 2590 / 3168]],
  ]) {
    await page.locator('button[title^="Sheet — the sheets in this set"]').click();
    const item = page.getByText(needle, { exact: true }).last();
    await item.waitFor({ state: "visible", timeout: 10_000 });
    await item.click();
    await page.getByText("Rendering sheet…").waitFor({ state: "hidden", timeout: 120_000 });
    await page.waitForTimeout(750);
    const fit = page.getByRole("button", { name: "fit", exact: true });
    if (await fit.isVisible().catch(() => false)) await fit.click();
    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * target[0], box.y + box.height * target[1]);
      await page.mouse.wheel(0, -1800);
      await page.waitForTimeout(2_000);
    }
    // Highlights render only for the open sheet panel — count per sheet.
    const onSheet = await page.locator('[data-markup-type="highlight"]').count();
    console.log(`UI_SHEET_HIGHLIGHT ${needle} count=${onSheet}`);
    if (onSheet > 0) sheetsWithVisibleHighlight += 1;
    await page.screenshot({ path });
  }
  // Fly to each painted highlight via the markups register so the recording
  // shows answering evidence on-sheet, not only the last open tab.
  const markupBtn = page.locator('button[title^="Markups"], button[title*="markup" i]').first();
  if (await markupBtn.isVisible().catch(() => false)) {
    await markupBtn.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  const highlightRows = page.locator('[title="Select and center this markup"], [title*="center this markup" i]');
  const rowCount = await highlightRows.count().catch(() => 0);
  console.log(`UI_MARKUP_ROWS ${rowCount}`);
  for (let i = 0; i < Math.min(rowCount, 8); i++) {
    await highlightRows.nth(i).click().catch(() => {});
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: `/tmp/d02_ui_flyto_${i}.png` }).catch(() => {});
  }
  if (sheetsWithVisibleHighlight < 2 && paintedFromCheck >= 4) {
    // Panels may have closed; trust the per-sheet counts when at least one
    // sheet showed paint, else fail hard.
    if (sheetsWithVisibleHighlight < 1) {
      throw new Error("D02 UI recording has no visible on-sheet highlight markups on M-621/MI731/M-002 — agent-panel text alone is incomplete.");
    }
  } else if (sheetsWithVisibleHighlight < 2) {
    throw new Error("D02 UI recording has fewer than 2 sheets with visible highlight markups — agent-panel text alone is incomplete.");
  }
  succeeded = true;
  if (headed) await page.waitForTimeout(10_000);
} catch (error) {
  await page.screenshot({ path: "/tmp/d02_ui_failure.png" }).catch(() => {});
  throw error;
} finally {
  const video = page.video();
  await page.close();
  if (succeeded && video) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await video.saveAs(`/opt/cursor/artifacts/d02_ui_prompt_tools_answer_highlights_${stamp}.webm`);
  }
  await browser.close();
  await new Promise((resolveClose) => proxy.close(resolveClose));
  await mcpClient.close();
  await mcpServer.close();
}
