const ANSI = {
  dim: ['\u001b[2m', '\u001b[22m'],
  bold: ['\u001b[1m', '\u001b[22m'],
  red: ['\u001b[31m', '\u001b[39m'],
  green: ['\u001b[32m', '\u001b[39m'],
  yellow: ['\u001b[33m', '\u001b[39m'],
  cyan: ['\u001b[36m', '\u001b[39m'],
};

export function makeColors(enabled) {
  const wrap = (name) => (text) => (enabled ? ANSI[name][0] + text + ANSI[name][1] : String(text));
  return {
    enabled,
    dim: wrap('dim'),
    bold: wrap('bold'),
    red: wrap('red'),
    green: wrap('green'),
    yellow: wrap('yellow'),
    cyan: wrap('cyan'),
  };
}

const KB = 1024;

/** 0 → "0 B"; 4.2 KB; 104 KB; 1.4 MB — three significant digits, binary units. */
export function humanBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < KB) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / KB;
  let unit = 0;
  while (value >= KB && unit < units.length - 1) {
    value /= KB;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function formatNumber(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 0.0412 → "4.1%"; a non-zero value never rounds down to "0.0%". */
export function percent(fraction) {
  if (!fraction) return '0%';
  const value = fraction * 100;
  if (value < 0.1) return '<0.1%';
  if (value >= 10) return `${Math.round(value)}%`;
  return `${value.toFixed(1)}%`;
}

export function truncate(text, width) {
  if (text.length <= width) return text;
  if (width <= 1) return text.slice(0, width);
  return `${text.slice(0, width - 1)}…`;
}

function padEnd(text, width) {
  const length = [...text].length;
  return length >= width ? text : text + ' '.repeat(width - length);
}

function padStart(text, width) {
  const length = [...text].length;
  return length >= width ? text : ' '.repeat(width - length) + text;
}

const RULE_WIDTH = 72;

function section(title, note, colors) {
  return `\n${colors.bold(title)}${note ? ` ${colors.dim(`· ${note}`)}` : ''}`;
}

/**
 * Human-readable report. `report.name` heads the block, then the sizes that
 * matter for the question "why is this repository big?".
 */
export function formatReport(report, options = {}) {
  const colors = options.colors ?? makeColors(false);
  const top = report.paths.length;
  const lines = [];

  lines.push(
    `${colors.bold(report.name)} ${colors.dim('·')} ${formatNumber(report.objects)} objects ` +
      `${colors.dim('·')} ${humanBytes(report.onDisk)} on disk ` +
      `${colors.dim('·')} ${humanBytes(report.totalBytes)} over ${formatNumber(report.pathCount)} paths`,
  );
  lines.push(colors.dim('─'.repeat(RULE_WIDTH)));

  if (!report.blobCount) {
    lines.push('No reachable blobs yet — commit something and run again.');
    return `${lines.join('\n')}\n`;
  }

  const pathWidth = Math.min(38, Math.max(20, ...report.paths.map((row) => row.path.length)));
  const dirWidth = Math.min(28, Math.max(12, ...report.directories.map((row) => row.key.length)));

  lines.push(section('Heaviest paths', `bytes ever committed, top ${top}`, colors));
  for (const row of report.paths) {
    const state = row.present ? '' : colors.yellow('  gone from HEAD');
    lines.push(
      `  ${padEnd(truncate(row.path, pathWidth), pathWidth)}  ${padStart(humanBytes(row.bytes), 9)}` +
        `  ${padStart(percent(row.share), 6)}  ${colors.dim(`${row.versions} blob${row.versions === 1 ? '' : 's'}`)}${state}`,
    );
  }

  lines.push(section('Directories', 'first path segment', colors));
  for (const row of report.directories) {
    lines.push(
      `  ${padEnd(truncate(row.key, dirWidth), dirWidth)}  ${padStart(humanBytes(row.bytes), 9)}` +
        `  ${padStart(percent(row.share), 6)}`,
    );
  }

  lines.push(section('Files by type', 'by extension', colors));
  const extWidth = Math.min(16, Math.max(6, ...report.extensions.map((row) => row.key.length)));
  for (const row of report.extensions) {
    lines.push(
      `  ${padEnd(truncate(row.key, extWidth), extWidth)}  ${padStart(humanBytes(row.bytes), 9)}` +
        `  ${padStart(percent(row.share), 6)}  ${colors.dim(`${formatNumber(row.blobs)} blob${row.blobs === 1 ? '' : 's'}`)}`,
    );
  }

  lines.push(section('Heaviest single blobs', 'one file, one version', colors));
  for (const blob of report.blobs) {
    lines.push(
      `  ${colors.dim(blob.sha.slice(0, 7))}  ${padStart(humanBytes(blob.bytes), 9)}  ` +
        `${truncate(blob.path, Math.max(20, RULE_WIDTH - 22))}${blob.present ? '' : colors.yellow('  gone')}`,
    );
  }

  if (report.historyOnlyCount) {
    const share = report.totalBytes ? report.historyOnlyBytes / report.totalBytes : 0;
    lines.push(
      section(
        'Only in history',
        `${humanBytes(report.historyOnlyBytes)}, ${percent(share)} of all blobs — not in the working tree`,
        colors,
      ),
    );
    for (const row of report.historyOnly) {
      lines.push(
        `  ${padEnd(truncate(row.path, pathWidth), pathWidth)}  ${padStart(humanBytes(row.bytes), 9)}` +
          `  ${padStart(percent(row.share), 6)}`,
      );
    }
    if (report.historyOnlyCount > report.historyOnly.length) {
      lines.push(colors.dim(`  … ${formatNumber(report.historyOnlyCount - report.historyOnly.length)} more`));
    }
  }

  const heaviest = report.allDirectories[0];
  if (heaviest && heaviest.share >= 0.25) {
    lines.push(
      `\n${colors.dim('Next step:')} ${truncate(heaviest.key, 24)} holds ${percent(heaviest.share)} of the weight. ` +
        'Big binaries belong in releases or object storage, not in the pack file.',
    );
  }

  return `${lines.join('\n')}\n`;
}

export function formatJson(report) {
  return {
    name: report.name,
    branch: report.branch,
    root: report.root,
    objects: report.objects,
    onDisk: report.onDisk,
    blobCount: report.blobCount,
    pathCount: report.pathCount,
    totalBytes: report.totalBytes,
    historyOnlyBytes: report.historyOnlyBytes,
    paths: report.paths.map((row) => ({
      path: row.path,
      bytes: row.bytes,
      share: Number(row.share.toFixed(4)),
      versions: row.versions,
      present: row.present,
    })),
    directories: report.directories,
    extensions: report.extensions,
    blobs: report.blobs,
  };
}
