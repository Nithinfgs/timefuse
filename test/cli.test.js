import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/timefuse.js', import.meta.url));
const DEMO = fileURLToPath(new URL('../examples/demo-repo', import.meta.url));

/** @param {string[]} args */
const run = (args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

test('demo repo, text output, exits 0 by default', () => {
  const r = run([DEMO, '--as-of', '2026-10-02']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /ALREADY BROKEN \(10\)/);
  assert.match(r.stdout, /BREAKS WITHIN 30 DAYS \(3\)/);
  assert.match(r.stdout, /16 fuses/);
});

test('--fail-within gates CI', () => {
  assert.equal(run([DEMO, '--as-of', '2026-10-02', '--fail-within', '0d']).status, 1);
  assert.equal(run([DEMO, '--as-of', '2020-01-01', '--within', '30d', '--fail-within', '30d']).status, 0);
});

test('time travel changes the answer', () => {
  const later = run([DEMO, '--as-of', '2027-06-01', '--format', 'json']);
  const parsed = JSON.parse(later.stdout);
  assert.equal(parsed.asOf, '2027-06-01');
  assert.ok(parsed.findings.some((/** @type {{title:string,status:string}} */ f) => /Certificate/.test(f.title) && f.status === 'broken'));
});

test('--brief prints one line per finding', () => {
  const r = run([DEMO, '--as-of', '2026-10-02', '--brief']);
  assert.doesNotMatch(r.stdout, /→/);
  assert.match(r.stdout, /\.nvmrc:1/);
});

test('json and markdown formats', () => {
  const json = JSON.parse(run([DEMO, '--as-of', '2026-10-02', '--format', 'json']).stdout);
  assert.equal(json.tool, 'timefuse');
  assert.equal(json.findings.length, 16);
  assert.equal(typeof json.findings[0].daysUntil, 'number');
  const md = run([DEMO, '--as-of', '2026-10-02', '--format', 'markdown']).stdout;
  assert.match(md, /\| When \| Status \| What \| Where \|/);
});

test('invalid input exits 2 with a message on stderr', () => {
  const bad = run([DEMO, '--as-of', '2026-02-31']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--as-of/);
  assert.equal(run(['/definitely/not/here']).status, 2);
  assert.equal(run([DEMO, '--within', 'soon']).status, 2);
});

test('.timefuse.json: ignore globs and disabled rules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'timefuse-cfg-'));
  try {
    writeFileSync(join(dir, '.nvmrc'), '18\n');
    writeFileSync(join(dir, 'a.js'), '// TODO(2026-10-10): x\n');
    writeFileSync(join(dir, '.timefuse.json'), JSON.stringify({ disableRules: ['runtime-eol'] }));
    const r = JSON.parse(run([dir, '--as-of', '2026-10-02', '--format', 'json']).stdout);
    assert.deepEqual(r.findings.map((/** @type {{rule:string}} */ f) => f.rule), ['dated-marker']);
    writeFileSync(join(dir, '.timefuse.json'), JSON.stringify({ ignore: ['a.js'] }));
    const r2 = JSON.parse(run([dir, '--as-of', '2026-10-02', '--format', 'json']).stdout);
    assert.deepEqual(r2.findings.map((/** @type {{rule:string}} */ f) => f.rule), ['runtime-eol']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--help and --version', () => {
  assert.match(run(['--help']).stdout, /Usage/);
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/);
});
