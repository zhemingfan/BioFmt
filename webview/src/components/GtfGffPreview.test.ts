// SPDX-License-Identifier: GPL-3.0-or-later

import { parseAttributes } from './GtfGffPreview';

describe('GtfGffPreview parseAttributes', () => {
  describe('GFF3', () => {
    it('does not throw on a literal % in an attribute value (regression)', () => {
      // decodeURIComponent('50% coverage') throws URIError, which used to unmount
      // the whole GFF3 table preview. It must now tolerate a bare '%'.
      expect(() => parseAttributes('ID=g1;Note=50% coverage', true)).not.toThrow();
      const attrs = parseAttributes('ID=g1;Note=50% coverage', true);
      expect(attrs.Note).toBe('50% coverage');
    });

    it('still percent-decodes valid escapes', () => {
      const attrs = parseAttributes('ID=g1;Note=a%2Cb%20c', true);
      expect(attrs.Note).toBe('a,b c');
    });
  });

  describe('GTF', () => {
    it('parses quoted key/value attributes', () => {
      const attrs = parseAttributes('gene_id "g1"; transcript_id "t1";', false);
      expect(attrs.gene_id).toBe('g1');
      expect(attrs.transcript_id).toBe('t1');
    });
  });
});
