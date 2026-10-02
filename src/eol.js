import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, formatDate, parseDate } from './dates.js';

/**
 * @typedef {object} Cycle
 * @property {string} cycle
 * @property {string | false | null} [eol]
 * @property {string | false | null} [lts]
 * @property {string | null} [releaseDate]
 * @property {string | null} [codename]
 *
 * @typedef {object} EolData
 * @property {string} generatedAt
 * @property {string} source
 * @property {Record<string, Cycle[]>} products
 */

/** Products pulled from endoflife.date. Keys are the endoflife.date slugs. */
export const PRODUCTS = [
  'nodejs',
  'python',
  'go',
  'ruby',
  'php',
  'postgresql',
  'mysql',
  'mongodb',
  'redis',
  'nginx',
  'ubuntu',
  'debian',
  'alpine-linux',
  'django',
  'rails',
  'github-actions-runner-images',
];

const here = dirname(fileURLToPath(import.meta.url));
export const BUNDLED_PATH = join(here, '..', 'data', 'eol.json');

export function cachePath() {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'timefuse', 'eol.json');
}

/** @param {string} file @returns {EolData} */
function readData(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Load EOL data. Preference: explicit file > newer of (cache, bundled snapshot).
 * Never touches the network.
 * @param {string} [explicitFile]
 * @returns {EolData}
 */
export function loadEol(explicitFile) {
  if (explicitFile) return readData(explicitFile);
  const bundled = readData(BUNDLED_PATH);
  const cache = cachePath();
  if (existsSync(cache)) {
    try {
      const cached = readData(cache);
      if (cached.generatedAt > bundled.generatedAt) return cached;
    } catch {
      // A corrupt cache must never break a scan; fall back to the snapshot.
    }
  }
  return bundled;
}

/**
 * Download fresh data from endoflife.date. Only called by `timefuse update-data`.
 * @param {string} [outFile]
 * @returns {Promise<{ file: string, data: EolData }>}
 */
export async function updateEol(outFile) {
  /** @type {Record<string, Cycle[]>} */
  const products = {};
  for (const slug of PRODUCTS) {
    const res = await fetch(`https://endoflife.date/api/${slug}.json`, {
      headers: { 'user-agent': 'timefuse (+https://github.com/Nithinfgs/timefuse)' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`endoflife.date/${slug}: HTTP ${res.status}`);
    /** @type {Array<Record<string, any>>} */
    const rows = await res.json();
    products[slug] = rows.map((r) => ({
      cycle: String(r.cycle),
      eol: r.eol ?? null,
      lts: r.lts ?? null,
      releaseDate: r.releaseDate ?? null,
      codename: typeof r.codename === 'string' ? r.codename : null,
    }));
  }
  /** @type {EolData} */
  const data = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'https://endoflife.date (CC BY-SA 4.0)',
    products,
  };
  const file = outFile ?? cachePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
  return { file, data };
}

/**
 * Find the release cycle that a version string belongs to.
 * "20.11.1" -> nodejs cycle "20"; "3.9.7" -> python "3.9"; "bookworm" -> debian "12".
 * @param {EolData} data
 * @param {string} product
 * @param {string} version
 * @returns {Cycle | null}
 */
export function lookup(data, product, version) {
  const cycles = data.products[product];
  if (!cycles) return null;
  const v = version.trim().toLowerCase().replace(/^v/, '').replace(/\.(x|\*)$/, '');

  const byCodename = cycles.find((c) => c.codename && c.codename.toLowerCase().split(' ')[0] === v);
  if (byCodename) return byCodename;

  const parts = v.split('.');
  while (parts.length > 0) {
    const candidate = parts.join('.');
    const hit = cycles.find((c) => c.cycle.toLowerCase() === candidate);
    if (hit) return hit;
    parts.pop();
  }
  return null;
}

/** @param {Cycle} c @returns {Date | null} */
export function eolDate(c) {
  return typeof c.eol === 'string' ? parseDate(c.eol) : null;
}

/**
 * Newest cycle that is already released, still supported a year from `asOf`,
 * and (for Node.js) already in LTS. Used for "upgrade to X" hints.
 * @param {EolData} data
 * @param {string} product
 * @param {Date} asOf
 * @returns {string | null}
 */
export function suggestUpgrade(data, product, asOf) {
  const cycles = data.products[product] ?? [];
  const horizon = addDays(asOf, 365);
  for (const c of cycles) {
    const released = c.releaseDate ? parseDate(c.releaseDate) : null;
    if (released && released > asOf) continue;
    const eol = eolDate(c);
    if (c.eol !== false && (!eol || eol <= horizon)) continue;
    if (product === 'nodejs') {
      const lts = typeof c.lts === 'string' ? parseDate(c.lts) : null;
      if (!lts || lts > asOf) continue;
    }
    return c.cycle;
  }
  return null;
}

/** @param {Date | null} d */
export function describeEol(d) {
  return d ? formatDate(d) : 'no EOL date';
}
