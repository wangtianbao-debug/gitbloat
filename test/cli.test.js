import assert from 'node:assert/strict';
import test from 'node:test';
import { colorEnabled, parseArgs, run } from '../src/cli.js';
import { emptyRepo, heavyRepo, io, plainDir } from './helpers.js';

test('parseArgs defaults to the current directory and 15 rows', () => {
  const options = parseArgs([]);
  assert.equal(options.repo, '.');
  assert.equal(options.top, 15);
  assert.equal(options.json, false);
});

test('parseArgs reads a repository, --top and output flags', () => {
  const options = parseArgs(['some/repo', '--top', '4', '--json', '--no-color', '-q']);
  assert.equal(options.repo, 'some/repo');
  assert.equal(options.top, 4);
  assert.equal(options.json, true);
  assert.equal(options.color, false);
  assert.equal(options.quiet, true);
});

test('parseArgs rejects bad input', () => {
  assert.match(parseArgs(['--top']).error, /needs a number/);
  assert.match(parseArgs(['--top', '0']).error, /between 1 and 1000/);
  assert.match(parseArgs(['--top', 'lots']).error, /between 1 and 1000/);
  assert.match(parseArgs(['--nope']).error, /unknown option/);
  assert.match(parseArgs(['a', 'b']).error, /at most one repository/);
});

test('usage errors exit 2 and print the help', () => {
  const sink = io();
  assert.equal(run(['--wat'], sink), 2);
  assert.match(sink.err(), /unknown option --wat/);
  assert.match(sink.err(), /Usage/);
  assert.equal(sink.out(), '');
});

test('--version and --help exit 0', () => {
  const version = io();
  assert.equal(run(['--version'], version), 0);
  assert.match(version.out(), /^\d+\.\d+\.\d+\n$/);

  const help = io();
  assert.equal(run(['--help'], help), 0);
  assert.match(help.out(), /gitbloat 0\.1\.0 — see what makes a git repository heavy/);
  assert.match(help.out(), /Exit codes/);
});

test('a plain directory is not a repository', () => {
  const sink = io();
  assert.equal(run([plainDir()], sink), 1);
  assert.match(sink.err(), /is not a git repository/);
});

test('the table names the heaviest path and its history-only weight', () => {
  const sink = io();
  assert.equal(run([heavyRepo(), '--top', '3'], { ...sink, stdout: { ...sink.stdout, isTTY: false } }), 0);
  const text = sink.out();
  assert.match(text, /Heaviest paths · bytes ever committed, top 3/);
  assert.match(text, /assets\/clip\.mp4/);
  assert.match(text, /Only in history/);
  assert.match(text, /gone from HEAD/);
  assert.doesNotMatch(text, /\u001b\[/, 'no color when stdout is not a TTY');
});

test('--json prints one parseable document', () => {
  const sink = io();
  assert.equal(run([heavyRepo(), '--json'], sink), 0);
  const data = JSON.parse(sink.out());
  assert.equal(data.name.length > 0, true);
  assert.ok(data.totalBytes > 0);
  assert.ok(Array.isArray(data.paths));
  assert.equal(data.paths[0].path, 'assets/clip.mp4');
});

test('-q stays silent on success', () => {
  const sink = io();
  assert.equal(run([heavyRepo(), '-q'], sink), 0);
  assert.equal(sink.out(), '');
  assert.equal(sink.err(), '');
});

test('an empty repository still reports instead of erroring', () => {
  const sink = io();
  assert.equal(run([emptyRepo()], sink), 0);
  assert.match(sink.out(), /No reachable blobs yet/);
});

test('colorEnabled honours NO_COLOR, TERM=dumb and TTYs', () => {
  assert.equal(colorEnabled({ isTTY: true }, {}), true);
  assert.equal(colorEnabled({ isTTY: false }, {}), false);
  assert.equal(colorEnabled({ isTTY: true }, { NO_COLOR: '1' }), false);
  assert.equal(colorEnabled({ isTTY: true }, { NO_COLOR: '' }), true);
  assert.equal(colorEnabled({ isTTY: true }, { TERM: 'dumb' }), false);
});
