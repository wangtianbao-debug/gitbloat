import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { sep } from 'node:path';
import test from 'node:test';
import {
  countObjects,
  headPaths,
  isRepo,
  listObjects,
  objectSizes,
  parseHumanBytes,
  repoInfo,
} from '../src/git.js';
import { emptyRepo, git, heavyRepo, plainDir, writeFile } from './helpers.js';

test('parseHumanBytes understands git count-objects units', () => {
  assert.equal(parseHumanBytes('0 bytes'), 0);
  assert.equal(parseHumanBytes('93.52 KiB'), Math.round(93.52 * 1024));
  assert.equal(parseHumanBytes('1.50 MiB'), Math.round(1.5 * 1024 ** 2));
  assert.equal(parseHumanBytes('2.00 GiB'), 2 * 1024 ** 3);
  assert.equal(parseHumanBytes('12 KB'), 12_000);
  assert.equal(parseHumanBytes('nonsense'), 0);
});

test('isRepo distinguishes a repository from a plain directory', () => {
  const repo = emptyRepo();
  assert.equal(isRepo(repo), true);
  assert.equal(isRepo(process.cwd().replace(/[\\/]test$/, '') + '/not-a-repo-here'), false);
  assert.equal(isRepo('/definitely/not/here'), false);
});

test('repoInfo reports the folder name and the current branch', () => {
  const repo = heavyRepo();
  const info = repoInfo(repo);
  assert.equal(info.branch, 'main');
  assert.ok(info.name.length > 0);
  const norm = (value) => realpathSync.native(value).split(sep).join('/').toLowerCase();
  assert.equal(norm(info.root), norm(repo));
});

test('countObjects reports loose and packed objects', () => {
  const repo = heavyRepo();
  const counts = countObjects(repo);
  assert.ok(counts.objects > 0);
  assert.equal(counts.inPack, 0, 'nothing has been repacked yet');
  assert.ok(counts.size > 0);
});

test('listObjects returns blob paths and ignores commits and trees', () => {
  const repo = heavyRepo();
  const { blobs, lines } = listObjects(repo);
  assert.ok(lines.length >= blobs.length);
  const paths = new Set(blobs.map((blob) => blob.path));
  assert.ok(paths.has('assets/clip.mp4'));
  assert.ok(paths.has('src/app.js'));
  assert.ok(blobs.every((blob) => /^[0-9a-f]{40}$/.test(blob.sha)));
});

test('listObjects on an unborn branch returns nothing instead of failing', () => {
  const repo = emptyRepo();
  assert.deepEqual(listObjects(repo), { blobs: [], lines: [] });
});

test('objectSizes resolves sizes in one batch and keeps types', () => {
  const repo = heavyRepo();
  const { blobs } = listObjects(repo);
  const sizes = objectSizes(repo, blobs.map((blob) => blob.sha));
  const app = blobs.find((blob) => blob.path === 'src/app.js');
  assert.equal(sizes.get(app.sha).type, 'blob');
  assert.equal(sizes.get(app.sha).size, 'export const app = 1;\n'.length);
  assert.deepEqual(objectSizes(repo, []), new Map());
});

test('headPaths lists the working tree, not the history', () => {
  const repo = heavyRepo();
  const paths = headPaths(repo);
  assert.ok(paths.has('README.md'));
  assert.equal(paths.has('assets/clip.mp4'), false, 'the clip was deleted');

  writeFile(repo, 'README.md', '# fixture\n\nedited\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'edit readme');
  assert.ok(headPaths(repo).has('README.md'));
});

test('headPaths on an empty repository is empty', () => {
  assert.equal(headPaths(emptyRepo()).size, 0);
});
