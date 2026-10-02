import { parseDate, daysBetween } from '../dates.js';
import { eolDate, lookup } from '../eol.js';
import { inWindow, lines } from './util.js';

const WORKFLOW = /(^|\/)\.github\/(workflows\/[^/]+|actions\/[^/]+\/action)\.ya?ml$/;
const RUNNER_LABEL = /(?<![\w.-])(ubuntu-\d\d\.\d\d(?:-arm)?|macos-\d+(?:-(?:intel|large|xlarge))?|windows-\d{4})(?![\w.])/g;

/** @param {string} label @returns {string} slug used by endoflife.date */
function runnerCycle(label) {
  return label.replace(/-arm$/, '-arm64');
}

/** @type {import('./util.js').Detector} */
export const runnerImages = {
  id: 'runner-eol',
  appliesTo: (p) => WORKFLOW.test(p),
  scan({ path, text }, ctx) {
    /** @type {import('./util.js').Finding[]} */
    const out = [];
    for (const [n, l] of lines(text)) {
      if (/^\s*#/.test(l)) continue;
      for (const m of l.matchAll(RUNNER_LABEL)) {
        const cycle = lookup(ctx.eol, 'github-actions-runner-images', runnerCycle(m[1]));
        if (!cycle || cycle.cycle !== runnerCycle(m[1])) continue;
        const date = eolDate(cycle);
        if (!date || !inWindow(date, ctx)) continue;
        const gone = daysBetween(date, ctx.asOf) <= 0;
        out.push({
          rule: 'runner-eol',
          date,
          file: path,
          line: n,
          confidence: 'high',
          title: `Runner image ${m[1]} ${gone ? 'was retired' : 'will be retired'}`,
          fix: 'Switch runs-on to a newer image label (jobs on retired images fail outright).',
        });
      }
    }
    return out;
  },
};

/**
 * Deprecated action majors and floating labels, from data/rules.json.
 * @type {import('./util.js').Detector}
 */
export const actionRules = {
  id: 'action-deprecated',
  appliesTo: (p) => WORKFLOW.test(p),
  scan({ path, text }, ctx) {
    /** @type {import('./util.js').Finding[]} */
    const out = [];
    /** @type {Array<{action:string,majors:number[],date:string,title:string,fix:string}>} */
    const actions = ctx.rules.actions ?? [];
    /** @type {Array<{label:string,date:string,approximate?:boolean,title:string,fix:string}>} */
    const floating = ctx.rules.floatingLabels ?? [];
    for (const [n, l] of lines(text)) {
      if (/^\s*#/.test(l)) continue;
      const use = /\buses:\s*["']?([\w.-]+\/[\w./-]+)@([\w.-]+)/.exec(l);
      if (use) {
        const major = /^v?(\d+)/.exec(use[2]);
        if (major) {
          for (const r of actions) {
            if (r.action !== use[1] || !r.majors.includes(Number(major[1]))) continue;
            const date = parseDate(r.date);
            if (date && inWindow(date, ctx)) {
              out.push({
                rule: 'action-deprecated', date, file: path, line: n,
                confidence: 'high', title: r.title, fix: r.fix,
              });
            }
          }
        }
      }
      for (const r of floating) {
        const re = new RegExp(`(?<![\\w.-])${r.label}(?![\\w.-])`);
        if (!re.test(l) || !/runs-on|os:|^\s*-\s/.test(l)) continue;
        const date = parseDate(r.date);
        if (date && inWindow(date, ctx)) {
          const prior = out.find((f) => f.rule === 'floating-label' && f.title.startsWith(r.title));
          if (prior) {
            prior.hits = (prior.hits ?? 1) + 1;
            prior.title = `${r.title} (${prior.hits} jobs)`;
            continue;
          }
          out.push({
            rule: 'floating-label', date, approximate: r.approximate, file: path, line: n,
            confidence: 'medium', title: r.title, fix: r.fix,
          });
        }
      }
    }
    return out;
  },
};
