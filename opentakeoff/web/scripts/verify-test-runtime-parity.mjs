// Verify that a test-typing-only change preserves executable test code.
// Usage: node scripts/verify-test-runtime-parity.mjs <pre-typing git revision>
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const base = process.argv[2];
assert.ok(base, 'Pass the git revision immediately before test typing changes');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const files = git('diff', '--name-only', base, '--', 'test').split('\n').filter(f => f.endsWith('.test.ts'));
assert.ok(files.length, 'No changed test files found');
const containsOptionalChain = node => {
  if (node.questionDotToken) return true;
  return ts.forEachChild(node, containsOptionalChain) || false;
};
function executable(source) {
  const js = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    removeComments: true,
  } }).outputText;
  const ast = ts.createSourceFile('test.js', js, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const normalized = ts.transform(ast, [context => {
    const visit = node => {
      // Type assertions sometimes leave redundant parentheses. Preserve any
      // optional-chain boundaries, where parentheses can change behavior.
      if (ts.isParenthesizedExpression(node) && !containsOptionalChain(node.expression)) {
        return ts.visitNode(node.expression, visit);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return node => ts.visitNode(node, visit);
  }]);
  const text = ts.createPrinter({ removeComments: true }).printFile(normalized.transformed[0]);
  normalized.dispose();
  return text;
}
const results = [];
for (const file of files) {
  const local = file.replace(/^opentakeoff\/web\//, '');
  const before = executable(git('show', `${base}:${file}`));
  const after = executable(readFileSync(local, 'utf8'));
  assert.equal(after, before, `${file}: executable tests changed`);
  results.push({ file, sha256: createHash('sha256').update(after).digest('hex') });
}
console.log(JSON.stringify({ base, unchangedExecutableTestFiles: results.length, results }, null, 2));
