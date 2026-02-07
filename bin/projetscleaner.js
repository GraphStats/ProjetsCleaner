#!/usr/bin/env node

const pkg = require('../package.json');

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}

require('../src/index');
