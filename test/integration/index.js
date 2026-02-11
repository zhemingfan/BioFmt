// SPDX-License-Identifier: MIT
// Copyright (c) 2024 BioFmt Contributors

const path = require('path');
const tsNode = require('ts-node');

// Ensure TS tests can be loaded by the extension host
tsNode.register({
  project: path.resolve(__dirname, '../../tsconfig.json'),
  transpileOnly: true,
});

module.exports = require('./index.ts');
