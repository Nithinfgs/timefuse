import { daysBetween, formatDate, relative } from './dates.js';
import { bucket } from './scan.js';

/** @typedef {import('./detectors/util.js').Finding} Finding */

const GROUPS = /** @type {const} */ ([
  ['broken', 'ALREADY BROKEN', 'red'],
  ['d30', 'BREAKS WITHIN 30 DAYS', 'yellow'],
  ['d90', 'BREAKS WITHIN 90 DAYS', 'cyan'],
  ['later', 'LATER', 'dim'],
]);

/** @param {boolean} on */
function palette(on) {
  /** @param {number} code @param {number} [reset] */
  const wrap = (code, reset = 39) => (/** @type {string} */ s) => (on ? `\x1b[${code}m${s}\x1b[${reset}m` : s);
  return {
    red: wrap(31), yellow: wrap(33), cyan: wrap(36), green: wrap(32),
    dim: wrap(2, 22), bold: wrap(1, 22), gray: wrap(90),
  };
}

/** @param {Finding} f @param {Date} asOf */
function when(f, asOf) {
  const days = daysBetween(f.date, asOf);
  const date = f.approximate ? `~${formatDate(f.date).slice(0, 7)}` : formatDate(f.date);
  return { date, rel: relative(days) };
}

/**
 * @param {import('./scan.js').ScanResult} result
 * @param {{ asOf: Date, horizonDays: number, color: boolean, version: string, brief?: boolean }} o
 */
export function formatText(result, o) {
  const c = palette(o.color);
  const out = [];
  out.push(
    c.bold(`timefuse ${o.version}`) +
      c.gray(` · ${result.filesScanned} files · as of ${formatDate(o.asOf)} · horizon ${o.horizonDays}d · EOL data ${result.eolDataDate}`),
  );
  out.push('');

  if (result.findings.length === 0) {
    out.push(c.green('✔ No fuses found inside the horizon.'));
    return out.join('\n') + '\n';
  }

  for (const [key, title, color] of GROUPS) {
    const group = result.findings.filter((f) => bucket(f, o.asOf) === key);
    if (group.length === 0) continue;
    out.push(c[color](c.bold(`${title} (${group.length})`)));
    for (const f of group) {
      const w = when(f, o.asOf);
      const mark = key === 'broken' ? '✖' : '●';
      const conf = f.confidence === 'medium' ? c.gray(' (likely)') : '';
      const head = `  ${c[color](mark)} ${c.bold(w.date)}  ${c.gray(w.rel.padEnd(9))} ${f.title}${conf}`;
      if (o.brief) {
        out.push(`${head}  ${c.gray(`${f.file}:${f.line}`)}`);
        continue;
      }
      out.push(head);
      out.push(`      ${c.gray(`${f.file}:${f.line}`)}`);
      if (f.fix) out.push(`      ${c.gray('→ ' + f.fix)}`);
    }
    out.push('');
  }

  const n = (/** @type {string} */ k) => result.findings.filter((f) => bucket(f, o.asOf) === k).length;
  out.push(
    `${result.findings.length} fuses: ${c.red(`${n('broken')} already broken`)}, ` +
      `${c.yellow(`${n('d30')} within 30 days`)}, ${c.cyan(`${n('d90')} within 90 days`)}, ${n('later')} later`,
  );
  return out.join('\n') + '\n';
}

/**
 * @param {import('./scan.js').ScanResult} result
 * @param {{ asOf: Date, horizonDays: number, version: string }} o
 */
export function formatJson(result, o) {
  return (
    JSON.stringify(
      {
        tool: 'timefuse',
        version: o.version,
        asOf: formatDate(o.asOf),
        horizonDays: o.horizonDays,
        filesScanned: result.filesScanned,
        eolDataDate: result.eolDataDate,
        findings: result.findings.map((f) => ({
          rule: f.rule,
          date: formatDate(f.date),
          approximate: f.approximate ?? false,
          daysUntil: daysBetween(f.date, o.asOf),
          status: bucket(f, o.asOf),
          confidence: f.confidence,
          file: f.file,
          line: f.line,
          title: f.title,
          fix: f.fix ?? null,
        })),
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * @param {import('./scan.js').ScanResult} result
 * @param {{ asOf: Date, horizonDays: number }} o
 */
export function formatMarkdown(result, o) {
  const out = [`# timefuse report (as of ${formatDate(o.asOf)})`, ''];
  if (result.findings.length === 0) return out.concat('No fuses found inside the horizon.', '').join('\n');
  out.push('| When | Status | What | Where |', '| --- | --- | --- | --- |');
  for (const f of result.findings) {
    const w = when(f, o.asOf);
    const status = { broken: '🔴 broken', d30: '🟠 ≤30d', d90: '🟡 ≤90d', later: '⚪ later' }[bucket(f, o.asOf)];
    const title = f.title.replace(/\|/g, '\\|');
    out.push(`| ${w.date} (${w.rel}) | ${status} | ${title} | \`${f.file}:${f.line}\` |`);
  }
  out.push('');
  return out.join('\n');
}
