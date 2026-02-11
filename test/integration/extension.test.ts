// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('BioFmt Extension', () => {
  const fixturesPath = path.join(__dirname, '..', 'fixtures');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('biofmt.biofmt'));
  });

  test('Should register BioFmt commands', async () => {
    const extension = vscode.extensions.getExtension('biofmt.biofmt');
    assert.ok(extension, 'Extension should be available');
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);

    assert.ok(
      commands.includes('biofmt.openPreview'),
      'openPreview command should be registered'
    );
    assert.ok(
      commands.includes('biofmt.openFixture'),
      'openFixture command should be registered'
    );
  });

  test('VCF file should be recognized', async () => {
    const vcfPath = path.join(fixturesPath, 'example.vcf');
    const doc = await vscode.workspace.openTextDocument(vcfPath);

    // The language should be detected as omics-vcf due to firstLine matching
    assert.strictEqual(
      doc.languageId,
      'omics-vcf',
      'VCF file should be recognized as omics-vcf'
    );
  });

  test('SAM file should be recognized', async () => {
    const samPath = path.join(fixturesPath, 'toy.sam');
    const doc = await vscode.workspace.openTextDocument(samPath);

    assert.strictEqual(
      doc.languageId,
      'omics-sam',
      'SAM file should be recognized as omics-sam'
    );
  });

  test('BED file should be recognized', async () => {
    const bedPath = path.join(fixturesPath, 'bedExample.bed');
    const doc = await vscode.workspace.openTextDocument(bedPath);

    assert.strictEqual(
      doc.languageId,
      'omics-bed',
      'BED file should be recognized as omics-bed'
    );
  });
});
