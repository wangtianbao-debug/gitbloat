import assert from 'node:assert/strict';
import test from 'node:test';
import { analyze, extensionOf, topDirOf } from '../src/analyze.js';
import { emptyRepo, heavyRepo } from './helpers.js';

test('topDirOf uses the first path segment', () => {
  assert.equal(topDirOf('src/core/engine.js'), 'src');
  assert.equal(topDirOf('README.md'), '(root)');
  assert.equal(topDirOf('.github/workflows/ci.yml'), '.github');
});

test('extensionOf lowercases and keeps dotfiles extension-less', () => {
  assert.equal(extensionOf('a/b/photo.PNG'), 'png');
  assert.equal(extensionOf('.gitignore'), '(none)');
  assert.equal(extensionOf('Makefile'), '(none)');
  assert.equal(extensionOf('archive.tar.gz'), 'gz');
});

test('analyze counts every blob once and points at the heavy path', () => {
  const repo = heavyRepo();
  const report = analyze(repo, { top: 5 });

  assert.ok(report.blobCount >= 4, 'readme, app, and two versions of the clip');
  assert.ok(report.totalBytes > 200_000);
  assert.equal(report.paths[0].path, 'assets/clip.mp4');
  assert.equal(report.paths[0].versions, 2, 'both versions live in history');
  assert.equal(report.paths[0].present, false, 'the file is gone from HEAD');

  const sums = report.allPaths.reduce((total, row) => total + row.bytes, 0);
  assert.equal(sums, report.totalBytes, 'no blob is counted twice');

  assert.equal(report.directories[0].key, 'assets');
  assert.equal(report.extensions[0].key, 'mp4');
  assert.ok(report.historyOnlyBytes > 200_000);
  assert.equal(report.historyOnlyCount, 1);
  assert.equal(report.blobs[0].path, 'assets/clip.mp4');
});

test('analyze respects the top limit but keeps the totals', () => {
  const repo = heavyRepo();
  const report = analyze(repo, { top: 1 });
  assert.equal(report.paths.length, 1);
  assert.ok(report.allPaths.length > 1);
  assert.ok(report.totalBytes > 0);
});

test('an empty repository analyzes to zeros instead of throwing', () => {
  const report = analyze(emptyRepo());
  assert.equal(report.blobCount, 0);
  assert.equal(report.totalBytes, 0);
  assert.deepEqual(report.paths, []);
  assert.deepEqual(report.historyOnly, []);
});
