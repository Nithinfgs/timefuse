import test from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { scanFiles, titles } from './helpers.js';

const rules = (/** @type {ReturnType<typeof scanFiles>} */ r) => r.findings.map((f) => f.rule);

test('.nvmrc with an EOL Node is flagged with file and line', () => {
  const r = scanFiles({ '.nvmrc': '18\n' });
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].rule, 'runtime-eol');
  assert.equal(r.findings[0].file, '.nvmrc');
  assert.equal(r.findings[0].line, 1);
  assert.match(r.findings[0].title, /Node\.js 18/);
});

test('a supported runtime far from EOL is not flagged', () => {
  assert.deepEqual(scanFiles({ '.nvmrc': '24\n' }).findings, []);
});

test('engines ">=18" is a floor, not a pin, and is ignored; "^18" is flagged', () => {
  const floor = scanFiles({ 'package.json': '{\n "engines": { "node": ">=18" }\n}' });
  assert.deepEqual(floor.findings, []);
  const pin = scanFiles({ 'package.json': '{\n "engines": { "node": "^18" }\n}' });
  assert.equal(pin.findings.length, 1);
});

test('Dockerfile and compose images, including codenames and registries', () => {
  const r = scanFiles({
    Dockerfile: 'FROM --platform=linux/amd64 docker.io/library/python:3.9-slim AS base\nFROM scratch\nFROM debian:bullseye\nFROM node:${V}\n',
    'compose.yaml': 'services:\n  db:\n    image: "postgres:13"\n',
  });
  const t = titles(r).join('\n');
  assert.match(t, /Python 3\.9/);
  assert.match(t, /Debian 11/);
  assert.match(t, /PostgreSQL 13/);
  assert.equal(r.findings.length, 3);
});

test('workflow setup-* values: scalar, inline list and block list', () => {
  const r = scanFiles({
    '.github/workflows/ci.yml': [
      'jobs:',
      '  a:',
      '    steps:',
      '      - uses: actions/setup-python@v5',
      '        with:',
      '          python-version: ["3.9", "3.13"]',
      '      - uses: actions/setup-node@v4',
      '        with:',
      '          node-version: 18',
      '  b:',
      '    strategy:',
      '      matrix:',
      '        python-version:',
      '          - 3.9',
      '          - 3.13',
    ].join('\n'),
  });
  const hits = r.findings.filter((f) => f.rule === 'runtime-eol');
  assert.deepEqual(hits.map((f) => f.line).sort((a, b) => a - b), [6, 9, 14]);
});

test('retired runner images, deprecated action majors, floating ubuntu-latest', () => {
  const r = scanFiles({
    '.github/workflows/ci.yml': [
      'jobs:',
      '  x:',
      '    runs-on: ubuntu-20.04',
      '    steps:',
      '      - uses: actions/upload-artifact@v3',
      '      - uses: actions/upload-artifact@v4',
      '      - uses: actions/cache@v2',
      '  y:',
      '    runs-on: ubuntu-latest',
    ].join('\n'),
  });
  assert.deepEqual(
    rules(r).sort(),
    ['action-deprecated', 'action-deprecated', 'floating-label', 'runner-eol'],
  );
  const floating = r.findings.find((f) => f.rule === 'floating-label');
  assert.equal(floating?.approximate, true);
  assert.equal(floating?.confidence, 'medium');
});

test('ubuntu-latest is reported once per file, with a count', () => {
  const r = scanFiles({ '.github/workflows/ci.yml': 'a:\n  runs-on: ubuntu-latest\nb:\n  runs-on: ubuntu-latest\n' });
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0].title, /\(2 jobs\)/);
});

test('a multi-version CI matrix is "likely", a single pin is not', () => {
  const wf = (/** @type {string} */ v) => ({ '.github/workflows/ci.yml': `node-version: ${v}\n` });
  assert.equal(scanFiles(wf('[16, 24]')).findings[0].confidence, 'medium');
  assert.equal(scanFiles(wf('16')).findings[0].confidence, 'high');
});

test('minified one-liners do not produce marker findings', () => {
  const long = '(()=>{var a="TODO 2026-10-20";' + 'x'.repeat(500) + '})()';
  assert.deepEqual(scanFiles({ 'bundle.js': long }).findings, []);
});

