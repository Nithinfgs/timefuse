export const DAY_MS = 86_400_000;

/**
 * Parse a strict YYYY-MM-DD string into a UTC-midnight Date. Returns null for
 * anything that is not a real calendar date (e.g. 2026-02-31).
 * @param {string} s
 * @returns {Date | null}
 */
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/** @param {Date} d */
export function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

/** Drop the time-of-day part, keeping the UTC calendar day. */
/** @param {Date} d */
export function startOfDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function today() {
  return startOfDay(new Date());
}

/**
 * Whole days from `from` to `to` (negative when `to` is in the past).
 * @param {Date} to
 * @param {Date} from
 */
export function daysBetween(to, from) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** @param {Date} d @param {number} days */
export function addDays(d, days) {
  return new Date(d.getTime() + days * DAY_MS);
}

/**
 * Parse "30d", "12w", "6m" or "1y" into a number of days.
 * @param {string} s
 * @returns {number}
 */
export function parseDuration(s) {
  const m = /^(\d+)\s*([dwmy])$/i.exec(s.trim());
  if (!m) throw new Error(`Invalid duration "${s}". Use forms like 30d, 12w, 6m, 1y.`);
  const n = Number(m[1]);
  const unit = /** @type {'d'|'w'|'m'|'y'} */ (m[2].toLowerCase());
  return n * { d: 1, w: 7, m: 30, y: 365 }[unit];
}

/**
 * Human wording for a signed day count.
 * @param {number} days
 */
export function relative(days) {
  if (days === 0) return 'today';
  const n = Math.abs(days);
  const span = n >= 365 ? `${(n / 365).toFixed(1).replace(/\.0$/, '')}y` : `${n}d`;
  return days < 0 ? `${span} ago` : `in ${span}`;
}
