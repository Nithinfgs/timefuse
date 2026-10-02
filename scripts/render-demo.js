// Renders the real CLI output as a self-contained SVG terminal screenshot.
// Usage: node scripts/render-demo.js   (writes docs/assets/demo.svg)
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = ['bin/timefuse.js', 'examples/demo-repo', '--as-of', '2026-10-02', '--brief'];
const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '1', NO_COLOR: '' } });
if (run.status !== 0) throw new Error(run.stderr);

/** @type {Record<number, string>} */
const COLORS = { 31: '#ff7b72', 32: '#7ee787', 33: '#e3b341', 36: '#79c0ff', 90: '#8b949e' };
const FG = '#e6edf3';

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Parse SGR sequences into [{text, color, bold, dim}] runs. */
/** @param {string} line */
function runs(line) {
  /** @type {Array<{text:string,color:string,bold:boolean,dim:boolean}>} */
  const out = [];
  let state = { color: FG, bold: false, dim: false };
  let last = 0;
  for (const m of line.matchAll(/\x1b\[(\d+)m/g)) {
    if ((m.index ?? 0) > last) out.push({ text: line.slice(last, m.index ?? 0), ...state });
    last = (m.index ?? 0) + m[0].length;
    const code = Number(m[1]);
    if (code === 1) state = { ...state, bold: true };
    else if (code === 2) state = { ...state, dim: true };
    else if (code === 22) state = { ...state, bold: false, dim: false };
    else if (code === 39) state = { ...state, color: FG };
    else if (COLORS[code]) state = { ...state, color: COLORS[code] };
  }
  if (last < line.length) out.push({ text: line.slice(last), ...state });
  return out;
}

const prompt = '$ timefuse examples/demo-repo --as-of 2026-10-02 --brief';
const body = run.stdout.replace(/\n$/, '').split('\n');
const plain = (/** @type {string} */ l) => l.replace(/\x1b\[\d+m/g, '');
const cols = Math.max(prompt.length, ...body.map((l) => [...plain(l)].length));
const CW = 9.6, LH = 20, PAD = 24, TOP = 52;
const width = Math.ceil(cols * CW + PAD * 2);
const height = TOP + (body.length + 2) * LH + PAD;

const rows = [];
rows.push(`<text x="${PAD}" y="${TOP + LH}" fill="${COLORS[90]}">$</text><text x="${PAD + CW * 2}" y="${TOP + LH}" fill="${FG}">${esc(prompt.slice(2))}</text>`);
body.forEach((line, i) => {
  const y = TOP + (i + 2) * LH + LH;
  const spans = runs(line)
    .map((r) => `<tspan fill="${r.color}"${r.bold ? ' font-weight="700"' : ''}${r.dim ? ' opacity="0.7"' : ''}>${esc(r.text)}</tspan>`)
    .join('');
  rows.push(`<text x="${PAD}" y="${y}" xml:space="preserve">${spans}</text>`);
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="timefuse output for the demo repository: 16 findings, 10 already broken">
<rect width="${width}" height="${height}" rx="10" fill="#0d1117"/>
<rect width="${width}" height="36" rx="10" fill="#161b22"/><rect y="26" width="${width}" height="10" fill="#161b22"/>
<circle cx="22" cy="18" r="6" fill="#ff5f56"/><circle cx="42" cy="18" r="6" fill="#ffbd2e"/><circle cx="62" cy="18" r="6" fill="#27c93f"/>
<g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace" font-size="13">
${rows.join('\n')}
</g>
</svg>
`;
const out = join(root, 'docs', 'assets', 'demo.svg');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, svg);
console.log(`wrote ${out} (${(svg.length / 1024).toFixed(1)} KB)`);
