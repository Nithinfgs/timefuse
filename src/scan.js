import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { daysBetween } from './dates.js';
import { loadEol } from './eol.js';
import { readRepo } from './files.js';
import { actionRules, runnerImages } from './detectors/actions.js';
import { certificates, jwts } from './detectors/credentials.js';
import { datedMarkers, testDates } from './detectors/dates.js';
import { containerImages, versionFiles, workflowSetup } from './detectors/runtimes.js';

/** @typedef {import('./detectors/util.js').Finding} Finding */

export const DETECTORS = [
  versionFiles, containerImages, workflowSetup,
  runnerImages, actionRules,
  certificates, jwts,
  datedMarkers, testDates,
];

const RULES_PATH = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'data', 'rules.json');

/**
 * @typedef {object} ScanOptions
 * @property {string} root
 * @property {Date} asOf
 * @property {number} horizonDays
 * @property {'high' | 'medium'} [minConfidence]
 * @property {string[]} [ignore]       path globs
 * @property {string[]} [disableRules] rule ids to skip
 * @property {string} [eolFile]
 *
 * @typedef {object} ScanResult
 * @property {Finding[]} findings   sorted by date, then file, then line
 * @property {number} filesScanned
 * @property {string} eolDataDate
 */

/**
 * @param {ScanOptions} opts
 * @returns {ScanResult}
 */
export function scan(opts) {
  const eol = loadEol(opts.eolFile);
  const rules = JSON.parse(readFileSync(RULES_PATH, 'utf8'));
  const ctx = { eol, asOf: opts.asOf, horizonDays: opts.horizonDays, rules };
  const disabled = new Set(opts.disableRules ?? []);
  const files = readRepo(opts.root, opts.ignore);

  /** @type {Finding[]} */
  let findings = [];
  for (const file of files) {
    for (const d of DETECTORS) {
      if (!d.appliesTo(file.path)) continue;
      findings.push(...d.scan(file, ctx));
    }
  }

  findings = findings.filter((f) => !disabled.has(f.rule));
  if (opts.minConfidence === 'high') findings = findings.filter((f) => f.confidence === 'high');

  const seen = new Set();
  findings = findings.filter((f) => {
    const key = `${f.rule}|${f.file}|${f.line}|${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  findings.sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
  return { findings, filesScanned: files.length, eolDataDate: eol.generatedAt };
}

/**
 * Bucket a finding by how soon it breaks.
 * @param {Finding} f
 * @param {Date} asOf
 * @returns {'broken' | 'd30' | 'd90' | 'later'}
 */
export function bucket(f, asOf) {
  const days = daysBetween(f.date, asOf);
  if (days <= 0) return 'broken';
  if (days <= 30) return 'd30';
  if (days <= 90) return 'd90';
  return 'later';
}
