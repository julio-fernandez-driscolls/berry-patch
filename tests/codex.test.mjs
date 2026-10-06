import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/codex.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { subscriptionEnvironment, isChatGPTLogin, reviewArguments, parseEvents, runProcess } =
  await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('removes billing and provider overrides while preserving the saved-login location', () => {
  assert.deepEqual(subscriptionEnvironment({
    PATH: 'bin', CODEX_HOME: 'profile', CODEX_API_KEY: 'secret', OPENAI_API_KEY: 'secret',
    ANTHROPIC_API_KEY: 'secret', OPENAI_BASE_URL: 'https://example.com',
    CODEX_ACCESS_TOKEN: 'secret', openai_api_key: 'secret', AZURE_OPENAI_API_KEY: 'secret',
  }), { PATH: 'bin', CODEX_HOME: 'profile' });
});

test('fails closed for API-key, absent, failed, and unknown login statuses', () => {
  for (const stderr of ['Logged in using an API key', 'Not logged in', 'unknown', 'Not Logged in using ChatGPT']) {
    assert.equal(isChatGPTLogin({ code: 0, stdout: '', stderr }), false);
  }
  assert.equal(isChatGPTLogin({ code: 1, stdout: '', stderr: 'Logged in using ChatGPT' }), false);
  assert.equal(isChatGPTLogin({ code: 0, stdout: '', stderr: 'WARNING: test\nLogged in using ChatGPT\n' }), true);
});

test('uses subscription auth and a read-only process without inherited configuration', () => {
  const args = reviewArguments('schema path.json', 'output path.json', '', 'high');
  for (const required of ['--ignore-user-config', '--ephemeral', 'read-only', 'forced_login_method="chatgpt"',
    'model_provider="openai"', 'approval_policy="never"', 'features.shell_tool=false', 'features.apps=false', 'features.plugins=false']) {
    assert.ok(args.includes(required), required);
  }
  assert.equal(args.includes('--model'), false);
  assert.equal(args.at(-1), '-');
  assert.ok(reviewArguments('s','o','selected-model','low').includes('selected-model'));
});

test('accepts only completed reviews and preserves token usage', () => {
  assert.deepEqual(parseEvents('{"type":"turn.started"}\n{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":7}}\n'),
    { inputTokens: 12, outputTokens: 7 });
  assert.throws(() => parseEvents('{"type":"turn.started"}'), /before completing/);
  assert.throws(() => parseEvents('{"type":"turn.failed","error":{"message":"Usage limit reached"}}'), /Usage limit reached/);
  assert.throws(() => parseEvents('{"type":"error","message":"Disconnected"}'), /Disconnected/);
  assert.throws(() => parseEvents('not JSON'));
});

test('passes prompts as stdin without interpreting shell characters', async () => {
  const input = 'Review `code` $(no-command) & "quotes"\nsecond line';
  const result = await runProcess(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { input });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, input);
});

test('preserves process failures', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stderr.write("failure");process.exit(7)']);
  assert.equal(result.code, 7);
  assert.equal(result.stderr, 'failure');
});

test('cancels a running process', async () => {
  const abort = new AbortController();
  const pending = runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: abort.signal });
  abort.abort();
  await assert.rejects(pending, /cancelled/);
});

test('stops stalled processes and handles missing executables', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 100 }), /timed out/);
  await assert.rejects(runProcess('nonexistent-pr-review-agent-executable', []), /ENOENT/);
});
