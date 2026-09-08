// Prove the separately authorized lint cleanup against its pre-cleanup commit.
// Usage (from web): node scripts/verify-lint-cleanup-parity.mjs c1b245a5
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse } = require('espree');
const { RegExpParser } = require('@eslint-community/regexpp');
const { ESLint } = require('eslint');
const regexParser = new RegExpParser();
const base = process.argv[2];
assert.ok(base, 'Pass the pre-cleanup revision');
const files = ['src/lib/agentLoop.js', 'src/lib/agentTakeoff.js',
  'src/lib/takeoffWorkflow.js', 'src/pages/TakeoffCanvas.jsx'];
const unusedImports = new Set(['sweepRatio', 'corroborateFingerprint',
  'classifySweepMatches', 'fragmentedTagOcc', 'deepHyphenChainTagOcc',
  'compoundTagOcc', 'corroborateInlineMotif', 'classifyInlineMotifMatches',
  'compileCorpusTakeoff', 'rowKeyAnswersFor']);
const stats = { base, files: [], regexLiteralsCompared: 0, removedUnusedImports: 0,
  removedUnusedHelpers: 0 };
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => walk(n, visit)); return; }
  visit(node);
  Object.values(node).forEach(value => walk(value, visit));
}
function regexMeaning(node) {
  if (Array.isArray(node)) return node.map(regexMeaning);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node)
    .filter(([key]) => !['start', 'end', 'raw', 'parent', 'references', 'resolved'].includes(key))
    .map(([key, value]) => [key, regexMeaning(value)]));
}
function canonical(node, file) {
  if (Array.isArray(node)) return node.map(n => canonical(n, file));
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'Literal' && node.regex) {
    return { type: 'Literal', regex: regexMeaning(regexParser.parseLiteral(node.raw)) };
  }
  if (node.type === 'TemplateElement') {
    // Raw text is separately compared for every tagged template, where it is
    // observable. Untagged templates use cooked strings, which must match.
    return { type: node.type, tail: node.tail, cooked: node.value.cooked };
  }
  if (file.endsWith('agentTakeoff.js') && node.type === 'Identifier') {
    return { type: node.type, name: ({ _rowCount: 'rowCount', _col: 'col' })[node.name] || node.name };
  }
  // Property shorthand is only spelling; keys, values, defaults and computed
  // flags remain in the comparison. Import sources/order remain unchanged.
  return Object.fromEntries(Object.entries(node)
    .filter(([key]) => !['start', 'end', 'raw', 'loc', 'shorthand'].includes(key))
    .map(([key, value]) => [key, canonical(value, file)]));
}
for (const file of files) {
  const beforeText = execFileSync('git', ['show', `${base}:opentakeoff/web/${file}`], { encoding: 'utf8' });
  const afterText = readFileSync(file, 'utf8');
  const options = { ecmaVersion: 'latest', sourceType: 'module', loc: true, ecmaFeatures: { jsx: true } };
  const before = parse(beforeText, options), after = parse(afterText, options);
  const identifiers = new Map();
  walk(before, node => {
    if (node.type === 'Identifier') identifiers.set(node.name, (identifiers.get(node.name) || 0) + 1);
    if (node.type === 'Literal' && node.regex) stats.regexLiteralsCompared++;
  });
  const taggedRaw = ast => {
    const raw = [];
    walk(ast, node => { if (node.type === 'TaggedTemplateExpression') raw.push(node.quasi.quasis.map(q => q.value.raw)); });
    return raw;
  };
  assert.deepEqual(taggedRaw(after), taggedRaw(before), `${file}: tagged template raw text changed`);
  if (file.endsWith('TakeoffCanvas.jsx')) {
    const [lintBefore] = await new ESLint().lintText(beforeText, { filePath: file });
    for (const node of before.body.filter(n => n.type === 'ImportDeclaration')) {
      const originalCount = node.specifiers.length;
      node.specifiers = node.specifiers.filter(specifier => {
        if (!unusedImports.has(specifier.local.name)) return true;
        // Use scope-aware reference analysis: a property such as
        // session.compileCorpusTakeoff is not a use of the imported binding.
        assert.ok(lintBefore.messages.some(message => message.ruleId === 'no-unused-vars' &&
          message.line === specifier.local.loc.start.line &&
          message.column === specifier.local.loc.start.column + 1), `Import still used: ${specifier.local.name}`);
        stats.removedUnusedImports++;
        return false;
      });
      if (originalCount) assert.ok(node.specifiers.length, 'Do not remove module evaluation or convert an import to a side-effect import');
    }
    walk(before, node => {
      if (node.type === 'CatchClause' && node.param?.type === 'Identifier' &&
          node.param.name === 'e' && node.body.body.length === 0) node.param = null;
    });
  }
  if (file.endsWith('agentLoop.js')) {
    assert.equal(identifiers.get('scanTitle'), 1, 'scanTitle must have no callers');
    walk(before, node => {
      if (node.type !== 'BlockStatement') return;
      node.body = node.body.filter(statement => {
        if (statement.type !== 'VariableDeclaration' || statement.declarations.length !== 1 ||
            statement.declarations[0].id.name !== 'scanTitle') return true;
        assert.equal(statement.declarations[0].init.type, 'ArrowFunctionExpression', 'Only an uncalled function allocation may be removed');
        stats.removedUnusedHelpers++;
        return false;
      });
    });
  }
  assert.deepEqual(canonical(after, file), canonical(before, file), `${file}: runtime structure changed beyond approved lint-only edits`);
  stats.files.push(file);
}
assert.equal(stats.removedUnusedImports, 10);
assert.equal(stats.removedUnusedHelpers, 1);
console.log(JSON.stringify({ ...stats, runtimeStructureEquivalent: true }, null, 2));
