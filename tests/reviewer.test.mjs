import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/reviewer.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { extractJsonObject } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('returns the object when the reply is already clean JSON', () => {
  assert.equal(extractJsonObject('{"verdict":"approve"}'), '{"verdict":"approve"}');
});

test('ignores prose and Markdown fences around the object', () => {
  const reply = 'Sure! Here is the review:\n```json\n{"verdict":"comment"}\n```\nHope that helps.';
  assert.equal(extractJsonObject(reply), '{"verdict":"comment"}');
});

test('keeps nested objects and braces that appear inside strings', () => {
  const object = '{"summary":"use ${a} and }{ here","findings":[{"line":3}]}';
  assert.equal(extractJsonObject(`noise ${object} trailing`), object);
  assert.deepEqual(JSON.parse(extractJsonObject(object)).findings, [{ line: 3 }]);
});

test('ignores an escaped quote that would otherwise end the string early', () => {
  const object = '{"summary":"he said \\"}\\" loudly","verdict":"approve"}';
  assert.equal(JSON.parse(extractJsonObject(object)).verdict, 'approve');
});

test('explains the failure when the model returns no object at all', () => {
  assert.throws(() => extractJsonObject('I cannot review this diff.'), /did not return JSON/);
  assert.throws(() => extractJsonObject('{"unterminated": true'), /did not return JSON/);
});
