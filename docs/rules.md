# Diagnostic Rule Reference

BioFmt diagnostics use stable rule codes. Use the editor quick-fix menu on a diagnostic to open this rule reference, open the upstream specification, copy details, or apply a safe fix when one exists.

## Common Rules

<a id="gff3-missing-version"></a>

### GFF3_MISSING_VERSION

GFF3 files must declare the version before feature records, comments, or FASTA content.

Required first line:

```text
##gff-version 3
```

Safe fix: BioFmt can insert `##gff-version 3` at the top of the file. This edit does not change feature coordinates, attributes, or sequence content.

Specification: [GFF3 version directive](https://github.com/The-Sequence-Ontology/Specifications/blob/fe73505276dd324bf6a55773f3413fe2bed47af4/gff3.md?plain=1#L138-L140)

## Other Rules

For other diagnostics, use **BioFmt: Open specification** from the quick-fix menu to jump to the source format document. Use **BioFmt: Copy details** to copy the rule code, summary, and exact specification URL into bug reports or notes.
