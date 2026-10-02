#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`timefuse: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 2;
  },
);
