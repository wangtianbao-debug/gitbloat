/**
 * Build a throwaway repository whose history looks like a real accident:
 * a large media file was committed, edited, then deleted, so it still sits in
 * the pack file even though `ls-tree HEAD` no longer mentions it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'gitbloat-demo-'));

const git = (...args) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=Demo Author', '-c', 'user.email=demo@example.com', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** Deterministic pseudo-random bytes so sizes are stable between runs. */
function blob(seed, bytes) {
  let state = seed;
  const chunks = [];
  for (let offset = 0; offset < bytes; offset += 8) {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    chunks.push(state.toString(36).padStart(8, '0'));
  }
  return chunks.join('').slice(0, bytes);
}

git('init', '-q', '-b', 'main');
mkdirSync(join(dir, 'assets'), { recursive: true });
mkdirSync(join(dir, 'src', 'core'), { recursive: true });

writeFileSync(join(dir, 'README.md'), '# demo\n\nA repository that got heavy by accident.\n');
writeFileSync(join(dir, 'assets', 'launch.mp4'), blob(7, 260_000));
writeFileSync(join(dir, 'assets', 'logo.png'), blob(11, 40_000));
writeFileSync(join(dir, 'src', 'core', 'engine.js'), 'export const engine = () => 1;\n');
git('add', '-A');
git('commit', '-q', '-m', 'initial: app plus media');

// Re-encode the video a few times: every version stays in history.
for (let round = 2; round <= 5; round += 1) {
  writeFileSync(join(dir, 'assets', 'launch.mp4'), blob(7 + round * 13, 240_000 + round * 5_000));
  git('add', '-A');
  git('commit', '-q', '-m', `assets: re-encode launch video (round ${round})`);
}

// The classic mistake: delete the heavy file and assume the weight goes away.
rmSync(join(dir, 'assets', 'launch.mp4'));
writeFileSync(join(dir, 'src', 'core', 'cache.js'), 'export const cache = new Map();\n');
git('add', '-A');
git('commit', '-q', '-m', 'assets: drop the video, add a cache');

// A few ordinary commits so the tree looks lived in.
for (let index = 0; index < 6; index += 1) {
  writeFileSync(join(dir, 'src', 'core', `module-${index}.js`), blob(100 + index, 1_400 + index * 300));
  git('add', '-A');
  git('commit', '-q', '-m', `feat: module ${index}`);
}

process.stdout.write(`${dir}\n`);
