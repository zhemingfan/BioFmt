// SPDX-License-Identifier: GPL-3.0-or-later

import { render } from '@testing-library/react';
import { FileSizeBanner } from './FileSizeBanner';
import type { DocumentMetadata, PreviewSettings } from '../types';

const settings: PreviewSettings = {
  maxLines: 200000,
  maxBytes: 1000,
  downsampleLimit: 200000,
  sampleColumnLimit: 10,
};

function meta(over: Partial<DocumentMetadata>): DocumentMetadata {
  return {
    lineCount: 10,
    languageId: 'omics-sam',
    fileName: 'reads.sam',
    previewSettings: settings,
    ...over,
  };
}

describe('FileSizeBanner', () => {
  it('renders nothing when the file is within limits', () => {
    const { container } = render(
      <FileSizeBanner
        metadata={meta({ fileSize: 100, previewSettings: { ...settings, maxBytes: 52428800 } })}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('warns and shows format-specific advice when the byte limit is exceeded', () => {
    const { container } = render(<FileSizeBanner metadata={meta({ fileSize: 5000 })} />);
    expect(container.querySelector('.file-size-banner')).not.toBeNull();
    expect(container.textContent).toContain('exceeds preview limits');
    // SAM files get a samtools-based recommendation.
    expect(container.textContent).toContain('samtools');
  });
});
