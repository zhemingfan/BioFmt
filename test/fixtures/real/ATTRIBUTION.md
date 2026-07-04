# Real fixture attribution

The files under `test/fixtures/real/` are small, sliced excerpts of publicly
redistributable genomics data, vendored so BioFmt is tested against real
caller/portal output. Each is a generated artifact — see `sources.json` for the
authoritative source URL and extraction command, and `provenance/<id>.json` for
the pinned checksum. Regenerate with `npm run fetch:fixtures` (dev only; the test
suite never fetches).

Only redistribution-safe sources are vendored. Sources requiring API resolution,
site-specific redistribution terms, or restrictive licenses (e.g. Manta's
Polyform Strict, 10x Genomics site terms, controlled-access TCGA) are
intentionally excluded.

| Directory | Source | License / terms |
|-----------|--------|-----------------|
| `deepvariant/` | Google DeepVariant golden test outputs | BSD-3-Clause |
| `freebayes/` | freebayes regression baseline | MIT |
| `gridss/` | GRIDSS example SV VCF | GPL-3.0 |
| `giab/` | NIST Genome in a Bottle HG002 (NISTv4.2.1, GRCh38) | Public benchmark, consented for redistribution |
| `1000g/` | IGSR / 1000 Genomes Project phase 3 (20130502) | Open data |
| `gencode/` | GENCODE release 50 (basic annotation) | GENCODE / EMBL-EBI open |
| `ucsc/` | UCSC Genome Browser (chrom.sizes, bigPsl example) | UCSC open download |

Each source retains its own upstream license; this directory does not relicense
the data. BioFmt itself is GPL-3.0.
