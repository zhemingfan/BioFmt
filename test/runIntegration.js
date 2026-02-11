// SPDX-License-Identifier: MIT
// Copyright (c) 2024 BioFmt Contributors

/**
 * Integration test runner for BioFmt extension.
 * Uses @vscode/test-electron to run tests in a VS Code instance.
 */

const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '..');

    // The path to the test runner script
    const extensionTestsPath = path.resolve(__dirname, 'integration', 'index.js');

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-extensions', // Disable other extensions during testing
      ],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
