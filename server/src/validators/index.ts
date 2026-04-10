// SPDX-License-Identifier: GPL-3.0-or-later

import type { ValidatorFn } from './types';
import { validateVcf } from './vcf';
import { validateBed } from './bed';
import { validateBedpe } from './bedpe';
import { validateSam } from './sam';
import { validateGtf } from './gtf';
import { validateGff3 } from './gff3';
import { validatePaf } from './paf';
import { validatePsl } from './psl';
import { validateWig } from './wig';
import { validateBedGraph } from './bedgraph';
import { validateFasta } from './fasta';
import { validateFastq } from './fastq';

const VALIDATOR_MAP = new Map<string, ValidatorFn>([
  ['omics-vcf', validateVcf],
  ['omics-bed', validateBed],
  ['omics-narrowpeak', validateBed],
  ['omics-broadpeak', validateBed],
  ['omics-bedpe', validateBedpe],
  ['omics-sam', validateSam],
  ['omics-gtf', validateGtf],
  ['omics-gff3', validateGff3],
  ['omics-paf', validatePaf],
  ['omics-psl', validatePsl],
  ['omics-wig', validateWig],
  ['omics-bedgraph', validateBedGraph],
  ['omics-fasta', validateFasta],
  ['omics-fastq', validateFastq],
]);

export function getValidator(languageId: string): ValidatorFn | undefined {
  return VALIDATOR_MAP.get(languageId);
}

// Re-export individual validators for direct test imports
export { validateVcf } from './vcf';
export { validateBed } from './bed';
export { validateBedpe } from './bedpe';
export { validateSam } from './sam';
export { validateGtf } from './gtf';
export { validateGff3 } from './gff3';
export { validatePaf } from './paf';
export { validatePsl } from './psl';
export { validateWig } from './wig';
export { validateBedGraph } from './bedgraph';
export { validateFasta } from './fasta';
export { validateFastq } from './fastq';
