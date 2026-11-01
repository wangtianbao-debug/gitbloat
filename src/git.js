import { execFileSync } from 'node:child_process';

const MAX_BUFFER = 512 * 1024 * 1024;

export function defaultRun(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd,
    input: options.input,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? MAX_BUFFER,
    stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
}

export class GitError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'GitError';
    this.code = 'EGIT';
    this.cause = cause;
  }
}

/** True when `dir` is inside a git work tree or is a bare repository. */
export function isRepo(dir, run = defaultRun) {
  try {
    const out = run(['rev-parse', '--git-dir'], { cwd: dir });
    return out.trim() !== '';
  } catch {
    return false;
  }
}

export function repoInfo(dir, run = defaultRun) {
  if (!isRepo(dir, run)) throw new GitError(`${dir} is not a git repository`);
  const root = run(['rev-parse', '--show-toplevel'], { cwd: dir }).trim();
  let name = root.split(/[\\/]/).pop() || root;
  let gitDir = './.git';

  try {
    name = run(['rev-parse', '--show-toplevel'], { cwd: dir }).trim().split(/[\\/]/).pop() || name;
  } catch {
    // bare repository: fall back to the directory name
  }

  try {
    gitDir = run(['rev-parse', '--git-dir'], { cwd: dir }).trim();
  } catch {
    /* keep default */
  }

  let branch = 'HEAD';
  try {
    branch = run(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir }).trim();
  } catch {
    /* unborn branch */
  }

  return { name, root: root || dir, gitDir, branch };
}

/**
 * `git count-objects -vH` reports human sizes; parse them into bytes.
 * Returns { objects, size, inPack, sizePack } where sizes are bytes.
 */
export function countObjects(dir, run = defaultRun) {
  let out = '';
  try {
    out = run(['count-objects', '-vH'], { cwd: dir });
  } catch {
    out = '';
  }

  const fields = new Map();
  for (const line of out.split('\n')) {
    const match = /^([a-z-]+):\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    fields.set(match[1], match[2].trim());
  }

  return {
    objects: Number.parseInt(fields.get('count') ?? '0', 10) + Number.parseInt(fields.get('in-pack') ?? '0', 10),
    loose: Number.parseInt(fields.get('count') ?? '0', 10),
    inPack: Number.parseInt(fields.get('in-pack') ?? '0', 10),
    size: parseHumanBytes(fields.get('size') ?? '0 bytes'),
    sizePack: parseHumanBytes(fields.get('size-pack') ?? '0 bytes'),
  };
}

const UNITS = { b: 1, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };

/** Parse "93.52 KiB", "2.1 MB", "0 bytes" into a byte count (0 when unparseable). */
export function parseHumanBytes(text) {
  const match = /^\s*([\d.]+)\s*([a-z]*)\s*$/i.exec(String(text));
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return 0;
  const unit = match[2].toLowerCase();
  const factor = UNITS[unit] ?? (unit === 'kb' ? 1000 : unit === 'mb' ? 1000 ** 2 : unit === 'gb' ? 1000 ** 3 : 1);
  return Math.round(value * factor);
}

/**
 * Every object reachable from any ref: `git rev-list --objects --all`.
 * Returns { blobs: [{sha, path}], objects } with paths as '' when the object has no path.
 */
export function listObjects(dir, run = defaultRun) {
  let out;
  try {
    out = run(['rev-list', '--objects', '--all'], { cwd: dir });
  } catch (error) {
    if (/does not have any commits yet|unknown revision|bad revision/i.test(error?.stderr ?? error?.message ?? '')) {
      return { blobs: [], lines: [] };
    }
    throw new GitError(`could not list objects in ${dir}`, error);
  }

  const lines = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const sha = line.slice(0, 40);
    const path = line.length > 41 ? line.slice(41) : '';
    if (!/^[0-9a-f]{40}$/.test(sha)) continue;
    lines.push({ sha, path });
  }

  return { lines, blobs: lines.filter((entry) => entry.path) };
}

/**
 * Sizes for the given object ids via a single `git cat-file --batch-check` pass.
 * Returns Map<sha, { type, size }>.
 */
export function objectSizes(dir, shas, run = defaultRun) {
  const sizes = new Map();
  if (!shas.length) return sizes;

  const unique = [...new Set(shas)];
  const out = run(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
    cwd: dir,
    input: unique.join('\n') + '\n',
  });

  for (const line of out.split('\n')) {
    if (!line) continue;
    const [sha, type, size] = line.split(/\s+/);
    if (!sha || !type) continue;
    sizes.set(sha, { type, size: Number.parseInt(size ?? '0', 10) || 0 });
  }

  return sizes;
}

/** Paths present in HEAD (empty set for a repository without commits). */
export function headPaths(dir, run = defaultRun) {
  try {
    const out = run(['ls-tree', '-r', '--name-only', '-z', 'HEAD'], { cwd: dir });
    return new Set(out.split('\0').filter(Boolean));
  } catch {
    return new Set();
  }
}
