import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEol, lookup, suggestUpgrade } from '../src/eol.js';
import { parseDate } from '../src/dates.js';

const eol = loadEol();

test('lookup maps full versions to release cycles', () => {
  assert.equal(lookup(eol, 'nodejs', '20.11.1')?.cycle, '20');
  assert.equal(lookup(eol, 'nodejs', 'v18')?.cycle, '18');
  assert.equal(lookup(eol, 'python', '3.9.7')?.cycle, '3.9');
  assert.equal(lookup(eol, 'go', '1.22')?.cycle, '1.22');
  assert.equal(lookup(eol, 'ubuntu', '20.04')?.cycle, '20.04');
});

test('lookup understands distro codenames', () => {
  assert.equal(lookup(eol, 'debian', 'bullseye')?.cycle, '11');
  assert.equal(lookup(eol, 'ubuntu', 'jammy')?.cycle, '22.04');
});

test('lookup returns null for unknown products and versions', () => {
  assert.equal(lookup(eol, 'nodejs', 'banana'), null);
  assert.equal(lookup(eol, 'cobol', '1'), null);
});

test('suggestUpgrade picks an LTS Node release that is already in LTS', () => {
  const asOf = /** @type {Date} */ (parseDate('2026-10-02'));
  const pick = suggestUpgrade(eol, 'nodejs', asOf);
  assert.ok(pick);
  assert.ok(Number(pick) % 2 === 0, `expected an even (LTS) major, got ${pick}`);
});
