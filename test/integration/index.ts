// SPDX-License-Identifier: GPL-3.0-or-later

import * as path from 'path';
import Mocha = require('mocha');
import glob = require('glob');

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 10000,
  });

  const testsRoot = path.resolve(__dirname);

  return new Promise((resolve, reject) => {
    glob('**/*.test.ts', { cwd: testsRoot }, (err, files) => {
      if (err) {
        return reject(err);
      }

      // Add files to the test suite
      files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        // Run the mocha test
        mocha.run((failures) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}
