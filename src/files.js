import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'target', '.venv', 'venv',
  '__pycache__', 'coverage', '.next', '.nuxt', '.gradle', '.tox', 'Pods',
]);
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tgz',
  '.jar', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mov', '.mp3', '.wasm',
  '.so', '.dylib', '.exe', '.class', '.pyc', '.lock', '.min.js', '.map', '.svg',
]);
const MAX_BYTES = 1_000_000;

/**
 * @param {string} root
 * @returns {string[]} repo-relative POSIX paths
 */
function listPaths(root) {
  try {
    const out = execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 },
    );
    const paths = out.toString('utf8').split('\0').filter(Boolean);
    if (paths.length > 0) return paths;
  } catch {
    // Not a git repository (or git missing): fall through to a plain walk.
  }
  /** @type {string[]} */
  const found = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        found.push(relative(root, join(dir, entry.name)).split(sep).join('/'));
      }
    }
  };
  walk(root);
  return found;
}

/**
 * @param {string} p
 */
function skippable(p) {
  const segments = p.split('/');
  if (segments.slice(0, -1).some((s) => SKIP_DIRS.has(s))) return true;
  const lower = p.toLowerCase();
  for (const ext of SKIP_EXT) if (lower.endsWith(ext)) return true;
  return false;
}

/**
 * Convert a small glob (`*`, `**`, `?`) into a RegExp.
 * @param {string} glob
 */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}(?:/.*)?$`);
}

/**
 * Read every scannable text file under `root`.
 * @param {string} root
 * @param {string[]} [ignoreGlobs]
 * @returns {Array<{ path: string, text: string }>}
 */
export function readRepo(root, ignoreGlobs = []) {
  const ignores = ignoreGlobs.map(globToRegExp);
  /** @type {Array<{ path: string, text: string }>} */
  const files = [];
  for (const p of listPaths(root)) {
    if (skippable(p) || ignores.some((re) => re.test(p))) continue;
    const abs = join(root, p);
    try {
      const st = statSync(abs);
      if (!st.isFile() || st.size > MAX_BYTES) continue;
      const buf = readFileSync(abs);
      if (buf.subarray(0, 4096).includes(0)) continue; // binary
      files.push({ path: p, text: buf.toString('utf8') });
    } catch {
      // Unreadable (permissions, broken symlink, deleted mid-scan): skip it.
    }
  }
  return files;
}
