import { countObjects, headPaths, listObjects, objectSizes, repoInfo } from './git.js';

/** "src/a/b.js" → "src"; "README.md" → "(root)". */
export function topDirOf(path) {
  const index = path.lastIndexOf('/');
  if (index <= 0) return index === 0 ? '(root)' : '(root)';
  return path.slice(0, index).split('/')[0] || '(root)';
}

/** "src/a/b.min.js" → "js"; dotfiles like ".gitignore" → "(none)". */
export function extensionOf(path) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '(none)';
  return base.slice(dot + 1).toLowerCase();
}

function addTo(map, key, bytes, extra = 0) {
  const entry = map.get(key) ?? { key, bytes: 0, count: 0, extra: 0 };
  entry.bytes += bytes;
  entry.count += 1;
  entry.extra += extra;
  map.set(key, entry);
}

/**
 * Walk every reachable blob once and describe where the weight sits.
 *
 * Each blob is counted under the path it was first seen at, so the numbers add
 * up: `totalBytes` equals the sum of every row in `byPath`.
 */
export function analyze(dir = '.', options = {}) {
  const run = options.run;
  const top = options.top ?? 15;
  const info = repoInfo(dir, run);
  const counts = countObjects(info.root, run);
  const { blobs } = listObjects(info.root, run);
  const sizes = objectSizes(info.root, blobs.map((blob) => blob.sha), run);
  const present = headPaths(info.root, run);

  const seen = new Set();
  const byPath = new Map();
  const byDir = new Map();
  const byExt = new Map();
  const allBlobs = [];
  let totalBytes = 0;

  for (const blob of blobs) {
    if (seen.has(blob.sha)) continue;
    const meta = sizes.get(blob.sha);
    if (!meta || meta.type !== 'blob') continue;
    seen.add(blob.sha);

    totalBytes += meta.size;
    addTo(byPath, blob.path, meta.size);
    addTo(byDir, topDirOf(blob.path), meta.size);
    addTo(byExt, extensionOf(blob.path), meta.size);
    allBlobs.push({ sha: blob.sha, path: blob.path, bytes: meta.size, present: present.has(blob.path) });
  }

  const share = (bytes) => (totalBytes ? bytes / totalBytes : 0);
  const pathRows = [...byPath.values()]
    .map((row) => ({
      path: row.key,
      bytes: row.bytes,
      share: share(row.bytes),
      versions: row.count,
      present: present.has(row.key),
    }))
    .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));

  const sortRollup = (map) =>
    [...map.values()]
      .map((row) => ({ key: row.key, bytes: row.bytes, share: share(row.bytes), blobs: row.count }))
      .sort((a, b) => b.bytes - a.bytes || a.key.localeCompare(b.key));

  const historyOnly = pathRows.filter((row) => !row.present);

  return {
    name: info.name,
    root: info.root,
    branch: info.branch,
    onDisk: counts.size + counts.sizePack,
    objects: counts.objects,
    packedObjects: counts.inPack,
    blobCount: seen.size,
    pathCount: byPath.size,
    totalBytes,
    historyOnlyBytes: historyOnly.reduce((sum, row) => sum + row.bytes, 0),
    paths: pathRows.slice(0, top),
    allPaths: pathRows,
    directories: sortRollup(byDir).slice(0, top),
    allDirectories: sortRollup(byDir),
    extensions: sortRollup(byExt).slice(0, top),
    allExtensions: sortRollup(byExt),
    blobs: allBlobs.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, top),
    historyOnly: historyOnly.slice(0, top),
    historyOnlyCount: historyOnly.length,
  };
}
