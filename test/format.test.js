import assert from 'node:assert/strict';
import test from 'node:test';
import { formatNumber, formatReport, humanBytes, makeColors, percent, truncate } from '../src/format.js';
import { formatJson } from '../src/format.js';

test('humanBytes uses binary units and three significant digits', () => {
  assert.equal(humanBytes(0), '0 B');
  assert.equal(humanBytes(-5), '0 B');
  assert.equal(humanBytes(999), '999 B');
  assert.equal(humanBytes(1024), '1.00 KB');
  assert.equal(humanBytes(1536), '1.50 KB');
  assert.equal(humanBytes(12 * 1024), '12.0 KB');
  assert.equal(humanBytes(512 * 1024), '512 KB');
  assert.equal(humanBytes(1536 * 1024), '1.50 MB');
  assert.equal(humanBytes(3 * 1024 ** 3), '3.00 GB');
});

test('percent keeps small values visible', () => {
  assert.equal(percent(0), '0%');
  assert.equal(percent(0.0004), '<0.1%');
  assert.equal(percent(0.042), '4.2%');
  assert.equal(percent(0.25), '25%');
  assert.equal(percent(1), '100%');
});

test('formatNumber groups thousands', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(1234), '1,234');
  assert.equal(formatNumber(1234567), '1,234,567');
});

test('truncate marks the cut', () => {
  assert.equal(truncate('short', 10), 'short');
  assert.equal(truncate('a-very-long-path', 8), 'a-very-…');
  assert.equal(truncate('abc', 0), '');
});

test('colors wrap and unwrap on demand', () => {
  const off = makeColors(false);
  assert.equal(off.bold('x'), 'x');

  const on = makeColors(true);
  assert.ok(on.bold('x').includes('\u001b[1m'));
  assert.ok(on.bold('x').endsWith('\u001b[22m'));
});

const emptyReport = {
  name: 'empty',
  branch: 'main',
  root: '/tmp/empty',
  objects: 0,
  onDisk: 0,
  blobCount: 0,
  pathCount: 0,
  totalBytes: 0,
  historyOnlyBytes: 0,
  paths: [],
  allPaths: [],
  directories: [],
  allDirectories: [],
  extensions: [],
  allExtensions: [],
  blobs: [],
  historyOnly: [],
  historyOnlyCount: 0,
};

test('an empty repository says so instead of printing empty tables', () => {
  const text = formatReport(emptyReport);
  assert.match(text, /^empty · 0 objects · 0 B on disk/m);
  assert.match(text, /No reachable blobs yet/);
  assert.doesNotMatch(text, /Heaviest paths/);
});

test('the report lists paths, history-only rows and a next step', () => {
  const report = {
    ...emptyReport,
    objects: 12,
    onDisk: 40_000,
    blobCount: 3,
    pathCount: 2,
    totalBytes: 9000,
    historyOnlyBytes: 8000,
    paths: [
      { path: 'assets/clip.mp4', bytes: 8000, share: 8000 / 9000, versions: 2, present: false },
      { path: 'src/app.js', bytes: 1000, share: 1000 / 9000, versions: 1, present: true },
    ],
    allPaths: [],
    directories: [
      { key: 'assets', bytes: 8000, share: 8000 / 9000, blobs: 2 },
      { key: 'src', bytes: 1000, share: 1000 / 9000, blobs: 1 },
    ],
    allDirectories: [{ key: 'assets', bytes: 8000, share: 8000 / 9000, blobs: 2 }],
    extensions: [
      { key: 'mp4', bytes: 8000, share: 8000 / 9000, blobs: 2 },
      { key: 'js', bytes: 1000, share: 1000 / 9000, blobs: 1 },
    ],
    blobs: [
      { sha: 'abcdef1234567890', path: 'assets/clip.mp4', bytes: 4000, present: false },
      { sha: '1234567890abcdef', path: 'assets/clip.mp4', bytes: 4000, present: false },
    ],
    historyOnly: [{ path: 'assets/clip.mp4', bytes: 8000, share: 8000 / 9000, versions: 2, present: false }],
    historyOnlyCount: 1,
  };

  const text = formatReport(report, { colors: makeColors(false) });
  assert.match(text, /Heaviest paths · bytes ever committed, top 2/);
  assert.match(text, /assets\/clip\.mp4\s+7\.81 KB\s+89%\s+2 blobs\s+gone from HEAD/);
  assert.match(text, /Only in history · 7\.81 KB, 89% of all blobs/);
  assert.match(text, /abcdef1\s+3\.91 KB\s+assets\/clip\.mp4\s+gone/);
  assert.doesNotMatch(text, /abcdef1234567890/, 'blob ids are shortened to seven characters');
  assert.match(text, /Next step: assets holds 89% of the weight/);
  assert.doesNotMatch(text, /\u001b\[/, 'no ANSI escapes when colors are off');
});

test('formatJson strips internal fields and rounds shares', () => {
  const report = {
    ...emptyReport,
    paths: [{ path: 'a.bin', bytes: 10, share: 0.123456, versions: 1, present: true }],
    allPaths: [{ path: 'secret', bytes: 1, share: 1, versions: 1, present: true }],
    historyOnly: [],
    directories: [],
    extensions: [],
    blobs: [],
  };

  const json = formatJson(report);
  assert.equal(json.paths.length, 1);
  assert.equal(json.paths[0].share, 0.1235);
  assert.equal(json.allPaths, undefined);
  assert.equal(json.historyOnly, undefined);
  assert.equal(json.blobCount, 0);
});
