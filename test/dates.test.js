import test from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, parseDate, parseDuration, relative } from '../src/dates.js';

test('parseDate accepts real dates and rejects impossible ones', () => {
  assert.equal(parseDate('2026-02-28')?.toISOString(), '2026-02-28T00:00:00.000Z');
  assert.equal(parseDate('2026-02-31'), null);
  assert.equal(parseDate('2026-2-3'), null);
  assert.equal(parseDate('nonsense'), null);
});

test('daysBetween is signed and ignores time of day', () => {
  const a = parseDate('2026-10-02');
  const b = parseDate('2026-10-12');
  assert.ok(a && b);
  assert.equal(daysBetween(b, a), 10);
  assert.equal(daysBetween(a, b), -10);
  assert.equal(daysBetween(a, new Date('2026-10-02T23:59:00Z')), 0);
});

test('parseDuration understands d/w/m/y and rejects junk', () => {
  assert.equal(parseDuration('30d'), 30);
  assert.equal(parseDuration('2w'), 14);
  assert.equal(parseDuration('6m'), 180);
  assert.equal(parseDuration('1y'), 365);
  assert.throws(() => parseDuration('soon'), /Invalid duration/);
});

test('relative wording', () => {
  assert.equal(relative(0), 'today');
  assert.equal(relative(-5), '5d ago');
  assert.equal(relative(18), 'in 18d');
  assert.equal(relative(730), 'in 2y');
});
