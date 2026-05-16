# Configuration

## Validation

| Setting | Default | Description |
|---------|---------|-------------|
| `biofmt.validation.level` | `strict` | Validation strictness: `off`, `basic`, or `strict` |
| `biofmt.validation.maxDiagnostics` | `2000` | Maximum diagnostics reported per file |
| `biofmt.lsp.viewportBufferLines` | `500` | Number of lines around the cursor to validate |

## Previews

| Setting | Default | Description |
|---------|---------|-------------|
| `biofmt.preview.maxLines` | `200000` | Maximum lines loaded in preview |
| `biofmt.preview.maxBytes` | `52428800` | Maximum file size in bytes for preview, defaulting to 50 MB |
| `biofmt.preview.sampleColumnLimit` | `10` | VCF sample columns shown initially |
| `biofmt.preview.downsampleLimit` | `200000` | Track plot point limit before downsampling |
| `biofmt.preview.maxRegionRecords` | `10000` | Maximum records per region query for indexed files |

## Workspace Lint

| Setting | Default | Description |
|---------|---------|-------------|
| `biofmt.workspace.enableLint` | `false` | Validate all bioinformatics files in the workspace |
| `biofmt.workspace.maxFiles` | `100` | Maximum number of files to validate |
| `biofmt.workspace.maxFileSizeMB` | `10` | Maximum file size in MB for workspace validation |
