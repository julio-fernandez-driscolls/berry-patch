import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/reviewer.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { extractJsonObject, reviewPullRequest } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

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

async function review(guidelines) {
  const pull = { title: 'Add endpoint', body: null, head: { sha: 'abc', ref: 'feature' }, base: { ref: 'main' },
    user: { login: 'dev' }, additions: 1, deletions: 0, changed_files: 1 };
  const files = [{ filename: 'api.ts', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1 +1,2 @@\n line\n+added' }];
  let request;
  const run = async (r) => {
    request = r;
    return { text: '{"summary":"ok","verdict":"approve","findings":[]}', usage: { inputTokens: 1, outputTokens: 1 }, model: 'test' };
  };
  const result = await reviewPullRequest('o/r#1', pull, files, { engine: 'copilot', run, extraInstructions: '', guidelines });
  return { request, result };
}

test('puts repository guidelines in the trusted system prompt and records the file used', async () => {
  const { request, result } = await review({ name: 'rules.md', text: 'Never log access tokens.' });
  assert.match(request.system, /<repository_guidelines file="rules.md">\nNever log access tokens.\n<\/repository_guidelines>/);
  assert.ok(request.system.endsWith('Review only the supplied diff. Do not use tools or read other files.'));
  assert.doesNotMatch(request.user, /Never log access tokens/);
  assert.equal(result.guideline, 'rules.md');
});

test('leaves guidelines out when the repository has none', async () => {
  const { request, result } = await review(undefined);
  assert.doesNotMatch(request.system, /repository_guidelines/);
  assert.equal(result.guideline, undefined);
});
