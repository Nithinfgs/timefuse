# How timefuse works

```
bin/timefuse.js        entry point
src/cli.js             argument parsing, config, exit codes
src/scan.js            runs every detector over every file, sorts and de-duplicates
src/files.js           lists files via `git ls-files` (honours .gitignore), falls back to a directory walk
src/eol.js             loads data/eol.json (or a newer cache), maps "20.11.1" -> Node cycle "20"
src/report.js          text / json / markdown output
src/detectors/*.js     one module per family of rule
data/eol.json          endoflife.date snapshot (refreshed with `timefuse update-data`)
data/rules.json        hand-maintained rules with source links
```

## The detector contract

```js
/** @type {import('./util.js').Detector} */
export const myDetector = {
  id: 'my-rule',
  appliesTo: (path) => path.endsWith('.toml'),
  scan({ path, text }, ctx) {
    // ctx.asOf        Date: the "today" everything is measured against
    // ctx.horizonDays number: how far ahead to report
    // ctx.eol         loaded EOL data
    // ctx.rules       data/rules.json
    return [{ rule: 'my-rule', date, file: path, line: 1, title: '...', fix: '...', confidence: 'high' }];
  },
};
```

Register it in `DETECTORS` in `src/scan.js`. Use `inWindow(date, ctx)` so findings past the horizon are dropped, and `eolFinding(...)` when the date comes from endoflife.date.

## Design rules

1. **Deterministic.** Never call `Date.now()` in a detector. Use `ctx.asOf`.
2. **Read-only and offline.** The only network call is `update-data`.
3. **Say how sure you are.** Anything heuristic gets `confidence: 'medium'`.
4. **Cite sources.** Every hand-written rule in `data/rules.json` has a `source` URL.
5. **No runtime dependencies.** Node's standard library is enough (`crypto.X509Certificate` parses certificates).

## Version matching

`lookup(data, product, version)` tries the version with progressively fewer segments (`3.9.7`, `3.9`, `3`) against the product's cycles, and also matches distro codenames (`bullseye`, `jammy`). Unknown versions return `null` and are silently skipped, so an unfamiliar tag never causes a false alarm.
