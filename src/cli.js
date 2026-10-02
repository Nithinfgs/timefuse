import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { daysBetween, parseDate, parseDuration, today } from './dates.js';
import { updateEol } from './eol.js';
import { formatJson, formatMarkdown, formatText } from './report.js';
import { scan } from './scan.js';

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));

const HELP = `timefuse ${pkg.version}
Find the code in your repo that will break on a specific date.

Usage
  timefuse [path] [options]      scan a repository (default: current directory)
  timefuse update-data [--out f] refresh EOL data from endoflife.date (the only network call)

Options
  --as-of <YYYY-MM-DD>     pretend today is this date ("time travel")
  --within <duration>      reporting horizon: 30d, 12w, 6m, 1y   (default: 180d)
  --fail-within <duration> exit 1 if anything breaks inside this window (0d = only already-broken)
  --format <fmt>           text | json | markdown                (default: text)
  --min-confidence <lvl>   medium | high                         (default: medium)
  --ignore <glob>          skip matching paths (repeatable)
  --eol-file <file>        use this EOL data file instead of the bundled snapshot
  --brief                  one line per finding (no fix hints)
  --no-color               disable ANSI colors
  -v, --version            print version
  -h, --help               show this help

Config: .timefuse.json in the scanned directory ({ "ignore": [], "within": "180d", "disableRules": [] }).
Suppress one line with a "timefuse-ignore" comment on it or on the line above.
`;

/** @param {string[]} argv @param {NodeJS.WriteStream} stdout @param {NodeJS.WriteStream} stderr */
export async function main(argv, stdout = process.stdout, stderr = process.stderr) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'as-of': { type: 'string' },
      within: { type: 'string' },
      'fail-within': { type: 'string' },
      format: { type: 'string', default: 'text' },
      'min-confidence': { type: 'string', default: 'medium' },
      ignore: { type: 'string', multiple: true },
      'eol-file': { type: 'string' },
      out: { type: 'string' },
      'no-color': { type: 'boolean' },
      brief: { type: 'boolean' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) return void stdout.write(HELP), 0;
  if (values.version) return void stdout.write(pkg.version + '\n'), 0;

  if (positionals[0] === 'update-data') {
    const { file, data } = await updateEol(values.out);
    const count = Object.values(data.products).reduce((n, c) => n + c.length, 0);
    stdout.write(`Wrote ${count} release cycles to ${file}\n`);
    return 0;
  }

  const root = resolve(positionals[0] ?? '.');
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    stderr.write(`timefuse: not a directory: ${root}\n`);
    return 2;
  }

  /** @type {{ ignore?: string[], within?: string, disableRules?: string[] }} */
  let config = {};
  const configPath = join(root, '.timefuse.json');
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (e) {
      stderr.write(`timefuse: cannot parse .timefuse.json: ${/** @type {Error} */ (e).message}\n`);
      return 2;
    }
  }

  try {
    let asOf = today();
    if (values['as-of']) {
      const parsed = parseDate(values['as-of']);
      if (!parsed) throw new Error(`--as-of must be a real date in YYYY-MM-DD form, got "${values['as-of']}"`);
      asOf = parsed;
    }
    const horizonDays = parseDuration(values.within ?? config.within ?? '180d');
    const failWithin = values['fail-within'] === undefined ? null : parseDuration(values['fail-within']);
    const minConfidence = values['min-confidence'];
    if (minConfidence !== 'high' && minConfidence !== 'medium') throw new Error('--min-confidence must be high or medium');
    const format = values.format;
    if (!['text', 'json', 'markdown'].includes(format)) throw new Error('--format must be text, json or markdown');

    const result = scan({
      root,
      asOf,
      horizonDays,
      minConfidence,
      ignore: [...(config.ignore ?? []), ...(values.ignore ?? [])],
      disableRules: config.disableRules,
      eolFile: values['eol-file'],
    });

    const color = !values['no-color'] && !process.env.NO_COLOR && (Boolean(stdout.isTTY) || Boolean(process.env.FORCE_COLOR));
    const o = { asOf, horizonDays, color, version: pkg.version, brief: Boolean(values.brief) };
    stdout.write(
      format === 'json' ? formatJson(result, o) : format === 'markdown' ? formatMarkdown(result, o) : formatText(result, o),
    );

    if (failWithin !== null && result.findings.some((f) => daysBetween(f.date, asOf) <= failWithin)) return 1;
    return 0;
  } catch (e) {
    stderr.write(`timefuse: ${/** @type {Error} */ (e).message}\n`);
    return 2;
  }
}
