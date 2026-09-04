#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const distEntry = path.join(root, 'dist', 'cli.js');

if (!fs.existsSync(distEntry)) {
  try {
    execFileSync('npx', ['tsc'], { cwd: root, stdio: 'inherit' });
  } catch (err) {
    console.error('xodus-desktop: build failed —', err.message);
    process.exit(1);
  }
}

require(distEntry).runCli(process.argv);
