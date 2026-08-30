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
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
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

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.getByText("Open your plans").waitFor({ state: "hidden", timeout: 120_000 });
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
  await page.getByText("Rendering sheet…").waitFor({ state: "hidden", timeout: 120_000 });
  await page.screenshot({ path: "/opt/cursor/artifacts/d01_ui_loaded.png" });

  await page.locator('button[title^="Agent —"]').click();
  const goal = page.locator('textarea[name="agent-goal"]');
  await goal.fill(prompt);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const stop = page.getByRole("button", { name: /Stop/ });
  await stop.waitFor({ state: "visible", timeout: 10_000 });
  await stop.waitFor({ state: "hidden", timeout: 180_000 });
  await page.screenshot({ path: "/opt/cursor/artifacts/d01_ui_agent_result.png" });
  const panel = await page.locator('textarea[name="agent-goal"]').locator("xpath=../../..").innerText();
  console.log(`UI_AGENT_RESULT\n${panel}`);
  const selects = page.locator("select");
  let sheetSelect = null;
  let options = [];
  for (let index = 0; index < await selects.count(); index++) {
    const candidate = selects.nth(index);
    const candidateOptions = await candidate.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => ({ value: node.value, text: node.textContent || "" })));
    if (candidateOptions.some((option) => option.text.includes("MS101"))) {
      sheetSelect = candidate;
      options = candidateOptions;
      break;
    }
  }
  if (!sheetSelect) throw new Error("Could not locate the 75-sheet navigator.");
  for (const [needle, path] of [
    ["MS101", "/opt/cursor/artifacts/d01_ui_plan_highlight.png"],
    ["M-603", "/opt/cursor/artifacts/d01_ui_schedule_highlight.png"],
  ]) {
    const option = options.find((candidate) => candidate.text.includes(needle));
    if (!option) throw new Error(`No sheet selector option contains ${needle}.`);
    await sheetSelect.selectOption(option.value);
    await page.getByText("Rendering sheet…").waitFor({ state: "hidden", timeout: 120_000 });
    await page.waitForTimeout(750);
    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -1200);
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path });
  }
  if (headed) await page.waitForTimeout(10_000);
} catch (error) {
  await page.screenshot({ path: "/opt/cursor/artifacts/d01_ui_failure.png" }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  await new Promise((resolveClose) => proxy.close(resolveClose));
  await mcpClient.close();
  await mcpServer.close();
}
