import { daysBetween, addDays, formatDate } from '../dates.js';
import { eolDate, lookup, suggestUpgrade } from '../eol.js';

/**
 * @typedef {object} Finding
 * @property {string} rule        stable rule id, e.g. "runtime-eol"
 * @property {Date} date          the day it breaks (UTC)
 * @property {boolean} [approximate]  true when the source only gives a month
 * @property {string} file
 * @property {number} line        1-based
 * @property {string} title
 * @property {string} [fix]
 * @property {'high' | 'medium'} confidence
 * @property {number} [hits]      occurrences folded into this finding
 *
 * @typedef {object} Context
 * @property {import('../eol.js').EolData} eol
 * @property {Date} asOf
 * @property {number} horizonDays
 * @property {any} rules
 *
 * @typedef {object} Detector
 * @property {string} id
 * @property {(path: string) => boolean} appliesTo
 * @property {(file: { path: string, text: string }, ctx: Context) => Finding[]} scan
 */

/** Does `date` fall inside the reporting window (anything past, or within the horizon)? */
/** @param {Date} date @param {Context} ctx */
export function inWindow(date, ctx) {
  return daysBetween(date, ctx.asOf) <= ctx.horizonDays;
}

/**
 * Build a finding for "<product> <version> is (or will be) end-of-life", or
 * nothing when the version is unknown, has no EOL date, or is outside the window.
 *
 * @param {Context} ctx
 * @param {object} p
 * @param {string} p.product   endoflife.date slug
 * @param {string} p.label     display name, e.g. "Node.js"
 * @param {string} p.version
 * @param {string} p.file
 * @param {number} p.line
 * @param {string} p.rule
 * @param {string} [p.where]   what is pinning it, e.g. "Docker base image"
 * @param {'high' | 'medium'} [p.confidence] defaults to high
 * @returns {Finding | null}
 */
export function eolFinding(ctx, p) {
  const cycle = lookup(ctx.eol, p.product, p.version);
  if (!cycle) return null;
  const date = eolDate(cycle);
  if (!date || !inWindow(date, ctx)) return null;
  const past = daysBetween(date, ctx.asOf) <= 0;
  const target = suggestUpgrade(ctx.eol, p.product, ctx.asOf);
  const pin = p.where ? ` (${p.where})` : '';
  return {
    rule: p.rule,
    date,
    file: p.file,
    line: p.line,
    confidence: p.confidence ?? 'high',
    title: `${p.label} ${cycle.cycle}${pin} ${past ? 'is EOL' : 'reaches EOL'}`,
    fix: target ? `Move to ${p.label} ${target} or newer.` : `Move to a supported ${p.label} release.`,
  };
}

/**
 * Iterate lines with 1-based numbers.
 * @param {string} text
 * @returns {Array<[number, string]>}
 */
export function lines(text) {
  return text.split(/\r?\n/).map((l, i) => [i + 1, l]);
}

/** 1-based line number of a character offset. */
/** @param {string} text @param {number} index */
export function lineAt(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** @param {string} path */
export function isTestPath(path) {
  return (
    /(^|\/)(tests?|__tests__|specs?|fixtures?|testdata)\//i.test(path) ||
    /(\.|_)(test|spec)\.[a-z]+$/i.test(path) ||
    /(^|\/)test_[^/]+\.py$/i.test(path)
  );
}

/** Convenience for rules that carry a fixed date. */
/** @param {Date} d @param {number} n */
export function plusDays(d, n) {
  return formatDate(addDays(d, n));
}
