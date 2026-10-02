import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp } from '../src/files.js';

test('globToRegExp: directories, double-star, single-star', () => {
  assert.ok(globToRegExp('examples/**').test('examples/demo/src/a.js'));
  assert.ok(globToRegExp('examples').test('examples/demo/a.js'));
  assert.ok(globToRegExp('**/*.pem').test('a/b/c.pem'));
  assert.ok(globToRegExp('**/*.pem').test('c.pem'));
  assert.ok(globToRegExp('*.md').test('README.md'));
  assert.ok(!globToRegExp('*.md').test('docs/README.md'));
  assert.ok(!globToRegExp('examples/**').test('src/examples.js'));
});
