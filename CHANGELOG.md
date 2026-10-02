# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-03

### Added
- Nine detectors: runtime EOL, container image EOL, CI runner retirement, deprecated action majors, floating `ubuntu-latest`, certificate expiry, JWT expiry, dated TODO markers, hard-coded future dates in tests.
- `--as-of` time travel, `--within` horizon, `--fail-within` CI gate, `--format text|json|markdown`, `--brief`, `--min-confidence`.
- `.timefuse.json` config and `timefuse-ignore` line suppression.
- Bundled endoflife.date snapshot and `timefuse update-data`.
- Demo repository under `examples/demo-repo`.
