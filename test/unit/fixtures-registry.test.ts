// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs';
import * as path from 'path';
import { FIXTURES, FIXTURES_DIR, getFixturePath } from '../fixtures.index';

/**
 * Fixture Registry Integrity Tests
 *
 * Verifies that every fixture registered in fixtures.index.ts
 * actually exists on disk and has non-empty content.
 */

describe('Fixture Registry', () => {
  it('should have at least one fixture', () => {
    const ids = Object.keys(FIXTURES);
    assert.ok(ids.length > 0, 'Fixture registry should not be empty');
  });

  it('should have a valid fixtures directory', () => {
    assert.ok(fs.existsSync(FIXTURES_DIR), `Fixtures directory does not exist: ${FIXTURES_DIR}`);
  });

  for (const [id, info] of Object.entries(FIXTURES)) {
    describe(`fixture: ${id}`, () => {
      it('should exist on disk', () => {
        const fullPath = path.join(FIXTURES_DIR, info.path);
        assert.ok(fs.existsSync(fullPath), `Missing fixture file: ${info.path}`);
      });

      it('should have non-empty content', () => {
        const fullPath = path.join(FIXTURES_DIR, info.path);
        if (!fs.existsSync(fullPath)) return; // skip if missing (caught above)
        const stat = fs.statSync(fullPath);
        assert.ok(stat.size > 0, `Fixture file is empty: ${info.path}`);
      });

      it('should have a valid languageId', () => {
        assert.ok(
          info.languageId.startsWith('omics-') || info.languageId === 'plaintext',
          `Invalid languageId "${info.languageId}" for fixture ${id}`
        );
      });

      it('should be retrievable via getFixturePath', () => {
        const result = getFixturePath(id);
        assert.ok(result.endsWith(info.path), `getFixturePath mismatch for ${id}`);
      });
    });
  }
});

import * as assert from 'assert';
