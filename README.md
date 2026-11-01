# gitbloat

**Why is this repository so big?** One command, in bytes.

![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-2f4858) ![Zero dependencies](https://img.shields.io/badge/dependencies-0-2f4858) ![Tests](https://img.shields.io/badge/tests-34-2f4858) ![License MIT](https://img.shields.io/badge/license-MIT-2f4858)

```
$ gitbloat
demo · 61 objects · 747 KB on disk · 1.28 MB over 11 paths
────────────────────────────────────────────────────────────────────────

Heaviest paths · bytes ever committed, top 8
  assets/launch.mp4       1.23 MB     96%  5 blobs  gone from HEAD
  assets/logo.png         39.1 KB    3.0%  1 blob
  src/core/module-5.js    2.83 KB    0.2%  1 blob
  src/core/module-4.js    2.54 KB    0.2%  1 blob

Directories · first path segment
  assets          1.27 MB     99%
  src             12.7 KB    1.0%
  (root)             49 B   <0.1%

Files by type · by extension
  mp4       1.23 MB     96%  5 blobs
  png       39.1 KB    3.0%  1 blob
  js        12.7 KB    1.0%  8 blobs

Heaviest single blobs · one file, one version
  630f0a0     259 KB  assets/launch.mp4  gone
  3c9e7e4     254 KB  assets/launch.mp4  gone
  a07fa44    39.1 KB  assets/logo.png

Only in history · 1.23 MB, 96% of all blobs — not in the working tree
  assets/launch.mp4       1.23 MB     96%

Next step: assets holds 99% of the weight. Big binaries belong in releases or object storage, not in the pack file.
```

The video was deleted four commits ago. `ls` does not show it, `.gitignore` lists it, `git gc` keeps it — and it is 96% of everything the repository remembers. That is the accident `gitbloat` is for.

## Why

Repositories get heavy in exactly four ways, and only one of them is visible in the working tree:

| What happened | Where the weight is | `du -sh .` says |
| --- | --- | --- |
| A big binary was committed and is still used | working tree + history | big |
| A big binary was committed and deleted | history only | big |
| A big file was committed ten times with small edits | ten blobs, all kept | big |
| Node modules or build output were committed | history | big |

`gitbloat` reads every object reachable from every ref (`git rev-list --objects --all`), gets each blob's real size from `git cat-file --batch-check`, and rolls the numbers up by path, by first-level directory, and by file extension. Blobs that are no longer in `HEAD` are called out separately, because they are the ones people are surprised by.

## Install

Node 18 or newer, plus `git` on `PATH`.

```sh
git clone https://github.com/wangtianbao-debug/gitbloat.git
cd gitbloat
npm link        # optional: puts `gitbloat` on your PATH
```

## Usage

```sh
gitbloat                    # the current repository
gitbloat ../some-repo       # any directory inside another repository
gitbloat --top 30           # more rows per section
gitbloat --json             # the same numbers for a script or a CI gate
gitbloat -q                 # exit code only (see below)
```

| Option | Meaning |
| --- | --- |
| `-t, --top <n>` | Rows per section (default 15, max 1000). |
| `--json` | Machine-readable report. |
| `--no-color` | Plain text (also honours `NO_COLOR` and `TERM=dumb`). |
| `-q, --quiet` | Print nothing on success. |
| `-h, --help` | Help. |
| `-v, --version` | Version. |

## What the numbers mean

| Field | Meaning |
| --- | --- |
| `on disk` | `git count-objects -vH`: loose object size plus the pack files, i.e. what the folder costs. |
| `over N paths` | Sum of every reachable blob, counted **once per blob**. A file committed eleven times contributes eleven times. |
| `share` | A path's bytes divided by all reachable blob bytes. |
| `N blobs` | How many distinct contents that path has had. More than a couple usually means a binary was edited in place. |
| `gone from HEAD` | The path is not in `HEAD`'s tree: deleting it did not delete the weight. |
| `Only in history` | The subset of paths that are gone from `HEAD` — the usual answer to "but I deleted that file". |

`on disk` is smaller than the reachable total on purpose: git zlib-compresses and deltas blobs, so 1.28 MB of history can sit in 747 KB of pack. Both numbers answer different questions.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Report printed. |
| 1 | Not a git repository, `git` failed, or the folder does not exist. |
| 2 | Bad usage. |

Gate a CI job on repository weight with `--json`:

```sh
node bin/gitbloat.js --json > bloat.json
node -e "const r=require('./bloat.json'); if (r.historyOnlyBytes > 50e6) { console.error('history-only blobs exceed 50 MB'); process.exit(1) }"
```

## Use it as a library

```js
import { analyze, formatReport, formatJson } from 'gitbloat';

const report = analyze('.', { top: 10 });
console.log(report.totalBytes, report.historyOnlyBytes);
console.log(report.paths[0]);       // { path, bytes, share, versions, present }
console.log(formatReport(report));  // string, no colors
console.log(formatJson(report));    // plain object
```

`analyze()` runs four git commands: `rev-parse`, `count-objects -vH`, `rev-list --objects --all`, and one batched `cat-file --batch-check`. On a 10k-commit repository that is a few seconds, once.

## Limits

- Reads reachable history only. Unreferenced (dangling) objects are not counted; run `git prune` to drop them.
- Path attribution is per blob: when the same content lives at two paths, it is counted under the first path `rev-list` reports, so totals stay honest.
- Works on bare repositories.
- Not a history rewriter: it tells you what is heavy and where; `git filter-repo` does the surgery.
- Submodules are not walked.

## Tests

```sh
node --test
```

34 tests: byte formatting, path/extension rollups, `count-objects` parsing, blob listing, batched sizes, `HEAD` comparison, empty repositories, the report layout, JSON shape, and the CLI end to end (exit codes, `--json`, `-q`, color detection).

## CI

The workflow lives at [`ci/ci.yml`](ci/ci.yml) — copy it to `.github/workflows/ci.yml` for the 3-OS × 4-Node matrix.

## License

MIT © 2026 wangtianbao-debug
