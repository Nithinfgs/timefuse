# Contributing to timefuse

Thanks for helping. The most valuable contributions are **new detectors**, **new data rules**, and **false-positive reports**.

## Setup

```bash
git clone https://github.com/Nithinfgs/timefuse && cd timefuse
npm install        # dev dependencies only (typescript, @types/node)
npm test
npm run typecheck
npm run demo
```

Requires Node.js 22+. The tool has zero runtime dependencies and we would like to keep it that way.

## Adding a data rule (easiest)

Edit `data/rules.json`: add an entry to `actions` or `floatingLabels` with a real `date` and a `source` URL. Add a case to `test/detectors.test.js`.

## Adding a detector

1. Read [docs/how-it-works.md](docs/how-it-works.md) for the contract.
2. Create or extend a file under `src/detectors/` and register it in `src/scan.js`.
3. Use `ctx.asOf` (never the real clock) and `inWindow()`.
4. Mark heuristics `confidence: 'medium'`.
5. Add tests that cover a hit, a near-miss, and a case outside the horizon.

## Pull requests

- Keep PRs focused; one detector or rule per PR is ideal.
- `npm test` and `npm run typecheck` must pass.
- Update `CHANGELOG.md` under "Unreleased".
- Commit style: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`.

## Reporting a false positive

Open an issue using the "False positive" template with the offending line and the finding text. Those reports directly improve the heuristics.
