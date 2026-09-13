#!/usr/bin/env node
/**
 * One-terminal local launcher.
 *
 * Vite's production-path endpoints execute the shared BAS Python engine. A
 * plain `vite` launch can otherwise look healthy until an Agent run reaches
 * that boundary, then lose the retained BAS workflow because Pydantic v2 is
 * unavailable. Validate (or provision) the ignored repo-local runtime before
 * opening the browser server so local failure is immediate and actionable.
 */
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "..");
const basPackage = resolve(repoRoot, "bas_engine");
const venvRoot = resolve(process.env.OPENTAKEOFF_BAS_VENV || resolve(repoRoot, ".venv-bas"));
const localPython = process.platform === "win32"
  ? resolve(venvRoot, "Scripts", "python.exe")
  : resolve(venvRoot, "bin", "python");
const viteCli = resolve(webRoot, "node_modules", "vite", "bin", "vite.js");

function checkPython(command, requireBas = false) {
  if (!command) return false;
  const program = [
    "import sys",
    "assert sys.version_info >= (3, 11)",
    ...(requireBas
      ? ["import pydantic", "assert int(pydantic.__version__.split('.')[0]) == 2", "import bas_engine"]
      : []),
  ].join("; ");
  // Running outside repoRoot proves bas_engine is installed into the selected
  // interpreter rather than merely importable from Python's current directory.
  const result = spawnSync(command, ["-c", program], { cwd: webRoot, stdio: "ignore", shell: false });
  return result.status === 0;
}

function fail(message) {
  console.error(`\n[opentakeoff] ${message}\n`);
  process.exit(1);
}

function ensureBasPython() {
  const explicit = process.env.OPENTAKEOFF_BAS_PYTHON?.trim();
  if (explicit) {
    if (!checkPython(explicit, true)) {
      fail("OPENTAKEOFF_BAS_PYTHON does not provide Python 3.11+, Pydantic v2, and the OpenTakeoff BAS package.");
    }
    return explicit;
  }
  if (existsSync(localPython) && checkPython(localPython, true)) return localPython;

  const systemPython = [process.env.PYTHON?.trim(), "python3", "python"]
    .find((candidate) => checkPython(candidate, false));
  if (!systemPython) {
    fail("BAS takeoffs require Python 3.11 or newer. Install Python, then run npm run dev again.");
  }

  if (!existsSync(localPython)) {
    console.info(`[opentakeoff] Creating BAS runtime at ${venvRoot}`);
    const created = spawnSync(systemPython, ["-m", "venv", venvRoot], {
      cwd: repoRoot, stdio: "inherit", shell: false,
    });
    if (created.status !== 0) fail("Could not create the BAS Python environment.");
  }

  console.info("[opentakeoff] Installing the validated BAS engine (first run only)…");
  const installed = spawnSync(localPython, ["-m", "pip", "install", "--disable-pip-version-check", "-e", basPackage], {
    cwd: repoRoot, stdio: "inherit", shell: false,
  });
  if (installed.status !== 0 || !checkPython(localPython, true)) {
    fail("Could not install the BAS runtime. The UI was not started with a silently broken Agent path.");
  }
  return localPython;
}

if (!existsSync(viteCli)) fail("Web dependencies are missing. Run npm install once, then run npm run dev again.");
const basPython = ensureBasPython();
console.info(`[opentakeoff] BAS runtime ready (${basPython})`);

const child = spawn(process.execPath, [viteCli, ...process.argv.slice(2)], {
  cwd: webRoot,
  env: { ...process.env, OPENTAKEOFF_BAS_PYTHON: basPython },
  stdio: "inherit",
  shell: false,
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => fail(`Could not start Vite: ${error.message}`));
child.on("exit", (code) => process.exit(code ?? 1));
