import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/merge.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { mergeInfo, mergeBlocker } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const pull = (over = {}) => ({ head: { sha: 'abc' }, mergeable: true, mergeable_state: 'clean', ...over });
const repo = (over = {}) => ({ permissions: { push: true }, ...over });

test('only a clean, computed pull request is ready to merge', () => {
  assert.equal(mergeBlocker(pull()), null);
  // Non-required checks failing still merges on GitHub.
  assert.equal(mergeBlocker(pull({ mergeable_state: 'unstable' })), null);
  assert.equal(mergeBlocker(pull({ mergeable_state: 'has_hooks' })), null);
});

test('refuses to merge when GitHub has not finished computing mergeability', () => {
  assert.match(mergeBlocker(pull({ mergeable: null })), /still checking/);
  assert.match(mergeBlocker(pull({ mergeable_state: 'unknown' })), /still checking/);
  assert.match(mergeBlocker(pull({ mergeable: undefined, mergeable_state: undefined })), /still checking/);
});

test('explains each blocking state', () => {
  assert.match(mergeBlocker(pull({ merged: true })), /already merged/);
  assert.match(mergeBlocker(pull({ draft: true })), /still a draft/);
  assert.match(mergeBlocker(pull({ mergeable: false })), /conflicts/);
  assert.match(mergeBlocker(pull({ mergeable_state: 'dirty' })), /conflicts/);
  assert.match(mergeBlocker(pull({ mergeable_state: 'blocked' })), /Branch protection/);
  assert.match(mergeBlocker(pull({ mergeable_state: 'behind' })), /behind its base/);
});

test('a draft is blocked even when GitHub reports it mergeable', () => {
  assert.match(mergeBlocker(pull({ draft: true, mergeable: true, mergeable_state: 'clean' })), /draft/);
});

test('merge permission follows push access only', () => {
  assert.equal(mergeInfo(pull(), repo()).canMerge, true);
  assert.equal(mergeInfo(pull(), repo({ permissions: { push: false } })).canMerge, false);
  assert.equal(mergeInfo(pull(), repo({ permissions: {} })).canMerge, false);
  assert.equal(mergeInfo(pull(), repo({ permissions: undefined })).canMerge, false);
});

test('offers the merge methods the repository allows', () => {
  assert.deepEqual(mergeInfo(pull(), repo()).methods, ['merge', 'squash', 'rebase']);
  assert.deepEqual(
    mergeInfo(pull(), repo({ allow_merge_commit: false, allow_rebase_merge: false })).methods,
    ['squash'],
  );
  const none = mergeInfo(pull(), repo({ allow_merge_commit: false, allow_squash_merge: false, allow_rebase_merge: false }));
  assert.deepEqual(none.methods, []);
  assert.equal(none.ready, false);
});

test('pins the merge to the head commit that was reviewed', () => {
  assert.equal(mergeInfo(pull({ head: { sha: 'deadbeef' } }), repo()).headSha, 'deadbeef');
});

test('a blocked pull request is never ready even with push access', () => {
  const info = mergeInfo(pull({ mergeable_state: 'blocked' }), repo());
  assert.equal(info.canMerge, true);
  assert.equal(info.ready, false);
  assert.match(info.reason, /Branch protection/);
});
