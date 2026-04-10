// SPDX-License-Identifier: GPL-3.0-or-later

import type { Diagnostic } from 'vscode-languageserver/node';

export interface ValidatorContext {
  uri: string;
  lineCount: number;
  headerEndLine: number;
  bufferLines: number;
  visibleRanges?: { startLine: number; endLine: number }[];
}

export type ValidatorFn = (
  text: string,
  settings: BioFmtSettings,
  context: ValidatorContext
) => Diagnostic[];

export interface BioFmtSettings {
  validation: {
    level: 'off' | 'basic' | 'strict';
    maxDiagnostics: number;
  };
  lsp: {
    viewportBufferLines: number;
  };
}

export const defaultSettings: BioFmtSettings = {
  validation: {
    level: 'strict',
    maxDiagnostics: 2000,
  },
  lsp: {
    viewportBufferLines: 500,
  },
};

// VCF header types used by both validation and hover
export interface ParsedHeader {
  fileformat?: string;
  info: Map<string, InfoDefinition>;
  format: Map<string, FormatDefinition>;
  filter: Map<string, FilterDefinition>;
  contigs: Map<string, ContigDefinition>;
  samples: string[];
  headerEndLine: number;
}

export interface InfoDefinition {
  id: string;
  number: string;
  type: string;
  description: string;
  line: number;
}

export interface FormatDefinition {
  id: string;
  number: string;
  type: string;
  description: string;
  line: number;
}

export interface FilterDefinition {
  id: string;
  description: string;
  line: number;
}

export interface ContigDefinition {
  id: string;
  length?: number;
  line: number;
}

/**
 * Return true if line `i` should be validated, based on visible editor ranges.
 * Always validates lines before `headerEndLine`. For data lines, validates a
 * buffer around the visible viewport.
 */
export function shouldValidateLine(
  context: ValidatorContext,
  lineIndex: number,
): boolean {
  if (lineIndex < context.headerEndLine) return true;

  const ranges = context.visibleRanges;
  if (ranges && ranges.length > 0) {
    for (const r of ranges) {
      const start = Math.max(context.headerEndLine, r.startLine - context.bufferLines);
      const end = Math.min(context.lineCount, r.endLine + context.bufferLines);
      if (lineIndex >= start && lineIndex <= end) return true;
    }
    return false;
  }

  return lineIndex < context.headerEndLine + context.bufferLines;
}
