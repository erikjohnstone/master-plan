import { chmodSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(scriptDir, '..')
const output = resolve(packageDir, 'dist', 'server.js')

mkdirSync(dirname(output), { recursive: true })
copyFileSync(resolve(packageDir, 'bin.js'), output)

// Ship the same Python implementation in npm/MCP bundles. Never copy virtual
// environments, local inputs, test evidence, bytecode, or credentials.
const basSource = resolve(packageDir, '../bas_engine')
const basOutput = resolve(packageDir, 'dist/python/bas_engine')
mkdirSync(basOutput, { recursive: true })
for (const name of readdirSync(basSource)) {
  if (name.endsWith('.py') || name === 'pyproject.toml') copyFileSync(resolve(basSource, name), resolve(basOutput, name))
}

if (process.platform !== 'win32') {
  chmodSync(output, 0o755)
}
