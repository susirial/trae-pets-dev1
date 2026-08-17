#!/usr/bin/env node
'use strict';

// Thin launcher for the compiled, dependency-free hook CLI.
// `npm run build:cli` (tsup) produces dist/cli.cjs.
const path = require('node:path');
const fs = require('node:fs');

const candidates = [
  path.resolve(__dirname, '..', 'dist', 'cli.cjs'),
  // Packaged layout: extraResources places the CLI under <resources>/cli.
  path.resolve(__dirname, '..', 'cli', 'cli.cjs'),
];

const entry = candidates.find((file) => fs.existsSync(file));
if (!entry) {
  process.stderr.write('[trae-pet] CLI bundle not found. Run "npm run build:cli" first.\n');
  process.exit(1);
}

const mod = require(entry);
const run = mod.run || (mod.default && mod.default.run);
if (typeof run !== 'function') {
  process.stderr.write('[trae-pet] Invalid CLI bundle: missing run().\n');
  process.exit(1);
}

run(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`[trae-pet] ${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
