import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseDate } from '../src/dates.js';
import { scan } from '../src/scan.js';

/**
 * Scan an in-memory repo. `files` maps relative paths to contents.
 * @param {Record<string, string>} files
 * @param {{ asOf?: string, horizonDays?: number, minConfidence?: 'high'|'medium' }} [opts]
 */
export function scanFiles(files, opts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'timefuse-'));
  try {
    for (const [p, text] of Object.entries(files)) {
      const abs = join(root, p);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
    return scan({
      root,
      asOf: /** @type {Date} */ (parseDate(opts.asOf ?? '2026-10-02')),
      horizonDays: opts.horizonDays ?? 180,
      minConfidence: opts.minConfidence,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** @param {ReturnType<typeof scan>} r */
export const titles = (r) => r.findings.map((f) => f.title);