test('ubuntu-latest is only reported when the date is inside the horizon', () => {
  const far = scanFiles({ '.github/workflows/ci.yml': 'runs-on: ubuntu-latest' }, { asOf: '2026-01-01', horizonDays: 30 });
  assert.deepEqual(far.findings, []);
});

test('dated TODOs: due, overdue, URL dates ignored, suppression honoured', () => {
  const r = scanFiles({
    'a.js': [
      '// TODO(2026-10-20): drop the shim',
      '// FIXME remove after 2026-01-01',
      '// see https://example.com/deprecation-2026-10-20 for context',
      '// timefuse-ignore',
      '// TODO(2026-10-21): intentionally ignored',
      'const releaseDate = "2026-10-22"; // not a deadline',
    ].join('\n'),
    'CHANGELOG.md': '- TODO 2026-10-20 in a changelog is history, not a deadline',
  });
  assert.equal(r.findings.length, 2);
  assert.match(r.findings[0].title, /^Overdue/);
  assert.match(r.findings[1].title, /^Due/);
});

test('markdown: task list items count, prose and inline code do not', () => {
  const r = scanFiles({
    'docs/plan.md': [
      'Remember to remove the shim by 2026-10-20 or else.',
      'An example: `TODO(2026-10-21): inline code`.',
      '- [ ] TODO(2026-10-22): rotate the signing key',
      '| TODO 2026-10-23 | table row |',
    ].join('\n'),
  });
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].line, 3);
});

test('test files with future dates are flagged unless the clock is faked', () => {
  const r = scanFiles({
    'tests/a.test.js': 'const d = new Date("2026-12-01");\nconst e = new Date(2026, 11, 2);\n',
    'tests/b.test.js': 'vi.useFakeTimers();\nconst d = new Date("2026-12-01");\n',
    'src/app.js': 'const d = new Date("2026-12-01");\n',
    'tests/test_c.py': 'x = datetime(2026, 12, 3, 12, 0)\n',
  });
  assert.deepEqual(r.findings.map((f) => f.file).sort(), ['tests/a.test.js', 'tests/a.test.js', 'tests/test_c.py']);
});

test('certificates: expiring PEM is flagged, garbage PEM is skipped', () => {
  const pem = knownCert();
  const r = scanFiles({
    'certs/a.pem': pem,
    'certs/broken.pem': '-----BEGIN CERTIFICATE-----\nnotbase64!!\n-----END CERTIFICATE-----\n',
  }, { asOf: '2026-10-02', horizonDays: 36500 });
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].rule, 'cert-expiry');
  assert.equal(r.findings[0].file, 'certs/a.pem');
  // sanity: the finding date matches the certificate itself
  const expected = new X509Certificate(pem).validToDate.toISOString().slice(0, 10);
  assert.equal(r.findings[0].date.toISOString().slice(0, 10), expected);
});

test('JWTs: expiring token flagged; expired token in tests ignored', () => {
  const tok = (/** @type {string} */ iso) => {
    const b = (/** @type {object} */ o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b({ alg: 'HS256' })}.${b({ exp: Math.floor(Date.parse(iso) / 1000) })}.c2ln`;
  };
  const r = scanFiles({
    'src/a.js': `const t = "${tok('2026-10-20T00:00:00Z')}";`,
    'tests/b.test.js': `const t = "${tok('2020-01-01T00:00:00Z')}";`,
    'src/no-exp.js': `const t = "${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"x"}').toString('base64url')}.";`,
  });
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].rule, 'jwt-expiry');
});

test('--min-confidence high drops "likely" findings', () => {
  const files = { 'tests/a.test.js': 'new Date("2026-12-01")', '.nvmrc': '18' };
  assert.equal(scanFiles(files).findings.length, 2);
  assert.equal(scanFiles(files, { minConfidence: 'high' }).findings.length, 1);
});

test('findings are sorted soonest-first', () => {
  const r = scanFiles({ '.nvmrc': '18', 'a.js': '// TODO(2026-10-10): x' });
  const dates = r.findings.map((f) => f.date.getTime());
  assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
});

/** A self-signed test certificate (public part only), see test/fixtures/README.md. */
function knownCert() {
  return readFileSync(new URL('./fixtures/test-cert.pem', import.meta.url), 'utf8');
}
