import { analyze } from './analyze.js';
import { formatJson, formatReport, makeColors } from './format.js';

export const VERSION = '0.1.0';

const USAGE = `gitbloat ${VERSION} — see what makes a git repository heavy

Usage
  gitbloat [repo] [options]

  repo                     any directory inside the repository (default: .)

Options
  -t, --top <n>            rows per section (default 15)
      --json               machine-readable report
      --no-color           plain text (also honours NO_COLOR and TERM=dumb)
  -q, --quiet              print nothing on success
  -h, --help               show this help
  -v, --version            print the version

The report reads every blob reachable from any ref, so files deleted long ago
still show up: they are what keeps the pack file large.

Exit codes
  0  report printed
  1  not a git repository, or git failed
  2  bad usage
`;

export function parseArgs(argv) {
  const options = { repo: '.', top: 15, json: false, color: null, quiet: false, help: false, version: false };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-v':
      case '--version':
        options.version = true;
        break;
      case '-q':
      case '--quiet':
        options.quiet = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--no-color':
        options.color = false;
        break;
      case '-t':
      case '--top': {
        const value = argv[index + 1];
        index += 1;
        if (value === undefined) return { error: `${arg} needs a number` };
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
          return { error: `${arg} expects a whole number between 1 and 1000` };
        }
        options.top = parsed;
        break;
      }
      default:
        if (arg.startsWith('-') && arg !== '-') return { error: `unknown option ${arg}` };
        positional.push(arg);
        break;
    }
  }

  if (positional.length > 1) return { error: 'expected at most one repository path' };
  if (positional.length === 1) options.repo = positional[0];

  return options;
}

export function colorEnabled(stream = process.stdout, env = process.env) {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.TERM === 'dumb') return false;
  return Boolean(stream.isTTY);
}

export function run(argv, io = process, deps = {}) {
  const options = parseArgs(argv);
  if (options.error) {
    io.stderr.write(`gitbloat: ${options.error}\n\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    io.stdout.write(USAGE);
    return 0;
  }
  if (options.version) {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }

  let report;
  try {
    report = (deps.analyze ?? analyze)(options.repo, { top: options.top });
  } catch (error) {
    const detail = error?.message ?? String(error);
    io.stderr.write(`gitbloat: ${detail}\n`);
    return 1;
  }

  const colors = makeColors(options.color ?? colorEnabled(io.stdout));
  if (options.json) {
    io.stdout.write(`${JSON.stringify(formatJson(report), null, 2)}\n`);
  } else if (!options.quiet) {
    io.stdout.write(formatReport(report, { colors }));
  }

  return 0;
}
