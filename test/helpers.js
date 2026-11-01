import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const git = (dir, ...args) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** Deterministic filler so a file of an exact size can be committed. */
export function filler(bytes, seed = 1) {
  let state = seed;
  const out = [];
  for (let produced = 0; produced < bytes; produced += 8) {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    out.push(state.toString(36).padStart(8, '0'));
  }
  return out.join('').slice(0, bytes);
}

/**
 * A repository with a big file that was committed twice and then deleted:
 * the blobs are unreachable from HEAD but still counted.
 */
export function heavyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'gitbloat-test-'));
  git(dir, 'init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });

  writeFileSync(join(dir, 'README.md'), '# fixture\n');
  writeFileSync(join(dir, 'assets', 'clip.mp4'), filler(120_000, 3));
  writeFileSync(join(dir, 'src', 'app.js'), 'export const app = 1;\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'add a heavy clip');

  writeFileSync(join(dir, 'assets', 'clip.mp4'), filler(120_000, 4));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 're-encode the clip');

  rmSync(join(dir, 'assets', 'clip.mp4'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'drop the clip');

  return dir;
}

/** Write a file relative to the repository root, creating parent folders. */
export function writeFile(dir, relative, contents) {
  const target = join(dir, relative);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, contents);
}

export function plainDir() {
  return mkdtempSync(join(tmpdir(), 'gitbloat-plain-'));
}

export function emptyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'gitbloat-empty-'));
  git(dir, 'init', '-q', '-b', 'main');
  return dir;
}

export function io() {
  let out = '';
  let err = '';
  return {
    stdout: { write: (chunk) => { out += chunk; return true; }, isTTY: false },
    stderr: { write: (chunk) => { err += chunk; return true; } },
    out: () => out,
    err: () => err,
  };
}
