import { daysBetween, parseDate } from '../dates.js';
import { inWindow, isTestPath, lines } from './util.js';

const KEYWORDS =
  /\b(TODO|FIXME|HACK|XXX|REMOVE|DROP|DEPRECAT\w*|SUNSET|EXPIR\w*|TEMP(?:ORARY)?|WORKAROUND|REVISIT|DELETE|CLEAN\s?UP)\b/i;
const STRONG = /\b(TODO|FIXME|REMOVE|DROP|DEPRECAT\w*|SUNSET|DELETE)\b/i;
const COMMENT = /(\/\/|#|\/\*|<!--|--|;|^\s*\*)/;
const ISO = /\b(20\d{2}-\d{2}-\d{2})\b/g;
const SKIP_FILE = /(^|\/)(CHANGELOG|HISTORY|RELEASES?|NEWS)[^/]*$|\.lock$|package-lock\.json$/i;
const SUPPRESS = /timefuse-ignore/;
const PROSE_FILE = /\.(md|mdx|markdown|txt|rst|adoc)$/i;

/**
 * Dated markers in comments, e.g. a TODO tagged with a due date. // timefuse-ignore
 * @type {import('./util.js').Detector}
 */
export const datedMarkers = {
  id: 'dated-marker',
  appliesTo: (p) => !SKIP_FILE.test(p),
  scan({ path, text }, ctx) {
    if (!/\d{4}-\d{2}-\d{2}/.test(text)) return [];
    /** @type {import('./util.js').Finding[]} */
    const out = [];
    const ls = lines(text);
    ls.forEach(([n, l], idx) => {
      if (l.length > 400) return; // minified bundle, not a human-written deadline
      // URLs often carry both a date and words like "deprecation"; neither is a deadline.
      let bare = l.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ');
      if (PROSE_FILE.test(path)) {
        // In prose files only real tasks count: list items and checkboxes, not sentences or `code` examples.
        if (!/^\s*(?:[-*+]|\d+\.)\s/.test(bare)) return;
        bare = bare.replace(/`[^`]*`/g, ' ');
      }
      if (!KEYWORDS.test(bare) || SUPPRESS.test(l) || (idx > 0 && SUPPRESS.test(ls[idx - 1][1]))) return;
      for (const m of bare.matchAll(ISO)) {
        const date = parseDate(m[1]);
        if (!date || !inWindow(date, ctx)) continue;
        const gone = daysBetween(date, ctx.asOf) <= 0;
        const text = bare.trim().replace(/\s+/g, ' ');
        out.push({
          rule: 'dated-marker',
          date,
          file: path,
          line: n,
          confidence: STRONG.test(bare) && COMMENT.test(bare) ? 'high' : 'medium',
          title: `${gone ? 'Overdue' : 'Due'}: ${text.length > 56 ? text.slice(0, 53) + '…' : text}`,
          fix: gone ? 'Do the thing, or move the date and say why.' : undefined,
        });
      }
    });
    return out;
  },
};

const FAKE_CLOCK =
  /\b(useFakeTimers|setSystemTime|freezegun|freeze_time|time[-_]machine|travel\(|mockdate|MockDate|timekeeper|jest\.spyOn\(Date|vi\.useFakeTimers|Clock\.fixed|clock\.Mock|faketime)\b/i;

/**
 * Hard-coded near-future dates in tests. If a test treats that date as "later",
 * it flips the day the real clock passes it.
 * @type {import('./util.js').Detector}
 */
export const testDates = {
  id: 'test-future-date',
  appliesTo: (p) => isTestPath(p),
  scan({ path, text }, ctx) {
    if (FAKE_CLOCK.test(text)) return [];
    /** @type {import('./util.js').Finding[]} */
    const out = [];
    for (const [n, l] of lines(text)) {
      if (SUPPRESS.test(l)) continue;
      /** @type {Date[]} */
      const found = [];
      for (const m of l.matchAll(/["'`](20\d{2}-\d{2}-\d{2})(?:T[\d:.]+Z?)?["'`]/g)) {
        const d = parseDate(m[1]);
        if (d) found.push(d);
      }
      // new Date(2026, 11, 31): JS months are zero-based.
      for (const m of l.matchAll(/new Date\(\s*(20\d{2})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})/g)) {
        const d = parseDate(`${m[1]}-${String(Number(m[2]) + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}`);
        if (d) found.push(d);
      }
      // Python date(2026, 12, 31) / datetime(2026, 12, 31, ...)
      for (const m of l.matchAll(/\b(?:date|datetime)\(\s*(20\d{2})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})/g)) {
        const d = parseDate(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
        if (d) found.push(d);
      }
      for (const date of found) {
        if (daysBetween(date, ctx.asOf) <= 0 || !inWindow(date, ctx)) continue;
        out.push({
          rule: 'test-future-date',
          date,
          file: path,
          line: n,
          confidence: 'medium',
          title: 'Test hard-codes a future date',
          fix: 'Freeze the clock in the test, or compute the date relative to now.',
        });
      }
    }
    return out;
  },
};
