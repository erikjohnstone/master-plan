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
const prompt = readFileSync(resolve(corpus, "demos/D01-chiller-plan-to-controls/prompt.txt"), "utf8").trim();

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
  await page.screenshot({ path: "/tmp/d01_ui_loaded.png" });

  await page.locator('button[title^="Agent —"]').click();
  const goal = page.locator('textarea[name="agent-goal"]');
  await goal.fill(prompt);
  await page.waitForTimeout(2_000);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const stop = page.getByRole("button", { name: /Stop/ });
  await stop.waitFor({ state: "visible", timeout: 10_000 });
  await stop.waitFor({ state: "hidden", timeout: 180_000 });
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: "/tmp/d01_ui_agent_result.png" });
  const panel = await page.locator('textarea[name="agent-goal"]').locator("xpath=../../..").innerText();
  console.log(`UI_AGENT_RESULT\n${panel}`);
  const lastToolResult = panel.lastIndexOf("\n✓ ");
  const answerStart = lastToolResult >= 0 ? panel.indexOf("\n", lastToolResult + 1) : -1;
  const answerEnd = panel.indexOf("\n[Automated check", answerStart);
  if (answerStart < 0 || answerEnd < 0) {
    throw new Error("D01 UI panel does not contain a complete final-answer segment.");
  }
  const finalAnswer = panel.slice(answerStart, answerEnd);
  if (/Stopped at the \d+-step cap/i.test(panel)
    || /example (?:size|type|Cv)|placeholder|\b(?:single|one)\s+(?:schedule\s+)?(?:entry|row)\b|(?:schedule\s+)?row\b.{0,80}\bappears\s+(?:only\s+)?once|\bnormalized\b/i.test(finalAnswer)
    || (/(?:≈|\bapproximately\b|\bapprox\.)/i.test(finalAnswer)
      && !/\b(?:derived|calculated|converted|conversion)\b/i.test(finalAnswer))
    || finalAnswer.split("\n").some((line) =>
      /\bplan[- ]?location\b/i.test(line) && /#44\b/.test(line))) {
    throw new Error("D01 UI answer contains a correction cap, placeholder, invalid quantity rationale, or invalid coordinate form.");
  }
  const normalizedPanel = finalAnswer.toUpperCase().replace(/[‑–—]/g, "-").replace(/\s+/g, " ");
  for (const expected of [
    "INSTALLED QUANTITY", "56", "55.4", "45", "128.5",
    "CV-CH-A1", "128.0", "4", "2-WAY", "324",
  ]) {
    if (!normalizedPanel.includes(expected)) {
      throw new Error(`D01 UI answer is missing required truth value: ${expected}`);
    }
  }
  if (!normalizedPanel.includes("NAVFAC-CHERRY-POINT-ATC-MECHANICAL.PDF#3")) {
    throw new Error("D01 UI answer is missing the swept plan-sheet citation.");
  }
  for (const [needle, path, target] of [
    ["MS101", "/tmp/d01_ui_plan_highlight.png", [2561.9 / 4896, 2511.1 / 3168]],
    ["M-603", "/tmp/d01_ui_schedule_highlight.png", [496 / 4896, 322 / 3168]],
    ["M-603", "/tmp/d01_ui_valve_highlight.png", [3900 / 4896, 700 / 3168]],
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
    await page.screenshot({ path });
  }
  succeeded = true;
  if (headed) await page.waitForTimeout(10_000);
} catch (error) {
  await page.screenshot({ path: "/tmp/d01_ui_failure.png" }).catch(() => {});
  throw error;
} finally {
  const video = page.video();
  await page.close();
  if (succeeded && video) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await video.saveAs(`/opt/cursor/artifacts/d01_ui_prompt_tools_answer_highlights_${stamp}.webm`);
  }
  await browser.close();
  await new Promise((resolveClose) => proxy.close(resolveClose));
  await mcpClient.close();
  await mcpServer.close();
}
