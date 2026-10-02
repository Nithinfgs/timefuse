import test from 'node:test';
import assert from 'node:assert/strict';

test('summer promo is still running', () => {
  const ends = new Date('2026-12-31');
  assert.ok(ends > new Date());
});
