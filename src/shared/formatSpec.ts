// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Declarative format spec.
 *
 * One JSON file per format under `/formats/*.json` describes how to tokenize,
 * validate, and render a bioinformatics text format — no TypeScript required.
 * `scripts/gen-formats.ts` fans these specs out to TextMate grammars, language
 * configurations, the VS Code manifest, and a generated module consumed by the
 * extension and LSP server. This interface is the single contract shared by the
 * generator and all three consumers; `/formats/_schema.json` mirrors it for
 * editor-time validation.
 */

export type ColumnScalarType = 'string' | 'int' | 'number';

// ---- 1. IDENTITY ----

export interface IdentityLanguageConfiguration {
  /** Line comment marker, e.g. "#". Omit for formats without comments. */
  lineComment?: string;
  /** Word pattern regex. Defaults to a basic identifier pattern when omitted. */
  wordPattern?: string;
  /** Bracket pairs, e.g. [["<", ">"]]. */
  brackets?: [string, string][];
}

export interface FormatIdentity {
  /** Language id; must start with "omics-". */
  languageId: string;
  displayName: string;
  aliases: string[];
  /** File extensions including the leading dot, e.g. ".sizes". */
  extensions: string[];
  /** Exact filenames (no extension), e.g. "chrom.sizes". */
  filenames?: string[];
  /** Optional first-line detection regex (string form). */
  firstLine?: string | null;
  /** TextMate scope name, e.g. "source.chrom-sizes". */
  scopeName: string;
  languageConfiguration?: IdentityLanguageConfiguration;
}

// ---- 2. TOKENIZE (generates a TextMate grammar) ----

export interface TokenizeColumn {
  name: string;
  type: ColumnScalarType;
  /** TextMate scope base (without the per-format suffix), e.g. "constant.numeric.size". */
  scope: string;
}

export interface TokenizeColumnsLineKind {
  name: string;
  kind: 'columns';
  columns: TokenizeColumn[];
  /** "optional-extra" appends an optional trailing-columns match. */
  trailing?: 'none' | 'optional-extra';
}

export interface TokenizeRegexLineKind {
  name: string;
  kind: 'regex';
  match: string;
  /** Capture group index (as string) -> TextMate scope base. */
  captures: Record<string, string>;
}

export type TokenizeLineKind = TokenizeColumnsLineKind | TokenizeRegexLineKind;

export interface TokenizeComment {
  match: string;
  scope: string;
}

export interface FormatTokenize {
  delimiter: 'tab' | 'whitespace';
  comment?: TokenizeComment;
  lineKinds: TokenizeLineKind[];
}

// ---- 3. VALIDATE (composes server/src/validationUtils.ts primitives) ----

export interface RuleSpecRef {
  href: string;
  summary: string;
  details?: string;
  example?: string;
}

interface ValidateRuleBase {
  /** Diagnostic code, e.g. "CHROMSIZES-001". */
  code: string;
  severity?: 'error' | 'warning';
  message: string;
  spec: RuleSpecRef;
  /** When true, the rule only runs at validation level "strict". */
  strict?: boolean;
}

export interface MinColumnsRule extends ValidateRuleBase {
  id: 'minColumns';
  min: number;
}

export interface ColumnRule extends ValidateRuleBase {
  id: 'column';
  /** 0-based column index. */
  column: number;
  name: string;
  type: 'int' | 'number' | 'enum' | 'regex';
  /** Inclusive lower bound for int/number. */
  min?: number;
  /** Inclusive upper bound for int/number. */
  max?: number;
  /** Allowed values for enum. */
  values?: string[];
  /** Regex (string form) for regex. */
  pattern?: string;
  /** Treat "." as a valid placeholder (skip the check). */
  allowDot?: boolean;
}

export interface CoordinatePairRule extends ValidateRuleBase {
  id: 'coordinatePair';
  /** 0-based column indices. */
  startColumn: number;
  endColumn: number;
  startName: string;
  endName: string;
  /** Allow start == end (default false: requires start < end). */
  allowEqual?: boolean;
}

export interface StrandRule extends ValidateRuleBase {
  id: 'strand';
  /** 0-based column index. */
  column: number;
  values: string[];
}

export type ValidateRule = MinColumnsRule | ColumnRule | CoordinatePairRule | StrandRule;

export interface FormatValidate {
  /** Line prefixes (besides "#") to skip during validation. */
  skipPrefixes?: string[];
  rules: ValidateRule[];
}

// ---- 4. RENDER (drives the generic declarative table) ----

export interface RenderColumn {
  key: string;
  label: string;
  type?: ColumnScalarType;
  width?: number;
}

export interface RenderNavigation {
  /** Render-column keys used to build a region link. */
  chromKey: string;
  startKey: string;
  endKey: string;
  /** Which column renders as the clickable link. */
  linkColumn: string;
}

export interface FormatRender {
  renderer: 'table';
  /** Comment-line prefixes to skip in the preview. */
  commentPrefixes?: string[];
  /** Additional non-data line prefixes to skip. */
  skipPrefixes?: string[];
  columns: RenderColumn[];
  navigation?: RenderNavigation | null;
}

// ---- The spec ----

export interface FormatSpec {
  specVersion: number;
  identity: FormatIdentity;
  tokenize: FormatTokenize;
  validate: FormatValidate;
  render: FormatRender;
}

/** The portion of a spec the webview needs to render a declarative table. */
export interface DeclarativeRenderSpec extends FormatRender {
  /** Human-readable format name for the preview header. */
  displayName: string;
  /** Column delimiter, carried over from `tokenize` so the webview can split rows. */
  delimiter: 'tab' | 'whitespace';
}
